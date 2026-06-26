import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const { Pool } = pg;

const e2eUserId =
  process.env.E2E_TEST_USER_ID ?? "00000000-0000-0000-0000-00000000e2e1";
const titlePrefix = "E2E Required Roll";
let pool: pg.Pool;

type CampaignSummary = {
  id: string;
  hermesSessionId: string;
  mode: "single_player" | "multiplayer";
  title: string;
};

async function loadLocalEnv() {
  const envPath = join(process.cwd(), "apps", "web", ".env.local");

  try {
    const text = await readFile(envPath, "utf8");

    for (const line of text.split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const value = trimmedLine.slice(separatorIndex + 1).trim();

      process.env[key] ??= value;
    }
  } catch {
    // CI can provide DATABASE_URL directly.
  }
}

async function cleanupE2eCampaigns() {
  await pool.query("delete from campaigns where title like $1", [
    `${titlePrefix}%`
  ]);
}

async function lastSubmissionContent(campaignId: string) {
  const result = await pool.query<{ content: string }>(
    `
      select submissions.content
      from submissions
      where submissions.campaign_id = $1
      order by submissions.created_at desc
      limit 1
    `,
    [campaignId]
  );

  return result.rows[0]?.content ?? "";
}

async function authenticate(context: BrowserContext) {
  await context.addCookies([
    {
      name: "ai-taverns-e2e-user-id",
      value: e2eUserId,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
      secure: false
    }
  ]);
}

async function createCampaign(
  context: BrowserContext,
  input: {
    mode: "single_player" | "multiplayer";
    title: string;
    ownerClientId: string;
    playerName: string;
    characterName: string;
  }
) {
  const response = await context.request.post("/api/campaigns", {
    data: {
      mode: input.mode,
      title: input.title,
      campaignGenreKind: "custom",
      campaignGenre: "E2E Archive",
      customWorldName: "E2E Archive",
      customWorldDescription:
        "A tiny deterministic test world built around a rune-locked archive.",
      ownerClientId: input.ownerClientId,
      playerName: input.playerName,
      characterName: input.characterName,
      characterSheet: `${input.characterName} is a careful adventurer with quick reflexes.`
    }
  });

  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as { campaign: CampaignSummary };
  return body.campaign;
}

async function addPlayer(
  context: BrowserContext,
  campaign: CampaignSummary,
  input: {
    playerId: string;
    username: string;
    characterName: string;
  }
) {
  const response = await context.request.post("/api/room/player", {
    data: {
      roomId: campaign.id,
      sessionId: campaign.hermesSessionId,
      playerId: input.playerId,
      username: input.username,
      characterName: input.characterName,
      characterSheet: `${input.characterName} is ready for the archive door.`
    }
  });

  expect(response.ok()).toBeTruthy();
}

