import { randomInt } from "crypto";
import type { PoolClient } from "pg";
import type {
  DiceRollRequest,
  DiceRollResult,
  DiceRollSubmission,
  GameMessage
} from "@/lib/game-types";
import { HttpError } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import { askDungeonMasterProvider } from "@/lib/dm-provider";
import {
  buildDungeonMasterPromptContext,
  runPostTurnContextJobs
} from "@/lib/prompt-context";
import {
  dungeonMasterInstructions,
  normalizeRollRequest,
  normalizeRollRequests,
  openingSceneRequest,
  parseHermesDmContract,
  titleFromSessionId
} from "@/lib/hermes";

const maxPlayers = 4;
const activeWindowMs = 120_000;

export type RoomPlayerStatus = "waiting" | "submitted";

export type RoomPlayer = {
  id: string;
  slot: number;
  username: string;
  characterName: string;
  characterSheet: string;
  status: RoomPlayerStatus;
  lastSeenAt: string;
};

export type RoomSnapshot = {
  roomId: string;
  mode: CampaignMode;
  sessionId: string;
  players: RoomPlayer[];
  messages: GameMessage[];
  isResolving: boolean;
  hasBegun: boolean;
  pendingRollRequest: DiceRollRequest | null;
  pendingRollRequests: DiceRollRequest[];
  updatedAt: string;
};

type NormalizedRollSubmission = {
  rollRequestId: string;
  rollResult?: DiceRollResult;
  clientMessageId?: string;
};

export type CampaignSummary = {
  id: string;
  hermesSessionId: string;
  mode: CampaignMode;
  title: string;
  preview?: string;
  time?: string;
  messageCount?: number;
  joinCode?: string;
};

export type CampaignMode = "single_player" | "multiplayer";

type CampaignRow = {
  id: string;
  hermes_session_id: string;
  mode: CampaignMode;
  title: string;
  status: "active" | "archived" | "deleted";
  has_begun: boolean;
  owner_user_id: string | null;
  owner_client_id: string | null;
  metadata: unknown;
  updated_at: Date | string;
  created_at: Date | string;
  display_character_name?: string | null;
  display_username?: string | null;
  join_code?: string | null;
};

type PlayerRow = {
  id: string;
  client_id: string;
  user_id: string | null;
  username: string;
  character_name: string;
  character_sheet: string;
  slot: number | null;
  status: "active" | "left" | "kicked";
  last_seen_at: Date | string;
};

type TurnRow = {
  id: string;
  campaign_id: string;
  status: "collecting" | "resolving" | "resolved" | "failed" | "cancelled";
  updated_at: Date | string;
};

type SubmissionRow = {
  player_id: string | null;
  client_id: string | null;
  username: string | null;
  character_name: string | null;
  content: string;
  created_at: Date | string;
};

type EventRow = {
  id: string;
  type: string;
  payload: unknown;
  created_at: Date | string;
};

type CampaignSettingSummary = {
  displayLocation?: string;
  worldName?: string;
  startingLocation?: string;
};

type CampaignOpeningMode = "single_player" | "multiplayer";

type CampaignOpeningStyle = {
  campaignGenre?: string;
  campaignGenrePromptBrief?: string;
  customWorldName?: string;
  customWorldDescription?: string;
};

type JoinCodeRow = {
  campaign_id: string;
  code: string;
  title: string;
  status: "active" | "archived" | "deleted";
  mode: CampaignMode;
  has_begun: boolean;
};

const joinCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function nowIso() {
  return new Date().toISOString();
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return nowIso();
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeJoinCode(code: string | undefined) {
  return (code ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function generateJoinCode() {
  return Array.from(
    { length: 6 },
    () => joinCodeAlphabet[randomInt(0, joinCodeAlphabet.length)]
  ).join("");
}

function formatTime(value: Date | string | undefined) {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function isPlayerRecentlySeen(player: Pick<PlayerRow, "last_seen_at">) {
  return Date.now() - new Date(player.last_seen_at).getTime() <= activeWindowMs;
}

function isProfileComplete(player: PlayerRow) {
  return Boolean(
    player.username.trim() &&
      player.character_name.trim() &&
      player.character_sheet.trim()
  );
}

function normalizeRollTarget(value: string | null | undefined) {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rollRequestTargetsPlayer(request: DiceRollRequest, player: PlayerRow) {
  const target = normalizeRollTarget(request.player);

  if (!target) {
    return true;
  }

  const playerNames = [player.username, player.character_name]
    .map(normalizeRollTarget)
    .filter((name): name is string => Boolean(name));

  return playerNames.some(
    (name) =>
      target === name ||
      target.includes(name) ||
      name.includes(target)
  );
}

function eventPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  return payload as Record<string, unknown>;
}

function metadataString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function campaignOpeningStyleFromMetadata(campaign: CampaignRow): CampaignOpeningStyle {
  const metadata = eventPayload(campaign.metadata);
  const genre = eventPayload(metadata.genre);

  return {
    campaignGenre: metadataString(genre.label),
    campaignGenrePromptBrief: metadataString(genre.promptBrief),
    customWorldName: metadataString(genre.customWorldName),
    customWorldDescription: metadataString(genre.customWorldDescription)
  };
}

function pendingRollRequestsFromCampaign(campaign: CampaignRow) {
  const metadata = eventPayload(campaign.metadata);
  const requests = normalizeRollRequests(metadata.pendingRollRequests);

  if (requests.length > 0) {
    return requests;
  }

  const legacyRequest = normalizeRollRequest(metadata.pendingRollRequest);
  return legacyRequest ? [legacyRequest] : [];
}

function modifierText(modifier: number | undefined) {
  if (!modifier) {
    return "";
  }

  return modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
}

function rollDiceExpression(dice: string, modifier: number | undefined) {
  const match = dice.trim().match(/^(\d*)d(\d+)$/i);

  if (!match) {
    throw new HttpError("The DM requested an unsupported dice roll.", 400);
  }

  const count = Number(match[1] || "1");
  const sides = Number(match[2]);

  if (
    !Number.isInteger(count) ||
    !Number.isInteger(sides) ||
    count < 1 ||
    count > 20 ||
    sides < 2 ||
    sides > 1000
  ) {
    throw new HttpError("The DM requested an unsupported dice roll.", 400);
  }

  const rolls = Array.from({ length: count }, () => randomInt(1, sides + 1));
  const total = rolls.reduce((sum, roll) => sum + roll, modifier ?? 0);

  return {
    rolls,
    total
  };
}

function validateRollSubmissionResult(
  request: DiceRollRequest,
  result: DiceRollResult | undefined
) {
  if (!result) {
    return rollDiceExpression(request.dice, request.modifier);
  }

  const match = request.dice.trim().match(/^(\d*)d(\d+)$/i);

  if (!match) {
    throw new HttpError("The DM requested an unsupported dice roll.", 400);
  }

  const count = Number(match[1] || "1");
  const sides = Number(match[2]);

  if (
    !Array.isArray(result.rolls) ||
    result.rolls.length !== count ||
    !result.rolls.every(
      (roll) => Number.isInteger(roll) && roll >= 1 && roll <= sides
    )
  ) {
    throw new HttpError("The submitted roll result is invalid.", 400);
  }

  const total = result.rolls.reduce(
    (sum, roll) => sum + roll,
    request.modifier ?? 0
  );

  if (result.total !== total) {
    throw new HttpError("The submitted roll total does not match the dice.", 400);
  }

  return result;
}

function formatRollSubmission(
  request: DiceRollRequest,
  submittedResult?: DiceRollResult
) {
  const result = validateRollSubmissionResult(request, submittedResult);
  const rollText =
    result.rolls.length === 1
      ? String(result.rolls[0])
      : result.rolls.join(", ");

  return `I rolled ${request.dice}${modifierText(request.modifier)}: ${
    result.total
  } (${rollText}) for ${request.label}.`;
}

function rollSubmissionsFromPayload(
  rollRequestId?: string,
  rollResult?: DiceRollResult,
  clientMessageId?: string,
  rollSubmissions?: DiceRollSubmission[]
) {
  const submittedRolls = rollSubmissions?.length
    ? rollSubmissions
    : rollRequestId
      ? [
          {
            rollRequestId,
            rollResult,
            clientMessageId
          }
        ]
      : [];

  return submittedRolls.map((submission) => ({
    rollRequestId: submission.rollRequestId?.trim() ?? "",
    rollResult: submission.rollResult,
    clientMessageId: submission.clientMessageId?.trim() || undefined
  }));
}

function validatePendingRollSubmissions(
  pendingRollRequests: DiceRollRequest[],
  submittedRolls: NormalizedRollSubmission[],
  player?: PlayerRow
) {
  if (submittedRolls.length === 0) {
    return {
      content: "",
      remainingRollRequests: pendingRollRequests,
      clientMessageId: undefined
    };
  }

  if (pendingRollRequests.length === 0) {
    throw new HttpError("There is no pending roll to resolve.", 400);
  }

  if (submittedRolls.length > pendingRollRequests.length) {
    throw new HttpError("Too many roll results were submitted.", 400);
  }

  const content = submittedRolls
    .map((submission, index) => {
      const pendingRollRequest = pendingRollRequests[index];

      if (!submission.rollRequestId) {
        throw new HttpError("A roll request id is required.", 400);
      }

      if (submission.rollRequestId !== pendingRollRequest.id) {
        throw new HttpError("The DM is waiting for the required roll.", 409);
      }

      if (player && !rollRequestTargetsPlayer(pendingRollRequest, player)) {
        throw new HttpError("That roll is waiting on another player.", 403);
      }

      return formatRollSubmission(pendingRollRequest, submission.rollResult);
    })
    .join("\n");

  return {
    content,
    remainingRollRequests: pendingRollRequests.slice(submittedRolls.length),
    clientMessageId: submittedRolls[0]?.clientMessageId
  };
}

function formatCanonicalCharacterContext(players: PlayerRow[]) {
  const playablePlayers = players.filter(isProfileComplete);

  if (playablePlayers.length === 0) {
    return "Canonical player characters:\nNo completed character sheets are available.";
  }

  return [
    "Canonical player characters:",
    "Use these website-owned character sheets when framing scenes, choosing checks and modifiers, judging character capabilities, and spotlighting class, species, background, or story hooks. If recent transcript context conflicts with these sheets, these sheets win.",
    "",
    ...playablePlayers.map((player, index) =>
      [
        `${index + 1}. ${player.username} playing ${player.character_name}`,
        "Character sheet:",
        player.character_sheet
      ].join("\n")
    )
  ].join("\n\n");
}

async function setPendingRollRequests(
  client: PoolClient,
  campaignId: string,
  requests: DiceRollRequest[]
) {
  const currentRequest = requests[0] ?? null;

  await client.query(
    `
      update campaigns
      set metadata = case
        when $2::jsonb = '[]'::jsonb then metadata - 'pendingRollRequest' - 'pendingRollRequests'
        else jsonb_set(
          jsonb_set(metadata, '{pendingRollRequest}', $3::jsonb, true),
          '{pendingRollRequests}',
          $2::jsonb,
          true
        )
      end
      where id = $1
    `,
    [campaignId, JSON.stringify(requests), JSON.stringify(currentRequest)]
  );
}

function rowToRoomPlayer(
  player: PlayerRow,
  submittedPlayerIds: Set<string>
): RoomPlayer {
  return {
    id: player.client_id,
    slot: player.slot ?? 0,
    username: player.username,
    characterName: player.character_name,
    characterSheet: player.character_sheet,
    status: submittedPlayerIds.has(player.id) ? "submitted" : "waiting",
    lastSeenAt: toIso(player.last_seen_at)
  };
}

function normalizeCampaignTitle(title: string | undefined, sessionId: string) {
  return title?.trim() || titleFromSessionId(sessionId) || "New Adventure";
}

function campaignWorldName(campaign: CampaignRow) {
  const metadata = eventPayload(campaign.metadata);
  const setting = eventPayload(metadata.setting);
  const genre = eventPayload(metadata.genre);
  const displayLocation =
    typeof setting.displayLocation === "string"
      ? setting.displayLocation.trim()
      : "";
  const startingLocation =
    typeof setting.startingLocation === "string"
      ? setting.startingLocation.trim()
      : "";
  const worldName =
    typeof setting.worldName === "string" ? setting.worldName.trim() : "";
  const customWorldName =
    typeof genre.customWorldName === "string" ? genre.customWorldName.trim() : "";

  return (
    displayLocation ||
    startingLocation ||
    worldName ||
    customWorldName ||
    campaign.title
  );
}

function settingMetadata(setting: CampaignSettingSummary | undefined) {
  const displayLocation = setting?.displayLocation?.trim();
  const worldName = setting?.worldName?.trim();
  const startingLocation = setting?.startingLocation?.trim();

  if (!displayLocation && !worldName && !startingLocation) {
    return {};
  }

  return {
    setting: {
      displayLocation: displayLocation || startingLocation || worldName || null,
      worldName: worldName || null,
      startingLocation: startingLocation || null
    }
  };
}

function campaignSummaryFromRow(campaign: CampaignRow): CampaignSummary {
  const characterName = campaign.display_character_name?.trim();
  const playerName = campaign.display_username?.trim();
  const joinCode = campaign.join_code?.trim();

  return {
    id: campaign.id,
    hermesSessionId: campaign.hermes_session_id,
    mode: campaign.mode,
    title: characterName || playerName || campaign.title,
    preview: campaignWorldName(campaign),
    messageCount: 0,
    ...(joinCode ? { joinCode } : {})
  };
}

async function logCampaignEvent(
  client: PoolClient,
  campaignId: string,
  type: string,
  payload: Record<string, unknown> = {}
) {
  const result = await client.query<{ id: string }>(
    "insert into campaign_events (campaign_id, type, payload) values ($1, $2, $3::jsonb) returning id",
    [campaignId, type, JSON.stringify(payload)]
  );

  return result.rows[0]?.id;
}

async function ensureCampaignJoinCode(
  client: PoolClient,
  campaignId: string,
  userId: string
) {
  const existing = await client.query<{ code: string }>(
    `
      select code
      from campaign_join_codes
      where campaign_id = $1 and enabled = true
      order by created_at desc
      limit 1
    `,
    [campaignId]
  );

  if (existing.rows[0]?.code) {
    return existing.rows[0].code;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateJoinCode();
    const inserted = await client.query<{ code: string }>(
      `
        insert into campaign_join_codes (campaign_id, code, created_by_user_id)
        values ($1, $2, $3)
        on conflict (code) do nothing
        returning code
      `,
      [campaignId, code, userId]
    );

    if (inserted.rows[0]?.code) {
      await logCampaignEvent(client, campaignId, "join_code_created", { code });
      return inserted.rows[0].code;
    }
  }

  throw new Error("A game code could not be generated.");
}

async function resolveCampaign(
  roomId: string,
  sessionId: string,
  client?: PoolClient
) {
  const statement = isUuid(roomId)
    ? `
        select *
        from campaigns
        where (id = $1 or hermes_session_id = $2)
          and status <> 'deleted'
        order by created_at desc
        limit 1
      `
    : `
        select *
        from campaigns
        where (hermes_session_id = $1 or hermes_session_id = $2)
          and status <> 'deleted'
        order by created_at desc
        limit 1
      `;
  const values = [roomId, sessionId];
  const result = client
    ? await client.query<CampaignRow>(statement, values)
    : await query<CampaignRow>(statement, values);

  return result.rows[0] ?? null;
}

async function assertCampaignAccessForUser(
  campaign: CampaignRow,
  userId: string,
  client?: PoolClient
) {
  if (campaign.owner_user_id === userId) {
    return;
  }

  const player = await getActivePlayerForUser(campaign.id, userId, client);

  if (!player) {
    throw new HttpError("You do not have access to that campaign.", 403);
  }
}

async function touchActivePlayersForUser(
  campaignId: string,
  userId: string,
  client?: PoolClient
) {
  const statement = `
    update players
    set last_seen_at = now()
    where campaign_id = $1
      and user_id = $2
      and status = 'active'
  `;
  const values = [campaignId, userId];

  if (client) {
    await client.query(statement, values);
    return;
  }

  await query(statement, values);
}

async function getActivePlayerForUser(
  campaignId: string,
  userId: string,
  client?: PoolClient
) {
  const result = client
    ? await client.query<PlayerRow>(
        `
          select *
          from players
          where campaign_id = $1
            and user_id = $2
            and status = 'active'
          order by created_at asc
          limit 1
        `,
        [campaignId, userId]
      )
    : await query<PlayerRow>(
        `
          select *
          from players
          where campaign_id = $1
            and user_id = $2
            and status = 'active'
          order by created_at asc
          limit 1
        `,
        [campaignId, userId]
      );

  return result.rows[0] ?? null;
}

async function getActiveRoomPlayerForUser(
  client: PoolClient,
  campaignId: string,
  clientId: string,
  userId: string
) {
  const result = await client.query<PlayerRow>(
    `
      select *
      from players
      where campaign_id = $1
        and client_id = $2
        and user_id = $3
        and status = 'active'
      limit 1
    `,
    [campaignId, clientId, userId]
  );

  return result.rows[0] ?? null;
}

function assertCampaignOwnerForUser(campaign: CampaignRow, userId: string) {
  if (campaign.owner_user_id !== userId) {
    throw new HttpError("Only the campaign owner can do that.", 403);
  }
}

async function ensureCollectingTurn(client: PoolClient, campaignId: string) {
  const existing = await client.query<TurnRow>(
    `
      select *
      from turns
      where campaign_id = $1 and status = 'collecting'
      order by created_at desc
      limit 1
    `,
    [campaignId]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await client.query<TurnRow>(
    `
      insert into turns (campaign_id, status)
      values ($1, 'collecting')
      returning *
    `,
    [campaignId]
  );

  await logCampaignEvent(client, campaignId, "turn_created", {
    turnId: created.rows[0].id
  });

  return created.rows[0];
}

async function getCurrentTurn(campaignId: string) {
  const result = await query<TurnRow>(
    `
      select *
      from turns
      where campaign_id = $1 and status in ('collecting', 'resolving')
      order by
        case status when 'resolving' then 0 else 1 end,
        created_at desc
      limit 1
    `,
    [campaignId]
  );

  return result.rows[0] ?? null;
}

async function getActivePlayers(campaignId: string) {
  const result = await query<PlayerRow>(
    `
      select *
      from players
      where campaign_id = $1 and status = 'active'
      order by slot asc nulls last, created_at asc
    `,
    [campaignId]
  );

  return result.rows.filter(isPlayerRecentlySeen);
}

async function getTurnSubmissions(turnId: string) {
  const result = await query<SubmissionRow>(
    `
      select
        submissions.player_id,
        players.client_id,
        players.username,
        players.character_name,
        submissions.content,
        submissions.created_at
      from submissions
      left join players on players.id = submissions.player_id
      where submissions.turn_id = $1 and submissions.status = 'submitted'
      order by submissions.created_at asc
    `,
    [turnId]
  );

  return result.rows;
}

async function getCampaignEventMessages(
  campaignId: string,
  limit = 30
): Promise<GameMessage[]> {
  const events = await query<EventRow>(
    `
      select id, type, payload, created_at
      from (
        select id, type, payload, created_at
        from campaign_events
        where campaign_id = $1
          and type in ('turn_submitted', 'turn_resolved', 'adventure_begun')
        order by created_at desc
        limit $2
      ) recent_events
      order by created_at asc
    `,
    [campaignId, limit]
  );

  return events.rows
    .map((event): GameMessage | null => {
      const payload = eventPayload(event.payload);
      const content = typeof payload.content === "string" ? payload.content : "";

      if (!content.trim()) {
        return null;
      }

      return {
        id: String(payload.messageId || event.id),
        role: payload.role === "player" ? "player" : "dm",
        content,
        createdAt: toIso(event.created_at)
      };
    })
    .filter((message): message is GameMessage => message !== null);
}

export async function listCampaignMessagesBySessionId(
  sessionId: string,
  limit = 100
) {
  const campaign = (
    await query<CampaignRow>(
      `
        select *
        from campaigns
        where hermes_session_id = $1 and status <> 'deleted'
        limit 1
      `,
      [sessionId]
    )
  ).rows[0];

  if (!campaign) {
    return [];
  }

  return getCampaignEventMessages(campaign.id, limit);
}

function formatCombinedTurn(players: PlayerRow[], submissions: SubmissionRow[]) {
  const submissionByPlayerId = new Map(
    submissions.map((submission) => [submission.player_id, submission])
  );

  return [
    formatCanonicalCharacterContext(players),
    "",
    "Current player actions:",
    "The party submits their turns at the same time. Resolve these player actions together as one D&D round.",
    "",
    ...players.map((player) => {
      const submission = submissionByPlayerId.get(player.id);
      const displayName = `${player.username} (${player.character_name})`;

      return `- ${displayName}: ${submission?.content ?? ""}`;
    })
  ].join("\n");
}

function formatOpeningSceneRequest(input: {
  mode: CampaignOpeningMode;
  players: PlayerRow[];
  style: CampaignOpeningStyle;
}) {
  const modeDirection =
    input.mode === "single_player"
      ? "This is a singleplayer campaign. Spotlight the solo character directly and make the first choice immediately actionable for one player."
      : "This is a multiplayer campaign. Give the whole party one shared immediate situation; do not over-focus on only one character.";
  const customWorldName = input.style.customWorldName
    ? `World name: ${input.style.customWorldName}`
    : "";
  const customWorldDescription = input.style.customWorldDescription
    ? `Custom world description: ${input.style.customWorldDescription}`
    : "";

  return [
    formatCanonicalCharacterContext(input.players),
    "",
    "Current player action:",
    openingSceneRequest,
    "",
    "Campaign opening setup:",
    `Mode: ${input.mode}`,
    `Party size: ${input.players.length}`,
    input.style.campaignGenre ? `Campaign genre: ${input.style.campaignGenre}` : "",
    input.style.campaignGenrePromptBrief
      ? `Campaign genre guidance: ${input.style.campaignGenrePromptBrief}`
      : "",
    customWorldName,
    customWorldDescription,
    "",
    "Opening scene quality bar:",
    "Write 3-6 rich paragraphs with concrete sensory detail, spatial clarity, an immediate tension, and clear interactable choices.",
    "Begin in the fiction immediately; do not ask what kind of world the players want.",
    "Return no player-facing roll requests unless danger or uncertainty already requires dice before the players can act.",
    "End with a direct player-facing prompt such as 'What do you do?'",
    modeDirection
  ]
    .filter(Boolean)
    .join("\n");
}

function openingSceneInstructions(mode: CampaignOpeningMode) {
  const modeDirection =
    mode === "single_player"
      ? "The website has provided the solo player's character setup."
      : "The website has provided the full current party.";

  return [
    dungeonMasterInstructions,
    modeDirection,
    "Use the campaign setup and canonical character sheets to begin with a rich opening scene that naturally matters to the character or party. Do not mention implementation details."
  ].join(" ");
}

function formatSoloTurn(player: PlayerRow, content: string) {
  return [
    formatCanonicalCharacterContext([player]),
    "",
    "Current player action:",
    `${player.username} (${player.character_name}): ${content}`
  ].join("\n");
}

async function askDungeonMaster(
  campaign: Pick<CampaignRow, "id" | "hermes_session_id">,
  message: string,
  instructions: string,
  includeHistory = true,
  turnId?: string
) {
  const promptContext = includeHistory
    ? await buildDungeonMasterPromptContext({
        campaignId: campaign.id,
        turnId,
        currentAction: message,
        baseInstructions: instructions
      })
    : null;
  const providerData = await askDungeonMasterProvider({
    message: promptContext?.message ?? message,
    instructions: promptContext?.instructions ?? instructions,
    history: includeHistory && !promptContext
      ? await getCampaignEventMessages(campaign.id)
      : []
  });
  const contract = parseHermesDmContract(providerData.content);
  const reply = contract.publicNarration;

  if (!reply) {
    throw new Error("The DM provider returned an empty reply.");
  }

  return {
    id: providerData.id,
    content: reply,
    rollRequests: contract.rollRequests,
    setting: contract.setting
  };
}

function schedulePostTurnContextJobs(input: {
  campaignId: string;
  turnId: string;
  currentAction: string;
  dmResponse: string;
  dmEventId?: string;
  rollRequests?: DiceRollRequest[];
}) {
  void runPostTurnContextJobs(input).catch((error) => {
    console.error("Prompt context jobs failed.", error);
  });
}

async function buildSnapshot(campaign: CampaignRow): Promise<RoomSnapshot> {
  const currentTurn = await getCurrentTurn(campaign.id);
  const submissions = currentTurn ? await getTurnSubmissions(currentTurn.id) : [];
  const submittedPlayerIds = new Set(
    submissions
      .map((submission) => submission.player_id)
      .filter((playerId): playerId is string => Boolean(playerId))
  );
  const playersResult = await query<PlayerRow>(
    `
      select *
      from players
      where campaign_id = $1 and status = 'active'
      order by slot asc nulls last, created_at asc
    `,
    [campaign.id]
  );
  const players = playersResult.rows
    .filter(isPlayerRecentlySeen)
    .map((player) => rowToRoomPlayer(player, submittedPlayerIds));
  const events = await query<EventRow>(
    `
      select id, type, payload, created_at
      from (
        select id, type, payload, created_at
        from campaign_events
        where campaign_id = $1
          and type in ('turn_submitted', 'turn_resolved', 'adventure_begun')
        order by created_at desc
        limit 100
      ) recent_events
      order by created_at asc
    `,
    [campaign.id]
  );
  const messages = events.rows
    .map((event): GameMessage | null => {
      const payload = eventPayload(event.payload);
      const content = typeof payload.content === "string" ? payload.content : "";

      if (!content.trim()) {
        return null;
      }

      const role = payload.role === "player" ? "player" : "dm";

      return {
        id: String(payload.messageId || event.id),
        role,
        content,
        createdAt: toIso(event.created_at)
      };
    })
    .filter((message): message is GameMessage => message !== null);

  const pendingRollRequests = pendingRollRequestsFromCampaign(campaign);

  return {
    roomId: campaign.id,
    mode: campaign.mode,
    sessionId: campaign.hermes_session_id,
    players,
    messages,
    isResolving: currentTurn?.status === "resolving",
    hasBegun: campaign.has_begun,
    pendingRollRequest: pendingRollRequests[0] ?? null,
    pendingRollRequests,
    updatedAt: toIso(campaign.updated_at)
  };
}

async function markTurnFailed(turnId: string, error: unknown) {
  await query(
    `
      update turns
      set status = 'failed', error = $2
      where id = $1
    `,
    [turnId, error instanceof Error ? error.message : "DM provider call failed."]
  );
}

async function finishResolvedTurn(
  campaignId: string,
  turnId: string,
  hermesMessageId: string | undefined,
  reply: string,
  eventType: "adventure_begun" | "turn_resolved",
  pendingRollRequests: DiceRollRequest[] = [],
  setting?: CampaignSettingSummary
) {
  const currentPendingRollRequest = pendingRollRequests[0] ?? null;
  const settingPatch = settingMetadata(setting);
  let dmEventId: string | undefined;

  await withTransaction(async (client) => {
    await client.query(
      `
        update turns
        set status = 'resolved', hermes_message_id = $2, resolved_at = now(), error = null
        where id = $1
      `,
      [turnId, hermesMessageId ?? null]
    );
    await client.query(
      `
        update submissions
        set status = 'included_in_turn'
        where turn_id = $1 and status = 'submitted'
      `,
      [turnId]
    );
    dmEventId = await logCampaignEvent(client, campaignId, eventType, {
      turnId,
      hermesMessageId,
      messageId: hermesMessageId ?? crypto.randomUUID(),
      role: "dm",
      content: reply,
      ...settingPatch,
      pendingRollRequest: currentPendingRollRequest,
      pendingRollRequests
    });
    if (eventType === "adventure_begun" && Object.keys(settingPatch).length > 0) {
      await client.query(
        `
          update campaigns
          set metadata = metadata || $2::jsonb
          where id = $1
        `,
        [campaignId, JSON.stringify(settingPatch)]
      );
    }
    await setPendingRollRequests(client, campaignId, pendingRollRequests);
    await ensureCollectingTurn(client, campaignId);
  });

  return { dmEventId };
}

async function maybeResolveTurn(
  campaign: CampaignRow,
  turn: TurnRow,
  force = false
) {
  const activePlayers = (await getActivePlayers(campaign.id)).filter(isProfileComplete);
  const submissions = await getTurnSubmissions(turn.id);
  const submittedPlayerIds = new Set(submissions.map((submission) => submission.player_id));

  if (
    activePlayers.length === 0 ||
    (!force &&
      activePlayers.some((player) => !submittedPlayerIds.has(player.id)))
  ) {
    return false;
  }

  const claimedTurn = await query<TurnRow>(
    `
      update turns
      set status = 'resolving'
      where id = $1 and status = 'collecting'
      returning *
    `,
    [turn.id]
  );

  if (!claimedTurn.rows[0]) {
    return false;
  }

  await query(
    `
      insert into campaign_events (campaign_id, type, payload)
      values ($1, 'turn_resolving', $2::jsonb)
    `,
    [campaign.id, JSON.stringify({ turnId: turn.id })]
  );

  try {
    const currentAction = formatCombinedTurn(activePlayers, submissions);
    const reply = await askDungeonMaster(
      campaign,
      currentAction,
      dungeonMasterInstructions,
      true,
      turn.id
    );

    const resolvedTurn = await finishResolvedTurn(
      campaign.id,
      turn.id,
      reply.id,
      reply.content,
      "turn_resolved",
      reply.rollRequests
    );
    schedulePostTurnContextJobs({
      campaignId: campaign.id,
      turnId: turn.id,
      currentAction,
      dmResponse: reply.content,
      dmEventId: resolvedTurn.dmEventId,
      rollRequests: reply.rollRequests
    });
    return true;
  } catch (error) {
    await markTurnFailed(turn.id, error);
    await query(
      `
        insert into campaign_events (campaign_id, type, payload)
        values ($1, 'turn_failed', $2::jsonb)
      `,
      [
        campaign.id,
        JSON.stringify({
          turnId: turn.id,
          error: error instanceof Error ? error.message : "DM provider call failed."
        })
      ]
    );
    throw error;
  }
}

export async function createCampaignForHermesSession(
  sessionId: string,
  title?: string,
  ownerClientId?: string,
  ownerUserId?: string,
  mode: CampaignMode = "multiplayer"
) {
  const campaign = await withTransaction(async (client) => {
    const result = await client.query<CampaignRow>(
      `
        insert into campaigns (hermes_session_id, title, owner_client_id, owner_user_id, mode)
        values ($1, $2, $3, $4, $5)
        on conflict (hermes_session_id) do update
        set title = excluded.title,
            mode = excluded.mode,
            status = 'active',
            deleted_at = null,
            owner_client_id = coalesce(campaigns.owner_client_id, excluded.owner_client_id),
            owner_user_id = coalesce(campaigns.owner_user_id, excluded.owner_user_id)
        returning *
      `,
      [
        sessionId,
        normalizeCampaignTitle(title, sessionId),
        ownerClientId ?? null,
        ownerUserId ?? null,
        mode
      ]
    );
    const row = result.rows[0];
    await ensureCollectingTurn(client, row.id);
    await logCampaignEvent(client, row.id, "campaign_created", {
      hermesSessionId: sessionId
    });
    return row;
  });

  return campaign;
}

export async function listCampaignSummaries(userId: string) {
  const result = await query<CampaignRow>(
    `
      select
        campaigns.*,
        display_player.character_name as display_character_name,
        display_player.username as display_username,
        join_code.code as join_code
      from campaigns
      left join lateral (
        select players.character_name, players.username
        from players
        where players.campaign_id = campaigns.id
          and players.status = 'active'
        order by
          (players.user_id = $1) desc,
          players.slot asc nulls last,
          players.created_at asc
        limit 1
      ) display_player on true
      left join lateral (
        select campaign_join_codes.code
        from campaign_join_codes
        where campaign_join_codes.campaign_id = campaigns.id
          and campaign_join_codes.enabled = true
          and campaigns.owner_user_id = $4
        order by campaign_join_codes.created_at desc
        limit 1
      ) join_code on true
      where campaigns.status = 'active'
        and (
          campaigns.owner_user_id = $2
          or exists (
            select 1
            from players access_player
            where access_player.campaign_id = campaigns.id
              and access_player.user_id = $3
              and access_player.status = 'active'
          )
        )
      order by campaigns.updated_at desc, campaigns.created_at desc
      limit 100
    `,
    [userId, userId, userId, userId]
  );

  return result.rows.map(
    (campaign): CampaignSummary => campaignSummaryFromRow(campaign)
  );
}

export async function getCampaignById(campaignId: string, userId: string) {
  const result = await query<CampaignRow>(
    `
      select *
      from campaigns
      where id = $1 and status <> 'deleted'
      limit 1
    `,
    [campaignId]
  );
  const campaign = result.rows[0];

  if (!campaign) {
    throw new HttpError("Campaign not found.", 404);
  }

  await assertCampaignAccessForUser(campaign, userId);

  return campaignSummaryFromRow(campaign);
}

export async function archiveCampaignById(campaignId: string, userId: string) {
  const result = await query<CampaignRow>(
    `
      update campaigns
      set status = 'archived', deleted_at = now()
      where id = $1
        and owner_user_id = $2
        and status <> 'deleted'
      returning *
    `,
    [campaignId, userId]
  );

  if (!result.rows[0]) {
    throw new HttpError("Adventure could not be archived.", 403);
  }

  return result.rows[0];
}

export async function renameCampaignById(
  campaignId: string,
  title: string,
  userId: string
) {
  const result = await query<CampaignRow>(
    `
      update campaigns
      set title = $2
      where id = $1
        and owner_user_id = $3
        and status = 'active'
      returning *
    `,
    [campaignId, title, userId]
  );

  if (!result.rows[0]) {
    throw new HttpError("Campaign could not be renamed.", 403);
  }

  await query(
    `
      insert into campaign_events (campaign_id, type, payload)
      values ($1, 'campaign_renamed', $2::jsonb)
    `,
    [result.rows[0].id, JSON.stringify({ title })]
  );

  return campaignSummaryFromRow(result.rows[0]);
}

export async function createCampaignForMode(input: {
  mode: CampaignMode;
  title: string;
  campaignGenre?: string;
  campaignGenreKind?: "preset" | "custom";
  campaignGenrePresetId?: string;
  campaignGenrePromptBrief?: string;
  customWorldName?: string;
  customWorldDescription?: string;
  ownerClientId?: string;
  playerName: string;
  characterName?: string;
  characterSheet?: string;
  userId: string;
}) {
  const sessionId = `ai-dnd-${crypto.randomUUID()}`;

  if (input.mode === "multiplayer") {
    const genreMetadata = {
      genre: {
        kind: input.campaignGenreKind ?? "preset",
        presetId: input.campaignGenrePresetId ?? null,
        label: input.campaignGenre ?? null,
        promptBrief: input.campaignGenrePromptBrief ?? null,
        customWorldName: input.customWorldName ?? null,
        customWorldDescription: input.customWorldDescription ?? null
      }
    };
    const campaign = await createCampaignForHermesSession(
      sessionId,
      input.title,
      input.ownerClientId,
      input.userId,
      "multiplayer"
    );

    const joinCode = await withTransaction(async (client) => {
      await client.query(
        `
          update campaigns
          set metadata = metadata || $2::jsonb
          where id = $1
        `,
        [
          campaign.id,
          JSON.stringify(genreMetadata)
        ]
      );
      await client.query(
        `
          insert into players (
            campaign_id,
            client_id,
            user_id,
            username,
            character_name,
            character_sheet,
            slot,
            status,
            last_seen_at
          )
          values ($1, $2, $3, $4, $5, $6, 0, 'active', now())
          on conflict (campaign_id, client_id) do update
          set username = excluded.username,
              character_name = excluded.character_name,
              character_sheet = excluded.character_sheet,
              user_id = coalesce(players.user_id, excluded.user_id),
              status = 'active',
              kicked_at = null,
              last_seen_at = now()
        `,
        [
          campaign.id,
          input.ownerClientId ?? input.userId,
          input.userId,
          input.playerName,
          input.characterName ?? "",
          input.characterSheet ?? ""
        ]
      );
      await logCampaignEvent(client, campaign.id, "player_joined", {
        clientId: input.ownerClientId ?? input.userId,
        username: input.playerName,
        characterName: input.characterName ?? "",
        slot: 0,
        genre: input.campaignGenre,
        genreKind: input.campaignGenreKind ?? "preset"
      });
      return ensureCampaignJoinCode(client, campaign.id, input.userId);
    });

    return campaignSummaryFromRow({
      ...campaign,
      metadata: genreMetadata,
      display_character_name: input.characterName ?? "",
      display_username: input.playerName,
      join_code: joinCode
    });
  }

  const soloState = await withTransaction(async (client) => {
    const genreMetadata = {
      genre: {
        kind: input.campaignGenreKind ?? "preset",
        presetId: input.campaignGenrePresetId ?? null,
        label: input.campaignGenre ?? null,
        promptBrief: input.campaignGenrePromptBrief ?? null,
        customWorldName: input.customWorldName ?? null,
        customWorldDescription: input.customWorldDescription ?? null
      }
    };
    const inserted = await client.query<CampaignRow>(
      `
        insert into campaigns (
          hermes_session_id,
          title,
          mode,
          has_begun,
          owner_client_id,
          owner_user_id,
          metadata
        )
        values ($1, $2, 'single_player', false, $3, $4, $5::jsonb)
        returning *
      `,
      [
        sessionId,
        normalizeCampaignTitle(input.title, sessionId),
        input.ownerClientId ?? null,
        input.userId,
        JSON.stringify(genreMetadata)
      ]
    );
    const campaignRow = inserted.rows[0];
    const player = await client.query<PlayerRow>(
      `
        insert into players (
          campaign_id,
          client_id,
          user_id,
          username,
          character_name,
          character_sheet,
          slot,
          status,
          last_seen_at
        )
        values ($1, $2, $3, $4, $5, $6, 0, 'active', now())
        returning *
      `,
      [
        campaignRow.id,
        input.ownerClientId ?? input.userId,
        input.userId,
        input.playerName,
        input.characterName || input.playerName,
        input.characterSheet || "Quick fantasy adventurer template."
      ]
    );
    const turn = await ensureCollectingTurn(client, campaignRow.id);

    await logCampaignEvent(client, campaignRow.id, "campaign_created", {
      hermesSessionId: sessionId,
      mode: "single_player",
      genre: input.campaignGenre,
      genreKind: input.campaignGenreKind ?? "preset"
    });
    await logCampaignEvent(client, campaignRow.id, "player_joined", {
      clientId: player.rows[0].client_id,
      username: player.rows[0].username,
      characterName: player.rows[0].character_name,
      slot: 0
    });
    const claimedTurn = await client.query<TurnRow>(
      `
        update turns
        set status = 'resolving'
        where id = $1 and status = 'collecting'
        returning *
      `,
      [turn.id]
    );

    if (!claimedTurn.rows[0]) {
      throw new Error("The opening turn could not be claimed.");
    }

    await logCampaignEvent(client, campaignRow.id, "turn_resolving", {
      turnId: turn.id,
      reason: "adventure_begun"
    });

    return {
      campaign: {
        ...campaignRow,
        metadata: genreMetadata,
        display_character_name: player.rows[0].character_name,
        display_username: player.rows[0].username
      },
      player: player.rows[0],
      turn: claimedTurn.rows[0]
    };
  });

  const soloOpeningAction = formatOpeningSceneRequest({
    mode: "single_player",
    players: [soloState.player],
    style: {
      campaignGenre: input.campaignGenre,
      campaignGenrePromptBrief: input.campaignGenrePromptBrief,
      customWorldName: input.customWorldName,
      customWorldDescription: input.customWorldDescription
    }
  });

  try {
    const opening = await askDungeonMaster(
      soloState.campaign,
      soloOpeningAction,
      openingSceneInstructions("single_player"),
      true,
      soloState.turn.id
    );
    const resolvedTurn = await finishResolvedTurn(
      soloState.campaign.id,
      soloState.turn.id,
      opening.id,
      opening.content,
      "adventure_begun",
      opening.rollRequests,
      opening.setting
    );
    await query("update campaigns set has_begun = true where id = $1", [
      soloState.campaign.id
    ]);

    schedulePostTurnContextJobs({
      campaignId: soloState.campaign.id,
      turnId: soloState.turn.id,
      dmEventId: resolvedTurn.dmEventId,
      currentAction: soloOpeningAction,
      dmResponse: opening.content,
      rollRequests: opening.rollRequests
    });

    const updatedCampaign = await resolveCampaign(
      soloState.campaign.id,
      soloState.campaign.hermes_session_id
    );

    return campaignSummaryFromRow(updatedCampaign ?? soloState.campaign);
  } catch (error) {
    await markTurnFailed(soloState.turn.id, error);
    throw error;
  }
}

export async function previewCampaignJoinByCode(gameCode: string) {
  const code = normalizeJoinCode(gameCode);

  if (!code) {
    throw new HttpError("Enter a game code.", 400);
  }

  const result = await query<
    JoinCodeRow & {
      active_players: string | number;
    }
  >(
    `
      select
        campaigns.id as campaign_id,
        campaign_join_codes.code,
        campaigns.title,
        campaigns.status,
        campaigns.mode,
        campaigns.has_begun,
        count(players.id) filter (where players.status = 'active') as active_players
      from campaign_join_codes
      join campaigns on campaigns.id = campaign_join_codes.campaign_id
      left join players on players.campaign_id = campaigns.id
      where campaign_join_codes.code = $1
        and campaign_join_codes.enabled = true
      group by campaigns.id, campaign_join_codes.code
      limit 1
    `,
    [code]
  );
  const campaign = result.rows[0];

  if (!campaign || campaign.status !== "active" || campaign.mode !== "multiplayer") {
    throw new HttpError("That game code was not found.", 404);
  }

  const activePlayers = Number(campaign.active_players);
  const availableSlots = Math.max(0, maxPlayers - activePlayers);

  if (availableSlots <= 0) {
    throw new HttpError("That game is already full.", 409);
  }

  return {
    code: campaign.code,
    campaignTitle: campaign.title,
    availableSlots,
    hasBegun: campaign.has_begun
  };
}

export async function joinCampaignByCode(input: {
  gameCode: string;
  clientId: string;
  username: string;
  characterName: string;
  characterSheet: string;
  userId: string;
}) {
  const code = normalizeJoinCode(input.gameCode);
  const clientId = input.clientId.trim();
  const username = input.username.trim();
  const characterName = input.characterName.trim();
  const characterSheet = input.characterSheet.trim();

  if (!code) {
    throw new HttpError("Enter a game code.", 400);
  }

  if (!clientId || !username || !characterName || !characterSheet) {
    throw new HttpError("Complete your player profile before joining.", 400);
  }

  const campaign = await withTransaction(async (client) => {
    const codeResult = await client.query<CampaignRow & { join_code: string }>(
      `
        select campaigns.*, campaign_join_codes.code as join_code
        from campaign_join_codes
        join campaigns on campaigns.id = campaign_join_codes.campaign_id
        where campaign_join_codes.code = $1
          and campaign_join_codes.enabled = true
          and campaigns.status = 'active'
          and campaigns.mode = 'multiplayer'
        limit 1
        for update of campaigns
      `,
      [code]
    );
    const campaignRow = codeResult.rows[0];

    if (!campaignRow) {
      throw new HttpError("That game code was not found.", 404);
    }

    const existingForUser = await client.query<PlayerRow>(
      `
        select *
        from players
        where campaign_id = $1 and user_id = $2
        order by
          (status = 'active') desc,
          created_at asc
        limit 1
      `,
      [campaignRow.id, input.userId]
    );
    const userPlayer = existingForUser.rows[0];

    if (userPlayer?.status === "kicked") {
      throw new HttpError("You cannot join this game.", 403);
    }

    const existingForClient = await client.query<PlayerRow>(
      `
        select *
        from players
        where campaign_id = $1 and client_id = $2
        limit 1
      `,
      [campaignRow.id, clientId]
    );
    const clientPlayer = existingForClient.rows[0];

    if (clientPlayer?.status === "kicked") {
      throw new HttpError("You cannot join this game from this device.", 403);
    }

    if (
      clientPlayer &&
      clientPlayer.user_id &&
      clientPlayer.user_id !== input.userId
    ) {
      throw new HttpError("This browser is already joined to that game.", 409);
    }

    const slotResult = await client.query<{ slot: number }>(
      `
        select slot
        from players
        where campaign_id = $1 and status <> 'kicked' and slot is not null
        order by slot asc
      `,
      [campaignRow.id]
    );
    const usedSlots = new Set(slotResult.rows.map((row) => row.slot));
    const existingSlot = userPlayer?.slot ?? clientPlayer?.slot ?? undefined;
    const firstOpenSlot = Array.from({ length: maxPlayers }, (_, slot) => slot).find(
      (slot) => !usedSlots.has(slot)
    );
    const slot = existingSlot ?? firstOpenSlot;

    if (slot === undefined) {
      throw new HttpError("That game is already full.", 409);
    }

    if (userPlayer?.status === "active") {
      await client.query(
        `
          update players
          set client_id = $2,
              username = $3,
              character_name = $4,
              character_sheet = $5,
              slot = $6,
              last_seen_at = now()
          where id = $1
        `,
        [userPlayer.id, clientId, username, characterName, characterSheet, slot]
      );
      await logCampaignEvent(client, campaignRow.id, "player_profile_updated_by_code", {
        clientId,
        username,
        characterName,
        slot
      });
      return campaignRow;
    }

    await client.query(
      `
        insert into players (
          campaign_id,
          client_id,
          user_id,
          username,
          character_name,
          character_sheet,
          slot,
          status,
          last_seen_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'active', now())
        on conflict (campaign_id, client_id) do update
        set user_id = excluded.user_id,
            username = excluded.username,
            character_name = excluded.character_name,
            character_sheet = excluded.character_sheet,
            slot = excluded.slot,
            status = 'active',
            kicked_at = null,
            last_seen_at = now()
      `,
      [
        campaignRow.id,
        clientId,
        input.userId,
        username,
        characterName,
        characterSheet,
        slot
      ]
    );
    await logCampaignEvent(client, campaignRow.id, "player_joined_by_code", {
      clientId,
      username,
      characterName,
      slot
    });

    return campaignRow;
  });

  return campaignSummaryFromRow({
    ...campaign,
    display_character_name: characterName,
    display_username: username,
    join_code: undefined
  });
}

export async function claimGuestStateForUser(clientId: string, userId: string) {
  return withTransaction(async (client) => {
    const claimedCampaigns = await client.query<CampaignRow>(
      `
        update campaigns
        set owner_user_id = $2
        where owner_client_id = $1
          and owner_user_id is null
          and status <> 'deleted'
        returning *
      `,
      [clientId, userId]
    );
    const claimedPlayers = await client.query<{ id: string }>(
      `
        update players
        set user_id = $2
        where client_id = $1
          and user_id is null
          and status = 'active'
        returning id
      `,
      [clientId, userId]
    );

    for (const campaign of claimedCampaigns.rows) {
      await logCampaignEvent(client, campaign.id, "guest_state_claimed", {
        clientId,
        userId
      });
    }

    return {
      claimedCampaigns: claimedCampaigns.rowCount ?? 0,
      claimedPlayers: claimedPlayers.rowCount ?? 0
    };
  });
}

export async function archiveCampaignBySessionId(sessionId: string, userId: string) {
  const result = await query<CampaignRow>(
    `
      update campaigns
      set status = 'archived', deleted_at = now()
      where hermes_session_id = $1
        and owner_user_id = $2
        and status <> 'deleted'
      returning *
    `,
    [sessionId, userId]
  );

  if (!result.rows[0]) {
    throw new HttpError("Adventure could not be archived.", 403);
  }
}

export async function renameCampaignBySessionId(
  sessionId: string,
  title: string,
  userId: string
) {
  const result = await query<CampaignRow>(
    `
      update campaigns
      set title = $2
      where hermes_session_id = $1
        and owner_user_id = $3
        and status = 'active'
      returning *
    `,
    [sessionId, title, userId]
  );

  if (!result.rows[0]) {
    throw new Error("Campaign could not be renamed.");
  }

  await query(
    `
      insert into campaign_events (campaign_id, type, payload)
      values ($1, 'campaign_renamed', $2::jsonb)
    `,
    [result.rows[0].id, JSON.stringify({ title })]
  );

  return result.rows[0];
}

export async function getRoom(roomId: string, sessionId: string, userId: string) {
  let campaign = await resolveCampaign(roomId, sessionId);

  if (!campaign) {
    campaign = await createCampaignForHermesSession(
      sessionId,
      undefined,
      undefined,
      userId
    );
  } else {
    await assertCampaignAccessForUser(campaign, userId);
  }

  await touchActivePlayersForUser(campaign.id, userId);

  return buildSnapshot(campaign);
}

export async function registerRoomPlayer(
  roomId: string,
  sessionId: string,
  profile: {
    playerId: string;
    username: string;
    characterName: string;
    characterSheet: string;
  },
  userId?: string
) {
  const campaign = await withTransaction(async (client) => {
    const resolved = await resolveCampaign(roomId, sessionId, client);
    const campaignRow =
      resolved ??
      (await createCampaignForHermesSession(
        sessionId,
        undefined,
        profile.playerId,
        userId
      ));

    if (userId) {
      await assertCampaignAccessForUser(campaignRow, userId, client);
    }
    const existing = await client.query<PlayerRow>(
      `
        select *
        from players
        where campaign_id = $1 and client_id = $2
        limit 1
      `,
      [campaignRow.id, profile.playerId]
    );
    const slotResult = await client.query<{ slot: number }>(
      `
        select slot
        from players
        where campaign_id = $1 and status <> 'kicked' and slot is not null
        order by slot asc
      `,
      [campaignRow.id]
    );
    const usedSlots = new Set(slotResult.rows.map((row) => row.slot));
    const firstOpenSlot = Array.from({ length: maxPlayers }, (_, slot) => slot).find(
      (slot) => !usedSlots.has(slot)
    );
    const slot = existing.rows[0]?.slot ?? firstOpenSlot;

    if (slot === undefined) {
      throw new Error("The room already has four active players.");
    }

    const wasJoined = !existing.rows[0];
    await client.query(
      `
        insert into players (
          campaign_id,
          client_id,
          username,
          character_name,
          character_sheet,
          user_id,
          slot,
          status,
          last_seen_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'active', now())
        on conflict (campaign_id, client_id) do update
        set username = excluded.username,
            character_name = excluded.character_name,
            character_sheet = excluded.character_sheet,
            user_id = coalesce(players.user_id, excluded.user_id),
            status = 'active',
            kicked_at = null,
            last_seen_at = now()
      `,
      [
        campaignRow.id,
        profile.playerId,
        profile.username,
        profile.characterName,
        profile.characterSheet,
        userId ?? null,
        slot
      ]
    );
    await logCampaignEvent(
      client,
      campaignRow.id,
      wasJoined ? "player_joined" : "profile_updated",
      {
        clientId: profile.playerId,
        username: profile.username,
        characterName: profile.characterName,
        slot
      }
    );
    return campaignRow;
  });

  return buildSnapshot(campaign);
}

export async function kickRoomPlayer(
  roomId: string,
  sessionId: string,
  playerId: string,
  userId: string
) {
  const campaign = await resolveCampaign(roomId, sessionId);

  if (!campaign) {
    throw new Error("Campaign not found.");
  }

  assertCampaignOwnerForUser(campaign, userId);

  await withTransaction(async (client) => {
    const player = await client.query<PlayerRow>(
      `
        update players
        set status = 'kicked', kicked_at = now()
        where campaign_id = $1 and client_id = $2
        returning *
      `,
      [campaign.id, playerId]
    );

    await client.query(
      `
        update submissions
        set status = 'cancelled'
        where campaign_id = $1 and player_id = $2 and status = 'submitted'
      `,
      [campaign.id, player.rows[0]?.id ?? null]
    );
    await logCampaignEvent(client, campaign.id, "player_kicked", {
      clientId: playerId
    });
  });

  return buildSnapshot(campaign);
}

export async function beginRoomAdventure(
  roomId: string,
  sessionId: string,
  userId: string
) {
  const beginState = await withTransaction(async (client) => {
    const campaign = await resolveCampaign(roomId, sessionId, client);

    if (!campaign) {
      throw new Error("Campaign not found.");
    }

    assertCampaignOwnerForUser(campaign, userId);

    const locked = await client.query<CampaignRow>(
      "select * from campaigns where id = $1 for update",
      [campaign.id]
    );
    const lockedCampaign = locked.rows[0];

    if (lockedCampaign.has_begun) {
      return { campaign: lockedCampaign, turn: null, players: [] as PlayerRow[] };
    }

    const players = (
      await client.query<PlayerRow>(
        `
          select *
          from players
          where campaign_id = $1 and status = 'active'
          order by slot asc nulls last, created_at asc
        `,
        [lockedCampaign.id]
      )
    ).rows.filter(isPlayerRecentlySeen);
    const usablePlayers = players.filter(isProfileComplete);

    if (usablePlayers.length < 2) {
      throw new Error("At least two players are needed to begin the adventure.");
    }

    const turn = await ensureCollectingTurn(client, lockedCampaign.id);
    const claimedTurn = await client.query<TurnRow>(
      `
        update turns
        set status = 'resolving'
        where id = $1 and status = 'collecting'
        returning *
      `,
      [turn.id]
    );

    if (!claimedTurn.rows[0]) {
      return { campaign: lockedCampaign, turn: null, players: [] as PlayerRow[] };
    }

    const begun = await client.query<CampaignRow>(
      `
        update campaigns
        set has_begun = true
        where id = $1 and has_begun = false
        returning *
      `,
      [lockedCampaign.id]
    );
    await logCampaignEvent(client, lockedCampaign.id, "turn_resolving", {
      turnId: turn.id,
      reason: "adventure_begun"
    });

    return {
      campaign: begun.rows[0],
      turn: claimedTurn.rows[0],
      players: usablePlayers
    };
  });

  if (!beginState.turn) {
    return buildSnapshot(beginState.campaign);
  }

  try {
    const currentAction = formatOpeningSceneRequest({
      mode: "multiplayer",
      players: beginState.players,
      style: campaignOpeningStyleFromMetadata(beginState.campaign)
    });
    const reply = await askDungeonMaster(
      beginState.campaign,
      currentAction,
      openingSceneInstructions("multiplayer"),
      true,
      beginState.turn.id
    );

    const resolvedTurn = await finishResolvedTurn(
      beginState.campaign.id,
      beginState.turn.id,
      reply.id,
      reply.content,
      "adventure_begun",
      reply.rollRequests,
      reply.setting
    );
    schedulePostTurnContextJobs({
      campaignId: beginState.campaign.id,
      turnId: beginState.turn.id,
      currentAction,
      dmResponse: reply.content,
      dmEventId: resolvedTurn.dmEventId,
      rollRequests: reply.rollRequests
    });
  } catch (error) {
    await markTurnFailed(beginState.turn.id, error);
    await query("update campaigns set has_begun = false where id = $1", [
      beginState.campaign.id
    ]);
    throw error;
  }

  const updatedCampaign = await resolveCampaign(
    beginState.campaign.id,
    beginState.campaign.hermes_session_id
  );

  return buildSnapshot(updatedCampaign ?? beginState.campaign);
}

export async function submitRoomTurn(
  roomId: string,
  sessionId: string,
  playerId: string,
  content: string,
  userId: string,
  rollRequestId?: string,
  rollResult?: DiceRollResult,
  clientMessageId?: string,
  rollSubmissions?: DiceRollSubmission[]
) {
  const submissionState = await withTransaction(async (client) => {
    const campaign = await resolveCampaign(roomId, sessionId, client);

    if (!campaign) {
      throw new Error("Campaign not found.");
    }

    await assertCampaignAccessForUser(campaign, userId, client);

    if (!campaign.has_begun) {
      throw new Error("Begin the adventure before sending turns.");
    }

    const player = await getActiveRoomPlayerForUser(
      client,
      campaign.id,
      playerId,
      userId
    );

    if (!player) {
      throw new Error("Join the room before submitting a turn.");
    }

    if (!isProfileComplete(player)) {
      throw new Error("Player profile is incomplete.");
    }

    const pendingRollRequests = pendingRollRequestsFromCampaign(campaign);
    const submittedRolls = rollSubmissionsFromPayload(
      rollRequestId,
      rollResult,
      clientMessageId,
      rollSubmissions
    );
    const isRollSubmission = submittedRolls.length > 0;
    const rollSubmission = validatePendingRollSubmissions(
      pendingRollRequests,
      submittedRolls,
      player
    );

    const turn = await ensureCollectingTurn(client, campaign.id);
    const trimmedContent = isRollSubmission
      ? rollSubmission.content
      : content.trim();

    if (!trimmedContent) {
      throw new HttpError("A player message is required.", 400);
    }

    await client.query(
      `
        insert into submissions (campaign_id, turn_id, player_id, content)
        values ($1, $2, $3, $4)
        on conflict (turn_id, player_id) do update
        set content = case
              when $5 then submissions.content || E'\n' || excluded.content
              else excluded.content
            end,
            status = 'submitted'
      `,
      [campaign.id, turn.id, player.id, trimmedContent, isRollSubmission]
    );
    if (isRollSubmission) {
      await setPendingRollRequests(
        client,
        campaign.id,
        rollSubmission.remainingRollRequests
      );
    }
    await client.query("update players set last_seen_at = now() where id = $1", [
      player.id
    ]);
    await logCampaignEvent(client, campaign.id, "turn_submitted", {
      turnId: turn.id,
      clientId: player.client_id,
      role: "player",
      messageId: rollSubmission.clientMessageId || clientMessageId || crypto.randomUUID(),
      content: `${player.username} (${player.character_name}): ${trimmedContent}`
    });

    return {
      campaign,
      turn,
      shouldResolve:
        (isRollSubmission &&
          rollSubmission.remainingRollRequests.length === 0) ||
        (!isRollSubmission && pendingRollRequests.length === 0),
      shouldResolveImmediately: isRollSubmission
    };
  });

  if (submissionState.shouldResolve) {
    await maybeResolveTurn(
      submissionState.campaign,
      submissionState.turn,
      submissionState.shouldResolveImmediately
    );
  }

  const updatedCampaign = await resolveCampaign(
    submissionState.campaign.id,
    submissionState.campaign.hermes_session_id
  );

  return buildSnapshot(updatedCampaign ?? submissionState.campaign);
}

export async function submitSoloTurn(
  campaignId: string,
  content: string,
  userId: string,
  rollRequestId?: string,
  rollResult?: DiceRollResult,
  clientMessageId?: string,
  rollSubmissions?: DiceRollSubmission[]
) {
  const soloState = await withTransaction(async (client) => {
    const campaign = (
      await client.query<CampaignRow>(
        `
          select *
          from campaigns
          where id = $1 and status = 'active'
          limit 1
        `,
        [campaignId]
      )
    ).rows[0];

    if (!campaign) {
      throw new HttpError("Campaign not found.", 404);
    }

    await assertCampaignAccessForUser(campaign, userId, client);

    if (campaign.mode !== "single_player") {
      throw new HttpError("Solo turns are only available in singleplayer campaigns.", 400);
    }

    const player = await getActivePlayerForUser(campaign.id, userId, client);

    if (!player) {
      throw new HttpError("A solo player profile is required.", 400);
    }

    const pendingRollRequests = pendingRollRequestsFromCampaign(campaign);
    const submittedRolls = rollSubmissionsFromPayload(
      rollRequestId,
      rollResult,
      clientMessageId,
      rollSubmissions
    );
    const isRollSubmission = submittedRolls.length > 0;
    const rollSubmission = validatePendingRollSubmissions(
      pendingRollRequests,
      submittedRolls,
      player
    );

    const turn = await ensureCollectingTurn(client, campaign.id);
    const trimmedContent = isRollSubmission
      ? rollSubmission.content
      : content.trim();

    if (!trimmedContent) {
      throw new HttpError("A player message is required.", 400);
    }

    const submissionResult = await client.query<{ content: string }>(
      `
        insert into submissions (campaign_id, turn_id, player_id, content)
        values ($1, $2, $3, $4)
        on conflict (turn_id, player_id) do update
        set content = case
              when $5 then submissions.content || E'\n' || excluded.content
              else excluded.content
            end,
            status = 'submitted'
        returning content
      `,
      [campaign.id, turn.id, player.id, trimmedContent, isRollSubmission]
    );
    const submittedContent = submissionResult.rows[0]?.content ?? trimmedContent;

    if (isRollSubmission) {
      await setPendingRollRequests(
        client,
        campaign.id,
        rollSubmission.remainingRollRequests
      );
    }
    await client.query("update players set last_seen_at = now() where id = $1", [
      player.id
    ]);
    await logCampaignEvent(client, campaign.id, "turn_submitted", {
      turnId: turn.id,
      clientId: player.client_id,
      role: "player",
      messageId: rollSubmission.clientMessageId || clientMessageId || crypto.randomUUID(),
      content: trimmedContent
    });

    if (isRollSubmission && rollSubmission.remainingRollRequests.length > 0) {
      return {
        campaign,
        shouldResolve: false,
        turn,
        player,
        content: submittedContent
      };
    }

    const claimedTurn = await client.query<TurnRow>(
      `
        update turns
        set status = 'resolving'
        where id = $1 and status = 'collecting'
        returning *
      `,
      [turn.id]
    );

    if (!claimedTurn.rows[0]) {
      throw new HttpError("That turn is already resolving.", 409);
    }

    await logCampaignEvent(client, campaign.id, "turn_resolving", {
      turnId: turn.id,
      reason: "solo_turn"
    });

    return {
      campaign,
      shouldResolve: true,
      turn: claimedTurn.rows[0],
      player,
      content: submittedContent
    };
  });

  if (!soloState.shouldResolve) {
    const updatedCampaign = await resolveCampaign(
      soloState.campaign.id,
      soloState.campaign.hermes_session_id
    );

    return buildSnapshot(updatedCampaign ?? soloState.campaign);
  }

  try {
    const currentAction = formatSoloTurn(soloState.player, soloState.content);
    const reply = await askDungeonMaster(
      soloState.campaign,
      currentAction,
      dungeonMasterInstructions,
      true,
      soloState.turn.id
    );

    const resolvedTurn = await finishResolvedTurn(
      soloState.campaign.id,
      soloState.turn.id,
      reply.id,
      reply.content,
      "turn_resolved",
      reply.rollRequests
    );
    schedulePostTurnContextJobs({
      campaignId: soloState.campaign.id,
      turnId: soloState.turn.id,
      currentAction,
      dmResponse: reply.content,
      dmEventId: resolvedTurn.dmEventId,
      rollRequests: reply.rollRequests
    });
  } catch (error) {
    await markTurnFailed(soloState.turn.id, error);
    await query(
      `
        insert into campaign_events (campaign_id, type, payload)
        values ($1, 'turn_failed', $2::jsonb)
      `,
      [
        soloState.campaign.id,
        JSON.stringify({
          turnId: soloState.turn.id,
          error: error instanceof Error ? error.message : "DM provider call failed."
        })
      ]
    );
    throw error;
  }

  const updatedCampaign = await resolveCampaign(
    soloState.campaign.id,
    soloState.campaign.hermes_session_id
  );

  return buildSnapshot(updatedCampaign ?? soloState.campaign);
}
