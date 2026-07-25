import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiErrorResponseSchema,
  CampaignInviteCreateResponseSchema,
  CampaignInviteDisableResponseSchema,
  CampaignInviteListResponseSchema,
  CampaignCreateResponseSchema,
  CampaignNpcCardUpdateResponseSchema,
  CampaignNpcCardsResponseSchema,
  CampaignJoinPreviewResponseSchema,
  CampaignJoinResponseSchema,
  LobbyInviteJoinResponseSchema,
  LobbyInvitePreviewResponseSchema,
  CampaignListResponseSchema,
  CampaignReadResponseSchema,
  CampaignSoloTurnResponseSchema
} from "@ai-dnd/contracts";

import {
  app,
  database,
  getProviderInputs,
  resetProviderInputs,
  setProviderOverride,
  signIn
} from "./test/app-test-harness.js";

test("POST /api/campaigns seeds Eldermere world context for flagship campaigns", async () => {
  const cookie = await signIn("eldermere@example.com");
  resetProviderInputs();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "eldermere",
      ownerClientId: "eldermere-client",
      playerName: "Eldermere Player",
      characterName: "Mira",
      characterSheet: "A ruin-delver who follows old glowing roads."
    }
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);

  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === created.campaign.id
  );
  const metadata = campaign?.metadata as Record<string, unknown>;
  const worldProfile = metadata.worldProfile as Record<string, unknown>;
  const selectedRegion = worldProfile.selectedRegion as Record<string, unknown>;
  const startingLocation = worldProfile.startingLocation as Record<
    string,
    unknown
  >;
  const openingPlan = metadata.eldermereOpeningPlan as Record<string, unknown>;
  const plannerInput = getProviderInputs().at(0);
  const narratorInput = getProviderInputs().at(1);

  assert.equal(worldProfile.worldName, "Eldermere");
  assert.equal(worldProfile.source, "flagship_world");
  assert.equal(typeof selectedRegion.name, "string");
  assert.equal(typeof startingLocation.name, "string");
  assert.equal(startingLocation.displayLocation, startingLocation.name);
  assert.equal(metadata.eldermereOpeningPlanVersion, 1);
  assert.equal(openingPlan.campaign_title, "The Quiet Road");
  assert.equal(getProviderInputs().length, 2);

  assert.ok(plannerInput);
  assert.match(plannerInput.instructions, /campaign-opening planner/);
  assert.match(plannerInput.message, /Flagship world context:/);
  assert.match(plannerInput.message, /setting\.world_name as "Eldermere"/);
  assert.match(plannerInput.message, /Seven regions available for the opener:/);
  assert.match(plannerInput.message, /Cael Ambrose:/);
  assert.match(plannerInput.message, /Thornwake Vale:/);
  assert.match(plannerInput.message, /The Ferrant Concord:/);
  assert.match(plannerInput.message, /The Salt Concordat:/);
  assert.match(plannerInput.message, /Ashfell Marches:/);
  assert.match(plannerInput.message, /The Veiled Reach:/);
  assert.match(plannerInput.message, /The Sundered Vale:/);
  assert.match(plannerInput.message, /Wellglass is finite/);
  assert.doesNotMatch(plannerInput.message, /Recurring live conflicts:/);
  assert.match(plannerInput.message, /Selected opener region and settlement:/);
  assert.match(plannerInput.message, /use this selected region and settlement/);
  assert.match(plannerInput.message, /Opening lore clarity rule:/);
  assert.match(
    plannerInput.message,
    /use no more than 2-3 new Eldermere-specific proper nouns/
  );
  assert.match(
    plannerInput.message,
    /Do not mention faction names, religious schisms, ancient ages, distant regions, or extra institutions/
  );
  assert.match(
    plannerInput.message,
    /the strict temple faction/
  );
  assert.match(
    plannerInput.message,
    new RegExp(`Region: ${selectedRegion.name as string}\\.`)
  );
  assert.match(
    plannerInput.message,
    new RegExp(`Starting settlement: ${startingLocation.name as string}`)
  );

  assert.ok(narratorInput);
  assert.match(narratorInput.message, /Eldermere opening plan:/);
  assert.match(narratorInput.message, /Narrator boundary:/);
  assert.match(narratorInput.message, /allowed_player_facing_terms/);
  assert.match(narratorInput.message, /forbidden_opening_terms/);
  assert.match(narratorInput.message, /Second Dominion/);
  assert.doesNotMatch(narratorInput.message, /Flagship world context:/);
  assert.doesNotMatch(narratorInput.message, /Seven regions available for the opener:/);
  assert.doesNotMatch(narratorInput.instructions, /World Context:/);
  assert.doesNotMatch(narratorInput.instructions, /Regions of Eldermere:/);
  assert.match(
    narratorInput.message,
    new RegExp(`"name": "${selectedRegion.name as string}"`)
  );
  assert.match(
    narratorInput.message,
    new RegExp(`"name": "${startingLocation.name as string}"`)
  );
  assert.match(
    narratorInput.message,
    /Forbidden opening terms must not appear in public_narration/
  );
  assert.match(
    narratorInput.message,
    /Write the player-facing opener only from the Eldermere opening plan/
  );
});

