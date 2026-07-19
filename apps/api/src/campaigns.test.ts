import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiErrorResponseSchema,
  CampaignCreateResponseSchema,
  CampaignJoinPreviewResponseSchema,
  CampaignJoinResponseSchema,
  CampaignListResponseSchema,
  CampaignReadResponseSchema,
  CampaignSoloTurnResponseSchema
} from "@ai-dnd/contracts";

import {
  app,
  database,
  getProviderInputs,
  resetProviderInputs,
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

  assert.equal(createResponse.statusCode, 201);

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