async function expectPendingRollLocked(page: Page) {
  await expect(page.getByText("Roll 1d20: Reflex save")).toBeVisible({
    timeout: 20_000
  });

  const textarea = page.getByPlaceholder("Speak, search, attack, bargain...");
  await expect(textarea).not.toBeEditable();
  await expect(page.getByRole("button", { name: /^Send$/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Roll 1d20" })).toBeEnabled();
}

async function expectNormalInputRestored(page: Page) {
  const textarea = page.getByPlaceholder("Speak, search, attack, bargain...");
  await expect(page.getByText("Roll 1d20: Reflex save")).toBeHidden();
  await expect(textarea).toBeEditable();
  await textarea.fill("The way is clear now.");
  await expect(page.getByRole("button", { name: /^Send$/ })).toBeEnabled();
}

async function completeMultiplayerProfile(page: Page) {
  await page.getByPlaceholder("Your name").fill("Party Tester");
  await page.getByPlaceholder("Character name").fill("Mira");
  await page.getByRole("button", { name: "View Character Sheet" }).click();
  await page
    .getByRole("dialog", { name: "Character sheet" })
    .getByRole("textbox")
    .fill("Mira is a careful adventurer with quick reflexes.");
  await page.getByRole("button", { name: "Close character sheet" }).click();
  await page.getByRole("button", { name: "Update Profile" }).click();
}

test.beforeAll(async () => {
  await loadLocalEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for E2E tests.");
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL_DISABLED === "true"
        ? false
        : {
            rejectUnauthorized: false
          }
  });

  await cleanupE2eCampaigns();
});

test.afterEach(async () => {
  await cleanupE2eCampaigns();
});

test.afterAll(async () => {
  await pool.end();
});

test("singleplayer required roll locks normal input and submits a server roll", async ({
  context,
  page
}) => {
  await authenticate(context);

  const campaign = await createCampaign(context, {
    mode: "single_player",
    title: `${titlePrefix} Solo ${Date.now()}`,
    ownerClientId: "e2e-solo-player",
    playerName: "Solo Tester",
    characterName: "Vela"
  });

  await page.goto(`/play?campaignId=${campaign.id}`);
  await expect(page.getByRole("heading", { name: campaign.title })).toBeVisible();

  const textarea = page.getByPlaceholder("Speak, search, attack, bargain...");
  await textarea.fill("I inspect the rune lock.");
  await page.getByRole("button", { name: /^Send$/ }).click();

  await expectPendingRollLocked(page);
  await page.reload();
  await expectPendingRollLocked(page);

  await page.getByRole("button", { name: "Roll 1d20" }).click();
  await expect(
    page.locator(".message-log").getByText("The runes flare")
  ).toBeVisible({
    timeout: 20_000
  });

  const submittedRoll = await lastSubmissionContent(campaign.id);
  expect(submittedRoll).toContain("Rolled Reflex save: 1d20 + 2 =");
  expect(submittedRoll).not.toContain("I inspect the rune lock");
  expect(submittedRoll).not.toContain("999");

  await expectNormalInputRestored(page);
});

test("multiplayer required roll locks normal input and submits a server roll", async ({
  context,
  page
}) => {
  await authenticate(context);
  await context.addInitScript(() => {
    window.localStorage.setItem("ai-dnd.playerId", "e2e-party-one");
    window.localStorage.setItem("ai-dnd.username", "Party Tester");
    window.localStorage.setItem("ai-dnd.characterName", "Mira");
    window.localStorage.setItem(
      "ai-dnd.characterSheet",
      "Mira is a careful adventurer with quick reflexes."
    );
  });

  const campaign = await createCampaign(context, {
    mode: "multiplayer",
    title: `${titlePrefix} Multiplayer ${Date.now()}`,
    ownerClientId: "e2e-party-one",
    playerName: "Party Tester",
    characterName: "Mira"
  });
  await addPlayer(context, campaign, {
    playerId: "e2e-party-two",
    username: "Second Tester",
    characterName: "Orin"
  });

  await page.goto(`/play?campaignId=${campaign.id}`);
  await expect(page.getByRole("heading", { name: campaign.title })).toBeVisible();
  await completeMultiplayerProfile(page);
  await page.getByRole("button", { name: "Begin Adventure" }).click();
  await expect(
    page.locator(".message-log").getByText("The party gathers")
  ).toBeVisible({
    timeout: 20_000
  });

  const textarea = page.getByPlaceholder("Speak, search, attack, bargain...");
  await textarea.fill("I inspect the rune lock.");
  await page.getByRole("button", { name: /^Send$/ }).click();

  const secondPlayerResponse = await context.request.post("/api/room/submit", {
    data: {
      roomId: campaign.id,
      sessionId: campaign.hermesSessionId,
      playerId: "e2e-party-two",
      message: "I watch for danger."
    }
  });
  expect(secondPlayerResponse.ok()).toBeTruthy();

  await expectPendingRollLocked(page);
  await page.reload();
  await expectPendingRollLocked(page);

  await page.getByRole("button", { name: "Roll 1d20" }).click();
  await expect(
    page.locator(".message-log").getByText("The runes flare")
  ).toBeVisible({
    timeout: 20_000
  });

  const submittedRoll = await lastSubmissionContent(campaign.id);
  expect(submittedRoll).toContain("Rolled Reflex save: 1d20 + 2 =");
  expect(submittedRoll).not.toContain("I watch for danger");
  expect(submittedRoll).not.toContain("999");

  await expectNormalInputRestored(page);
});