test("GET /api/campaigns/:campaignId/npc-cards lists existing NPC context cards", async () => {
  const cookie = await signIn("npc-cards@example.com");
  resetProviderInputs();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "npc-cards-client",
      playerName: "NPC Reader",
      characterName: "Pike",
      characterSheet: "Name: Pike"
    }
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);

  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const now = new Date("2026-07-20T10:00:00.000Z");

  database.contextChunks.push(
    {
      campaign_id: created.campaign.id,
      context_key: "npc:marra-vell",
      category: "npc_context",
      title: "Marra Vell",
      visibility: "player_safe",
      priority: 4,
      body_markdown:
        "# Marra Vell\n\n## Name\nMarra Vell\n\n## Location\nPier 6.\n\n## Appearance\nUnknown.",
      archived_at: null,
      updated_at: now
    },
    {
      campaign_id: created.campaign.id,
      context_key: "npc:hidden-informant",
      category: "npc_context",
      title: "Hidden Informant",
      visibility: "dm_only",
      priority: 10,
      body_markdown: "# Hidden Informant",
      archived_at: null,
      updated_at: now
    }
  );

  const response = await app.inject({
    method: "GET",
    url: `/api/campaigns/${created.campaign.id}/npc-cards`,
    headers: {
      cookie
    }
  });

  assert.equal(response.statusCode, 200, response.body);

  const body = CampaignNpcCardsResponseSchema.parse(response.json());

  assert.deepEqual(
    body.npcCards.map((card) => card.id).sort(),
    ["npc:hidden-informant", "npc:marra-vell"]
  );
  const marraCard = body.npcCards.find((card) => card.id === "npc:marra-vell");

  assert.equal(marraCard?.title, "Marra Vell");
  assert.match(marraCard?.markdown ?? "", /## Appearance/);
  assert.equal(marraCard?.updatedAt, "2026-07-20T10:00:00.000Z");

  const updateResponse = await app.inject({
    method: "PATCH",
    url: `/api/campaigns/${created.campaign.id}/npc-cards/${encodeURIComponent(
      "npc:marra-vell"
    )}`,
    headers: {
      cookie
    },
    payload: {
      markdown:
        "# Marra Vell\n\n## Name\nMarra Vell\n\n## Location\nPier 7.\n\n## Appearance\nA fog-damp cloak."
    }
  });

  assert.equal(updateResponse.statusCode, 200, updateResponse.body);

  const updateBody = CampaignNpcCardUpdateResponseSchema.parse(
    updateResponse.json()
  );

  assert.equal(updateBody.npcCard.id, "npc:marra-vell");
  assert.equal(updateBody.npcCard.title, "Marra Vell");
  assert.match(updateBody.npcCard.markdown, /Pier 7/);
  assert.equal(updateBody.npcCard.updatedAt, "2026-07-20T11:00:00.000Z");
});

test("POST /api/campaigns scrubs forbidden Eldermere opening terms after narrator repair", async () => {
  const cookie = await signIn("eldermere-scrub@example.com");
  resetProviderInputs();

  setProviderOverride(async (input) => {
    if (input.instructions.includes("campaign-opening planner")) {
      return {
        id: "provider-planner-forbidden-terms",
        content: JSON.stringify({
          campaign_title: "The Quiet Road",
          region: {
            name: "Cael Ambrose",
            why_this_region: "It gives the opener a concrete local conflict.",
            plain_description: "A troubled region with pressure close enough to touch."
          },
          starting_location: {
            name: "Suncross",
            type: "settlement",
            why_this_location: "It is the selected campaign start.",
            plain_description: "A specific place where the first problem is already visible."
          },
          opening_premise: {
            why_the_party_is_here: "The party has come to answer a local summons.",
            immediate_objective: "Find the person who sent for them.",
            immediate_complication: "The locals are afraid to explain what happened.",
            first_scene_location: "At the edge of Suncross.",
            opening_mood: "watchful and tense",
            campaign_promise: "A grounded mystery with old power underneath it."
          },
          player_facing_facts: [
            "The party has a reason to be here now.",
            "Someone local needs help and is afraid."
          ],
          allowed_player_facing_terms: [
            {
              term: "Cael Ambrose",
              plain_meaning: "the larger region where the campaign begins"
            },
            {
              term: "Suncross",
              plain_meaning: "the settlement where the first scene begins"
            }
          ],
          npc_seed: [
            {
              name: "Mara Vell",
              role: "a worried local messenger",
              wants: "help without drawing official attention",
              visible_behavior: "keeps watching the street behind her"
            }
          ],
          first_interactable_choices: [
            "question Mara Vell",
            "inspect the marked doorway",
            "ask nearby locals what frightened them"
          ],
          sensory_palette: {
            sights: ["a marked doorway", "lanterns lit early"],
            sounds: ["low voices", "boots on stone"],
            smells: ["cold rain"],
            textures_or_weather: ["damp air"]
          },
          dm_private_context: [
            "Old world lore may matter later, but should not be named in the opening."
          ],
          forbidden_opening_terms: ["Second Dominion", "Hush"],
          narrator_instructions: ["Use the allowed terms only."],
          opening_quality_checks: ["No forbidden opening terms appear."]
        }),
        debug: {
          requestMessages: [],
          rawResponse: "{}",
          model: "test-model",
          temperature: 0.8,
          providerTimings: []
        }
      };
    }

    return {
      id: "provider-narrator-forbidden-terms",
      content: JSON.stringify({
        public_narration:
          "Suncross crouches beneath the old stones of the Second Dominion, where the Hush still seems to press against every shutter.\n\nMara Vell waits by a marked doorway, rain silvering her cloak.\n\nWhat do you do?",
        roll_requests: [],
        next_input_needed: "player_actions",
        input_targets: [],
        input_policy: "all_players",
        setting: {
          display_location: "",
          world_name: "Wrong Realm",
          starting_location: "Wrong Road"
        }
      }),
      debug: {
        requestMessages: [],
        rawResponse: "{}",
        model: "test-model",
        temperature: 0.8,
        providerTimings: []
      }
    };
  });

  const createResponse = await (async () => {
    try {
      return await app.inject({
        method: "POST",
        url: "/api/campaigns",
        headers: {
          cookie
        },
        payload: {
          mode: "single_player",
          campaignGenreKind: "preset",
          campaignGenrePresetId: "eldermere",
          ownerClientId: "eldermere-scrub-client",
          playerName: "Eldermere Player",
          characterName: "Mira",
          characterSheet: "A ruin-delver who follows old glowing roads."
        }
      });
    } finally {
      setProviderOverride(undefined);
    }
  })();

  assert.equal(createResponse.statusCode, 201, createResponse.body);

  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const openingEvent = database.campaignEvents.find(
    (event) =>
      event.campaign_id === created.campaign.id &&
      event.type === "adventure_begun"
  );
  const payload = openingEvent?.payload as Record<string, unknown> | undefined;
  const setting = payload?.setting as Record<string, unknown> | undefined;

  assert.ok(payload);
  assert.doesNotMatch(payload.content as string, /Second Dominion|Hush/);
  assert.match(payload.content as string, /fallen empire/);
  assert.match(payload.content as string, /long silence/);
  assert.equal(setting?.worldName, "Eldermere");
  assert.equal(setting?.startingLocation, "Suncross");
  assert.equal(setting?.displayLocation, "Suncross");
  assert.equal(getProviderInputs().length, 3);
});


test("campaign endpoints require an owned session", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/campaigns"
  });

  assert.equal(response.statusCode, 401);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).error.code,
    "UNAUTHORIZED"
  );
});

test("campaign creation stores a multiplayer campaign and list returns it", async () => {
  const cookie = await signIn("campaign-owner@example.com");

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "owner-client",
      playerName: "Table Owner"
    }
  });

  assert.equal(createResponse.statusCode, 201);
  const createBody = CampaignCreateResponseSchema.parse(createResponse.json());
  assert.equal(createBody.campaign.mode, "multiplayer");
  assert.equal(createBody.campaign.title, "Table Owner");
  assert.ok(createBody.campaign.joinCode);

  const listResponse = await app.inject({
    method: "GET",
    url: "/api/campaigns",
    headers: {
      cookie
    }
  });

  assert.equal(listResponse.statusCode, 200);
  const listBody = CampaignListResponseSchema.parse(listResponse.json());
  assert.equal(listBody.campaigns.length, 1);
  assert.equal(listBody.campaigns[0]?.id, createBody.campaign.id);
});

test("mechanics state initializes and projects spell slot lifecycle", async () => {
  const cookie = await signIn("kair-mechanics@example.com");
  const mechanicsSeed = {
    characterClass: "Sorcerer",
    level: 5,
    maxHp: 32,
    currentHp: 32,
    spellSlots: {
      "1": { max: 4, used: 0 },
      "2": { max: 3, used: 0 },
      "3": { max: 2, used: 0 }
    }
  };
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: { cookie },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "kair-client",
      playerName: "Kair",
      characterName: "Kair",
      characterSheet: [
        "Character Name: Kair",
        "Level: 5",
        "Class: Sorcerer",
        "",
        "Core Stats",
        "Max HP: 32",
        "Current HP: 32",
        "",
        "Spells",
        "Spell Slots",
        "1st-level slots: 4 total, 0 used, 4 remaining",
        "2nd-level slots: 3 total, 0 used, 3 remaining",
        "3rd-level slots: 2 total, 0 used, 2 remaining",
        "Fireball",
        "Lightning Bolt"
      ].join("\n"),
      mechanicsSeed
    }
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === created.campaign.id
  );
  const player = database.players.find(
    (candidate) => candidate.campaign_id === created.campaign.id
  );
  const mechanicsState = (campaign?.metadata as Record<string, unknown>)
    .mechanicsState as Record<string, unknown>;
  const actors = mechanicsState.actors as Record<string, Record<string, unknown>>;

  assert.ok(player);
  assert.deepEqual(
    (actors[`player:${player.id}`]?.spellSlots as Record<string, unknown>)?.["3"],
    { max: 2, used: 0 }
  );
  assert.deepEqual(mechanicsState.combat, {
    active: false,
    round: 0,
    turnOwner: null,
    initiativeOrder: []
  });

  const firstCastResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/solo-turn`,
    headers: { cookie },
    payload: {
      message: "I cast Fireball at the clustered skeletons."
    }
  });

  assert.equal(firstCastResponse.statusCode, 200, firstCastResponse.body);
  const firstCast = CampaignSoloTurnResponseSchema.parse(
    firstCastResponse.json()
  );
  const projectedFirstSheet = firstCast.players[0]?.characterSheet ?? "";
  assert.match(
    projectedFirstSheet,
    /3rd-level slots: 2 total, 1 used, 1 remaining/
  );

  const mentionResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/solo-turn`,
    headers: { cookie },
    payload: {
      message: "I dodge the fireball and keep moving."
    }
  });

  assert.equal(mentionResponse.statusCode, 200, mentionResponse.body);
  const mention = CampaignSoloTurnResponseSchema.parse(mentionResponse.json());
  assert.match(
    mention.players[0]?.characterSheet ?? "",
    /3rd-level slots: 2 total, 1 used, 1 remaining/
  );

  const secondCastResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/solo-turn`,
    headers: { cookie },
    payload: {
      message: "I cast Lightning Bolt down the hallway."
    }
  });

  assert.equal(secondCastResponse.statusCode, 200, secondCastResponse.body);
  const secondCast = CampaignSoloTurnResponseSchema.parse(
    secondCastResponse.json()
  );
  assert.match(
    secondCast.players[0]?.characterSheet ?? "",
    /3rd-level slots: 2 total, 2 used, 0 remaining/
  );

  const blockedResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/solo-turn`,
    headers: { cookie },
    payload: {
      message: "I cast Fireball again."
    }
  });

  assert.equal(blockedResponse.statusCode, 400, blockedResponse.body);
  assert.match(
    ApiErrorResponseSchema.parse(blockedResponse.json()).error.message,
    /No 3rd-level spell slots left/
  );
});

test("mechanics state falls back to character sheet spell slots without seed", async () => {
  const cookie = await signIn("sheet-slots@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: { cookie },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "sheet-slots-client",
      playerName: "Jin",
      characterName: "Jin",
      characterSheet: [
        "Character Name: Jin",
        "Level: 5",
        "Class: Sorcerer",
        "",
        "Core Stats",
        "Max HP: 32",
        "Current HP: 32",
        "",
        "Spells",
        "Spell Slots",
        "1st-level slots: 4 total, 0 used, 4 remaining",
        "2nd-level slots: 3 total, 0 used, 3 remaining",
        "3rd-level slots: 2 total, 0 used, 2 remaining",
        "Lightning Bolt"
      ].join("\n")
    }
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === created.campaign.id
  );
  const player = database.players.find(
    (candidate) => candidate.campaign_id === created.campaign.id
  );

  assert.ok(campaign);
  assert.ok(player);
  campaign.metadata = {
    ...(campaign.metadata as Record<string, unknown>),
    mechanicsState: {
      combat: {
        active: false,
        round: 0,
        turnOwner: null,
        initiativeOrder: []
      },
      actors: {
        [`player:${player.id}`]: {
          characterName: "Jin",
          currentHp: 32,
          maxHp: 32,
          concentration: null,
          conditions: []
        }
      }
    }
  };

  const castResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/solo-turn`,
    headers: { cookie },
    payload: {
      message: "I cast Lightning Bolt down the hallway."
    }
  });

  assert.equal(castResponse.statusCode, 200, castResponse.body);
  const cast = CampaignSoloTurnResponseSchema.parse(castResponse.json());

  assert.match(
    cast.players[0]?.characterSheet ?? "",
    /3rd-level slots: 2 total, 1 used, 1 remaining/
  );
});

test("mechanics state initializes Warlock pact slots", async () => {
  const cookie = await signIn("warlock-mechanics@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: { cookie },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "warlock-client",
      playerName: "Vey",
      characterName: "Vey",
      characterSheet: "Character Name: Vey\nClass: Warlock\nMax HP: 38\nCurrent HP: 38",
      mechanicsSeed: {
        characterClass: "Warlock",
        level: 5,
        maxHp: 38,
        currentHp: 38,
        spellSlots: {
          "3": { max: 2, used: 0 }
        }
      }
    }
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === created.campaign.id
  );
  const player = database.players.find(
    (candidate) => candidate.campaign_id === created.campaign.id
  );
  const mechanicsState = (campaign?.metadata as Record<string, unknown>)
    .mechanicsState as Record<string, unknown>;
  const actors = mechanicsState.actors as Record<string, Record<string, unknown>>;

  assert.ok(player);
  assert.deepEqual(
    (actors[`player:${player.id}`]?.spellSlots as Record<string, unknown>)?.["3"],
    { max: 2, used: 0 }
  );
});

test("campaign creation validates preset, custom world, and single-player requirements", async () => {
  const cookie = await signIn("campaign-validation@example.com");

  for (const payload of [
    {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "missing-preset",
      ownerClientId: "invalid-preset-client",
      playerName: "Owner"
    },
    {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "missing-character-client",
      playerName: "Owner"
    },
    {
      mode: "multiplayer",
      campaignGenreKind: "custom",
      ownerClientId: "missing-custom-client",
      playerName: "Owner",
      customWorldName: "Glassmere"
    }
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: {
        cookie
      },
      payload
    });

    assert.equal(response.statusCode, 400);
    assert.equal(
      ApiErrorResponseSchema.parse(response.json()).error.code,
      "BAD_REQUEST"
    );
  }
});

test("campaign creation stores custom world metadata and title fallback", async () => {
  const cookie = await signIn("campaign-custom-world@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "custom",
      campaignGenre: "Clockwork marsh expedition",
      customWorldName: "Glassmere",
      customWorldDescription: "A wetland of glass reeds and clockwork shrines.",
      ownerClientId: "custom-world-owner-client",
      playerName: "Worldwright"
    }
  });

  assert.equal(createResponse.statusCode, 201);
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === created.campaign.id
  );
  const metadata = campaign?.metadata as Record<string, unknown>;
  const genre = metadata.genre as Record<string, unknown>;

  assert.equal(created.campaign.title, "Worldwright");
  assert.equal(created.campaign.preview, "Glassmere");
  assert.equal(genre.kind, "custom");
  assert.equal(genre.label, "Clockwork marsh expedition");
  assert.equal(genre.customWorldName, "Glassmere");
  assert.equal(
    genre.customWorldDescription,
    "A wetland of glass reeds and clockwork shrines."
  );
});

test("campaign creation applies default multiplayer owner and title fallbacks", async () => {
  const cookie = await signIn("campaign-defaults@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      campaignGenreKind: "preset",
      campaignGenrePresetId: "mystery"
    }
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const player = database.players.find(
    (candidate) => candidate.campaign_id === created.campaign.id
  );

  assert.equal(created.campaign.mode, "multiplayer");
  assert.equal(created.campaign.title, "Table Owner");
  assert.equal(created.campaign.preview, "Mystery Adventure");
  assert.equal(player?.username, "Table Owner");
});

test("campaign read returns owned campaign summaries from Fastify", async () => {
  const cookie = await signIn("campaign-reader@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "high_adventure",
      ownerClientId: "reader-client",
      playerName: "Reader",
      characterName: "Astra"
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const createdCampaign = database.campaigns.find(
    (campaign) => campaign.id === created.campaign.id
  );

  assert.equal(createdCampaign?.has_begun, true);
  assert.ok(
    database.campaignEvents.some(
      (event) =>
        event.campaign_id === created.campaign.id &&
        event.type === "adventure_begun"
    )
  );

  const readResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${created.campaign.id}`,
    headers: {
      cookie
    }
  });

  assert.equal(readResponse.statusCode, 200);
  const read = CampaignReadResponseSchema.parse(readResponse.json());
  assert.equal(read.campaign.id, created.campaign.id);
  assert.equal(read.campaign.title, "Astra");
});

test("campaign read forbids signed-in users without campaign access", async () => {
  const ownerCookie = await signIn("private-owner@example.com");
  const otherCookie = await signIn("private-other@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "dark_fantasy",
      ownerClientId: "private-owner-client",
      playerName: "Owner",
      characterName: "Nyx"
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  const readResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${created.campaign.id}`,
    headers: {
      cookie: otherCookie
    }
  });

  assert.equal(readResponse.statusCode, 403);
  assert.equal(
    ApiErrorResponseSchema.parse(readResponse.json()).error.code,
    "FORBIDDEN"
  );
});

test("campaign read distinguishes invalid, missing, and inaccessible campaigns", async () => {
  const ownerCookie = await signIn("missing-owner@example.com");
  const otherCookie = await signIn("missing-other@example.com");
  const missingCampaignId = "00000000-0000-4000-8000-999999999999";

  const invalidIdResponse = await app.inject({
    method: "GET",
    url: "/api/campaigns/not-a-campaign-id",
    headers: {
      cookie: ownerCookie
    }
  });

  assert.equal(invalidIdResponse.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(invalidIdResponse.json()).error.code,
    "BAD_REQUEST"
  );

  const missingResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${missingCampaignId}`,
    headers: {
      cookie: ownerCookie
    }
  });

  assert.equal(missingResponse.statusCode, 404);
  assert.equal(
    ApiErrorResponseSchema.parse(missingResponse.json()).error.code,
    "NOT_FOUND"
  );

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "dark_fantasy",
      ownerClientId: "missing-owner-client",
      playerName: "Owner",
      characterName: "Vey"
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  const forbiddenResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${created.campaign.id}`,
    headers: {
      cookie: otherCookie
    }
  });

  assert.equal(forbiddenResponse.statusCode, 403);
  assert.equal(
    ApiErrorResponseSchema.parse(forbiddenResponse.json()).error.code,
    "FORBIDDEN"
  );
});

test("campaign join preview and join use the Fastify campaign API", async () => {
  const ownerCookie = await signIn("join-owner@example.com");
  const joinerCookie = await signIn("joiner@example.com");
  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "mystery",
      ownerClientId: "join-owner-client",
      playerName: "Owner"
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  assert.ok(created.campaign.joinCode);
  const pastedGameCode = `Game code: ${created.campaign.joinCode}`;

  const previewResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns/join/preview",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      gameCode: pastedGameCode
    }
  });

  assert.equal(previewResponse.statusCode, 200);
  const preview = CampaignJoinPreviewResponseSchema.parse(
    previewResponse.json()
  );
  assert.equal(preview.code, created.campaign.joinCode);
  assert.equal(preview.availableSlots, 3);

  const joinResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns/join",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      gameCode: pastedGameCode,
      clientId: "joiner-client",
      username: "Joined Player",
      characterName: "Lyra",
      characterSheet: "A careful investigator."
    }
  });

  assert.equal(joinResponse.statusCode, 200);
  const joined = CampaignJoinResponseSchema.parse(joinResponse.json());
  assert.equal(joined.campaign.id, created.campaign.id);
  assert.equal(joined.campaign.title, "Lyra");
  assert.equal(
    database.players.filter(
      (player) => player.campaign_id === joined.campaign.id
    ).length,
    2
  );
});

test("campaign join rejects invalid and disabled game codes", async () => {
  const ownerCookie = await signIn("disabled-code-owner@example.com");
  const joinerCookie = await signIn("disabled-code-joiner@example.com");

  const emptyPreviewResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns/join/preview",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      gameCode: ""
    }
  });

  assert.equal(emptyPreviewResponse.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(emptyPreviewResponse.json()).error.code,
    "BAD_REQUEST"
  );

  const invalidPreviewResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns/join/preview",
    headers: {
      cookie: joinerCookie
    },
    payload: {
      gameCode: "NOPE99"
    }
  });

  assert.equal(invalidPreviewResponse.statusCode, 404);
  assert.equal(
    ApiErrorResponseSchema.parse(invalidPreviewResponse.json()).error.code,
    "NOT_FOUND"
  );

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "disabled-code-owner-client",
      playerName: "Owner"
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const joinCode = database.joinCodes.find(
    (candidate) => candidate.campaign_id === created.campaign.id
  );

  assert.ok(joinCode);
  joinCode.enabled = false;
  joinCode.disabled_at = new Date();

  for (const response of [
    await app.inject({
      method: "POST",
      url: "/api/campaigns/join/preview",
      headers: {
        cookie: joinerCookie
      },
      payload: {
        gameCode: joinCode.code
      }
    }),
    await app.inject({
      method: "POST",
      url: "/api/campaigns/join",
      headers: {
        cookie: joinerCookie
      },
      payload: {
        gameCode: joinCode.code,
        clientId: "disabled-code-joiner-client",
        username: "Joiner",
        characterName: "Joiner",
        characterSheet: "A ready adventurer."
      }
    })
  ]) {
    assert.equal(response.statusCode, 404);
    assert.equal(
      ApiErrorResponseSchema.parse(response.json()).error.code,
      "NOT_FOUND"
    );
  }
});

test("campaign lobby invites are owner managed and let players join unstarted lobbies", async () => {
  const ownerCookie = await signIn("invite-owner@example.com");
  const joinerCookie = await signIn("invite-joiner@example.com");
  const otherCookie = await signIn("invite-other@example.com");

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "invite-owner-client",
      playerName: "Owner"
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  const forbiddenResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/invites`,
    headers: {
      cookie: otherCookie
    },
    payload: {}
  });

  assert.equal(forbiddenResponse.statusCode, 403);

  const inviteResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/invites`,
    headers: {
      cookie: ownerCookie
    },
    payload: {
      maxUses: 2
    }
  });

  assert.equal(inviteResponse.statusCode, 201, inviteResponse.body);
  const invite = CampaignInviteCreateResponseSchema.parse(inviteResponse.json());
  assert.equal(invite.invite.campaignId, created.campaign.id);
  assert.equal(invite.invite.maxUses, 2);
  assert.ok(invite.invite.token.length >= 16);

  const listResponse = await app.inject({
    method: "GET",
    url: `/api/campaigns/${created.campaign.id}/invites`,
    headers: {
      cookie: ownerCookie
    }
  });

  assert.equal(listResponse.statusCode, 200, listResponse.body);
  const inviteList = CampaignInviteListResponseSchema.parse(listResponse.json());
  assert.equal(inviteList.invites.length, 1);
  assert.equal(inviteList.invites[0]?.id, invite.invite.id);

  const previewResponse = await app.inject({
    method: "GET",
    url: `/api/invites/${invite.invite.token}/preview`,
    headers: {
      cookie: joinerCookie
    }
  });

  assert.equal(previewResponse.statusCode, 200, previewResponse.body);
  const preview = LobbyInvitePreviewResponseSchema.parse(previewResponse.json());
  assert.equal(preview.campaignTitle, "Classic Fantasy Adventure");
  assert.equal(preview.availableSlots, 3);

  const joinResponse = await app.inject({
    method: "POST",
    url: `/api/invites/${invite.invite.token}/join`,
    headers: {
      cookie: joinerCookie
    },
    payload: {
      clientId: "invite-joiner-client",
      username: "Joined Player",
      characterName: "Tamsin",
      characterSheet: "A bright-eyed scout."
    }
  });

  assert.equal(joinResponse.statusCode, 200, joinResponse.body);
  const joined = LobbyInviteJoinResponseSchema.parse(joinResponse.json());
  assert.equal(joined.campaign.id, created.campaign.id);
  assert.equal(joined.campaign.title, "Tamsin");
  assert.equal(database.campaignInvites[0]?.use_count, 1);
  assert.equal(database.campaignInviteUses.length, 1);

  const disableResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/invites/${invite.invite.id}/disable`,
    headers: {
      cookie: ownerCookie
    }
  });

  assert.equal(disableResponse.statusCode, 200, disableResponse.body);
  const disabled = CampaignInviteDisableResponseSchema.parse(
    disableResponse.json()
  );
  assert.equal(disabled.invite.enabled, false);

  const disabledPreviewResponse = await app.inject({
    method: "GET",
    url: `/api/invites/${invite.invite.token}/preview`,
    headers: {
      cookie: joinerCookie
    }
  });

  assert.equal(disabledPreviewResponse.statusCode, 404);
});

test("lobby invites and game codes reject campaigns after adventure start", async () => {
  const ownerCookie = await signIn("started-invite-owner@example.com");
  const joinerCookie = await signIn("started-invite-joiner@example.com");

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie: ownerCookie
    },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "mystery",
      ownerClientId: "started-invite-owner-client",
      playerName: "Owner"
    }
  });
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  const inviteResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/invites`,
    headers: {
      cookie: ownerCookie
    },
    payload: {}
  });
  const invite = CampaignInviteCreateResponseSchema.parse(inviteResponse.json());
  const campaign = database.campaigns.find(
    (candidate) => candidate.id === created.campaign.id
  );

  assert.ok(campaign);
  campaign.has_begun = true;

  for (const response of [
    await app.inject({
      method: "GET",
      url: `/api/invites/${invite.invite.token}/preview`,
      headers: {
        cookie: joinerCookie
      }
    }),
    await app.inject({
      method: "POST",
      url: `/api/invites/${invite.invite.token}/join`,
      headers: {
        cookie: joinerCookie
      },
      payload: {
        clientId: "late-invite-client",
        username: "Late Player",
        characterName: "Late",
        characterSheet: "Too late."
      }
    }),
    await app.inject({
      method: "POST",
      url: "/api/campaigns/join/preview",
      headers: {
        cookie: joinerCookie
      },
      payload: {
        gameCode: created.campaign.joinCode
      }
    }),
    await app.inject({
      method: "POST",
      url: "/api/campaigns/join",
      headers: {
        cookie: joinerCookie
      },
      payload: {
        gameCode: created.campaign.joinCode,
        clientId: "late-code-client",
        username: "Late Player",
        characterName: "Late",
        characterSheet: "Too late."
      }
    })
  ]) {
    assert.equal(response.statusCode, 409, response.body);
    assert.match(
      ApiErrorResponseSchema.parse(response.json()).error.message,
      /already begun/
    );
  }
});
