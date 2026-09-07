import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import {
  ApiErrorResponseSchema,
  CharacterBackstoryGenerateResponseSchema,
  CampaignInviteCreateResponseSchema,
  CampaignInviteDisableResponseSchema,
  CampaignInviteListResponseSchema,
  CampaignCreateResponseSchema,
  CampaignNpcCardUpdateResponseSchema,
  CampaignNpcCardsResponseSchema,
  CampaignJoinPreviewResponseSchema,
  CampaignJoinResponseSchema,
  CampaignRestartResponseSchema,
  CharacterPortraitPreviewResponseSchema,
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
import {
  generateCharacterPortraitForCampaign,
  generateCharacterPortraitPreview
} from "./character-portrait-generation.js";
import { loadConfig } from "./config.js";

test("character portrait generation rejects unsupported model selections early", async () => {
  const result = await generateCharacterPortraitForCampaign({
    db: {} as never,
    config: loadConfig({ NODE_ENV: "test" }),
    campaignId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    imageModel: "not-qwen" as never
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "That character portrait model is not supported yet."
  });
});

test("character portrait preview rejects unsupported model selections early", async () => {
  const result = await generateCharacterPortraitPreview({
    characterName: "Mira",
    characterSheet: "Level 5 Fighter",
    imageModel: "not-qwen" as never
  });

  assert.deepEqual(result, {
    status: "skipped",
    reason: "That character portrait model is not supported yet."
  });
});

test("character portrait preview reports unconfigured image generation", async () => {
  const originalQwenImageApiKey = process.env.QWEN_IMAGE_API_KEY;
  const originalDashscopeApiKey = process.env.DASHSCOPE_API_KEY;
  const originalQwenApiKey = process.env.QWEN_API_KEY;
  const originalCwd = process.cwd();
  const emptyCwd = await mkdtemp(join(tmpdir(), "portrait-preview-unconfigured-"));

  delete process.env.QWEN_IMAGE_API_KEY;
  delete process.env.DASHSCOPE_API_KEY;
  delete process.env.QWEN_API_KEY;

  try {
    process.chdir(emptyCwd);

    const result = await generateCharacterPortraitPreview({
      characterName: "Mira",
      characterSheet: "Level 5 Fighter",
      imageModel: "qwen"
    });

    assert.deepEqual(result, {
      status: "skipped",
      reason: "Qwen image generation is not configured."
    });
  } finally {
    if (originalQwenImageApiKey === undefined) {
      delete process.env.QWEN_IMAGE_API_KEY;
    } else {
      process.env.QWEN_IMAGE_API_KEY = originalQwenImageApiKey;
    }

    if (originalDashscopeApiKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = originalDashscopeApiKey;
    }

    if (originalQwenApiKey === undefined) {
      delete process.env.QWEN_API_KEY;
    } else {
      process.env.QWEN_API_KEY = originalQwenApiKey;
    }

    process.chdir(originalCwd);
    await rm(emptyCwd, { recursive: true, force: true });
  }
});

test("character portrait generation reports unconfigured OpenAI image generation", async () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalCwd = process.cwd();
  const emptyCwd = await mkdtemp(join(tmpdir(), "portrait-openai-unconfigured-"));

  delete process.env.OPENAI_API_KEY;

  try {
    process.chdir(emptyCwd);

    const result = await generateCharacterPortraitForCampaign({
      db: {} as never,
      config: loadConfig({ NODE_ENV: "test" }),
      campaignId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      imageModel: "openai"
    });

    assert.deepEqual(result, {
      status: "skipped",
      reason: "OpenAI image generation is not configured."
    });
  } finally {
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }

    process.chdir(originalCwd);
    await rm(emptyCwd, { recursive: true, force: true });
  }
});

test("character portrait preview reports unconfigured OpenAI image generation", async () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalCwd = process.cwd();
  const emptyCwd = await mkdtemp(join(tmpdir(), "portrait-openai-preview-"));

  delete process.env.OPENAI_API_KEY;

  try {
    process.chdir(emptyCwd);

    const result = await generateCharacterPortraitPreview({
      characterName: "Mira",
      characterSheet: "Level 5 Fighter",
      imageModel: "openai"
    });

    assert.deepEqual(result, {
      status: "skipped",
      reason: "OpenAI image generation is not configured."
    });
  } finally {
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }

    process.chdir(originalCwd);
    await rm(emptyCwd, { recursive: true, force: true });
  }
});

test("character portrait preview reports OpenAI provider error details", async () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalOpenAiImageEndpoint = process.env.OPENAI_IMAGE_ENDPOINT;
  const originalOpenAiImageModel = process.env.OPENAI_IMAGE_MODEL;

  process.env.OPENAI_API_KEY = "test-openai-image-key";
  process.env.OPENAI_IMAGE_ENDPOINT = "https://openai-image.example.test/failure";
  process.env.OPENAI_IMAGE_MODEL = "gpt-image-test";

  try {
    const result = await generateCharacterPortraitPreview({
      characterName: "Mira",
      characterSheet: "Level 5 Fighter",
      imageModel: "openai",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "bad_prompt",
              message: "portrait prompt rejected..."
            }
          }),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
              "x-request-id": "req-openai-image-test"
            }
          }
        )
    });

    assert.deepEqual(result, {
      status: "failed",
      reason:
        "OpenAI image generation failed (bad_prompt): portrait prompt rejected. Request ID: req-openai-image-test."
    });
  } finally {
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }

    if (originalOpenAiImageEndpoint === undefined) {
      delete process.env.OPENAI_IMAGE_ENDPOINT;
    } else {
      process.env.OPENAI_IMAGE_ENDPOINT = originalOpenAiImageEndpoint;
    }

    if (originalOpenAiImageModel === undefined) {
      delete process.env.OPENAI_IMAGE_MODEL;
    } else {
      process.env.OPENAI_IMAGE_MODEL = originalOpenAiImageModel;
    }
  }
});

test("character portrait preview handles OpenAI base64 and empty image responses", async () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalOpenAiImageEndpoint = process.env.OPENAI_IMAGE_ENDPOINT;
  const originalOpenAiImageModel = process.env.OPENAI_IMAGE_MODEL;

  process.env.OPENAI_API_KEY = "test-openai-image-key";
  process.env.OPENAI_IMAGE_MODEL = "gpt-image-test";

  try {
    process.env.OPENAI_IMAGE_ENDPOINT =
      "https://openai-image.example.test/base64";
    const ready = await generateCharacterPortraitPreview({
      characterName: "Mira",
      characterSheet: "Level 5 Fighter",
      imageModel: "openai",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { prompt?: string };

        assert.match(
          body.prompt ?? "",
          /premium painterly tabletop RPG fantasy realism/
        );

        return new Response(
          JSON.stringify({
            data: [
              {
                b64_json: Buffer.from("portrait").toString("base64")
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }
    });

    assert.equal(ready.status, "ready");
    if (ready.status === "ready") {
      assert.equal(ready.contentType, "image/jpeg");
      assert.match(ready.imageDataUrl, /^data:image\/jpeg;base64,/);
    }

    process.env.OPENAI_IMAGE_ENDPOINT =
      "https://openai-image.example.test/empty";
    const empty = await generateCharacterPortraitPreview({
      characterName: "Mira",
      characterSheet: "Level 5 Fighter",
      imageModel: "openai",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            data: [{}]
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "req-openai-empty"
            }
          }
        )
    });

    assert.deepEqual(empty, {
      status: "failed",
      reason:
        "OpenAI image generation returned no image data. Request ID: req-openai-empty."
    });
  } finally {
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }

    if (originalOpenAiImageEndpoint === undefined) {
      delete process.env.OPENAI_IMAGE_ENDPOINT;
    } else {
      process.env.OPENAI_IMAGE_ENDPOINT = originalOpenAiImageEndpoint;
    }

    if (originalOpenAiImageModel === undefined) {
      delete process.env.OPENAI_IMAGE_MODEL;
    } else {
      process.env.OPENAI_IMAGE_MODEL = originalOpenAiImageModel;
    }
  }
});

test("POST /api/campaigns/backstory generates a focused, player-readable character backstory", async () => {
  resetProviderInputs();
  setProviderOverride(async () => {
    const content = JSON.stringify({
      backstory:
        "Mira Vale learned the sea keeps better records than any court, especially when Ilyra Fen vanished with a tide-priest's ledger.",
      eldermereStart: {
        regionName: "The Salt Concordat",
        settlementName: "Selwick",
        reason: "The backstory centers on ports, ledgers, and sea debts."
      }
    });

    return {
      id: "provider-backstory-1",
      content,
      debug: {
        requestMessages: [],
        rawResponse: content,
        model: "test-model",
        temperature: 0.8,
        providerTimings: []
      }
    };
  });
  const cookie = await signIn("backstory-writer@example.com");
  const response = await app.inject({
    method: "POST",
    url: "/api/campaigns/backstory",
    headers: {
      cookie
    },
    payload: {
      mode: "generate",
      characterSheet: "Character Name: Mira Vale\nClass: Fighter",
      campaignGenre: "Eldermere",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "eldermere"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(CharacterBackstoryGenerateResponseSchema.parse(response.json()), {
    backstory:
      "Mira Vale learned the sea keeps better records than any court, especially when Ilyra Fen vanished with a tide-priest's ledger.",
    eldermereStart: {
      regionName: "The Salt Concordat",
      settlementName: "Selwick",
      reason: "The backstory centers on ports, ledgers, and sea debts."
    }
  });

  const providerInput = getProviderInputs().at(-1);

  assert.match(providerInput?.message ?? "", /Character Name: Mira Vale/);
  assert.match(providerInput?.message ?? "", /Validated people names for this backstory:/);
  assert.match(providerInput?.message ?? "", /Use these validated candidate names only when inventing people/);
  assert.match(providerInput?.message ?? "", /Masculine people:/);
  assert.match(providerInput?.message ?? "", /Feminine people:/);
  assert.match(providerInput?.message ?? "", /Neutral people:/);
  assert.match(providerInput?.message ?? "", /gender group that fits the person's stated role or gender/);
  assert.doesNotMatch(providerInput?.message ?? "", /Factions and organizations:/);
  assert.doesNotMatch(providerInput?.message ?? "", /inventing new people, families, places/);
  assert.match(providerInput?.message ?? "", /World: Eldermere/);
  assert.match(providerInput?.message ?? "", /Canonical Eldermere start options:/);
  assert.match(providerInput?.message ?? "", /Region: The Salt Concordat/);
  assert.match(
    providerInput?.message ?? "",
    /Settlements: Corvane, Selwick, Gullswatch, Barnacle Reach, Skerrywatch, Driftwood Landing/
  );
  assert.match(providerInput?.message ?? "", /eldermereStart\.regionName/);
  assert.match(providerInput?.message ?? "", /Use generated names only for people/i);
  assert.match(providerInput?.message ?? "", /only newly invented proper nouns allowed are people names/i);
  assert.match(providerInput?.message ?? "", /Do not give names to ships, taverns, guilds/i);
  assert.match(providerInput?.instructions ?? "", /invented proper nouns are allowed only for people/i);
  assert.match(providerInput?.instructions ?? "", /Explain any setting terms inside the prose itself/i);
  assert.match(providerInput?.message ?? "", /Backstory override for Eldermere opener context/i);
  assert.match(providerInput?.message ?? "", /one clear chain: a close relationship or ordinary part of the character's life, one specific event that changed them, and what they began doing afterward/i);
  assert.match(providerInput?.message ?? "", /Do not summarize the character with abstract claims/i);
  assert.match(providerInput?.message ?? "", /no more than one named setting detail/i);
  assert.match(providerInput?.message ?? "", /Do not require an unresolved hook/i);
  assert.match(providerInput?.message ?? "", /final paragraph shows how the character moved forward/i);
  assert.match(providerInput?.message ?? "", /Length: 150-250 words/i);
  assert.match(
    providerInput?.message ?? "", /Explain why a person matters to the character, not why they matter to the wider world/i
  );
  assert.doesNotMatch(providerInput?.message ?? "", /Include 2-4 usable story hooks/i);
  assert.doesNotMatch(providerInput?.message ?? "", /why those people matter not only to the player character, but also to the living world/i);
  assert.doesNotMatch(providerInput?.message ?? "", /Current backstory field/i);
  resetProviderInputs();
});

test("POST /api/campaigns/backstory requires existing text when adding details", async () => {
  const cookie = await signIn("backstory-empty-details@example.com");
  const response = await app.inject({
    method: "POST",
    url: "/api/campaigns/backstory",
    headers: {
      cookie
    },
    payload: {
      mode: "add_details",
      characterSheet: "Character Name: Mira Vale\nClass: Fighter",
      currentBackstory: ""
    }
  });
  const error = ApiErrorResponseSchema.parse(response.json());

  assert.equal(response.statusCode, 400);
  assert.equal(error.error.message, "Write a backstory before adding details.");
});

test("POST /api/campaigns/backstory adds details and falls back to plain prose", async () => {
  resetProviderInputs();
  setProviderOverride(async () => {
    const content =
      "Mira once carried a lighthouse key through a storm and still checks every lock twice.";

    return {
      id: "provider-backstory-details",
      content,
      debug: {
        requestMessages: [],
        rawResponse: content,
        model: "test-model",
        temperature: 0.8,
        providerTimings: []
      }
    };
  });
  const cookie = await signIn("backstory-details@example.com");
  const response = await app.inject({
    method: "POST",
    url: "/api/campaigns/backstory",
    headers: {
      cookie
    },
    payload: {
      mode: "add_details",
      characterSheet: "Character Name: Mira Vale\nClass: Fighter",
      currentBackstory: "x",
      campaignGenre: "Clockwork Isles",
      campaignGenreKind: "custom",
      customWorldName: "Clockwork Isles",
      customWorldDescription: "A chain of islands powered by old machines."
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(CharacterBackstoryGenerateResponseSchema.parse(response.json()), {
    backstory:
      "Mira once carried a lighthouse key through a storm and still checks every lock twice."
  });

  const providerInput = getProviderInputs().at(-1);

  assert.match(providerInput?.message ?? "", /Player-written backstory:/);
  assert.match(providerInput?.message ?? "", /Player-written backstory:\nx/);
  assert.match(providerInput?.message ?? "", /Add detail only when it strengthens the existing relationship, event, or aftermath/i);
  assert.match(providerInput?.message ?? "", /Do not add new subplots, mysteries, prophecies, tragedies, factions, goals, or adventure hooks/i);
  assert.match(providerInput?.message ?? "", /Stay close to the original length/i);
  assert.match(providerInput?.message ?? "", /World: Clockwork Isles/);
  assert.doesNotMatch(providerInput?.message ?? "", /Canonical Eldermere start options:/);
  resetProviderInputs();
});

test("POST /api/campaigns/backstory add details localizes Eldermere details", async () => {
  resetProviderInputs();
  setProviderOverride(async () => {
    const content = JSON.stringify({
      backstory:
        "Mira carried her lighthouse debt into Selwick, where the Salt Concordat measures every promise against the tide.",
      eldermereStart: {
        regionName: "The Salt Concordat",
        settlementName: "Selwick",
        reason: "The enriched backstory turns Mira's debt into port trouble."
      }
    });

    return {
      id: "provider-backstory-eldermere-details",
      content,
      debug: {
        requestMessages: [],
        rawResponse: content,
        model: "test-model",
        temperature: 0.8,
        providerTimings: []
      }
    };
  });
  const cookie = await signIn("backstory-eldermere-details@example.com");
  const response = await app.inject({
    method: "POST",
    url: "/api/campaigns/backstory",
    headers: {
      cookie
    },
    payload: {
      mode: "add_details",
      characterSheet: "Character Name: Mira Vale\nClass: Fighter",
      currentBackstory: "Mira owes money to people at a port.",
      campaignGenre: "Eldermere",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "eldermere"
    }
  });

  assert.equal(response.statusCode, 200);

  const providerInput = getProviderInputs().at(-1);

  assert.match(providerInput?.message ?? "", /Clarify and enrich the player-written backstory/i);
  assert.match(
    providerInput?.message ?? "",
    /convert generic or non-canonical places, factions, institutions, threats, magic, customs, and historical references into Eldermere-native equivalents/i
  );
  assert.match(providerInput?.message ?? "", /When the world is Eldermere/i);
  assert.match(providerInput?.message ?? "", /Canonical Eldermere start options:/);
  resetProviderInputs();
});

test("POST /api/campaigns/backstory localizes Eldermere backstory with minimal changes", async () => {
  resetProviderInputs();
  setProviderOverride(async () => {
    const content = JSON.stringify({
      backstory:
        "Mira left her harbor home for Selwick after a dockside creditor tied her family's debt to an old Salt Concordat tithe.",
      eldermereStart: {
        regionName: "The Salt Concordat",
        settlementName: "Selwick",
        reason: "The localized backstory points toward Selwick debt trouble."
      }
    });

    return {
      id: "provider-backstory-localize",
      content,
      debug: {
        requestMessages: [],
        rawResponse: content,
        model: "test-model",
        temperature: 0.8,
        providerTimings: []
      }
    };
  });
  const cookie = await signIn("backstory-localize@example.com");
  const response = await app.inject({
    method: "POST",
    url: "/api/campaigns/backstory",
    headers: {
      cookie
    },
    payload: {
      mode: "localize",
      characterSheet: "Character Name: Mira Vale\nClass: Fighter",
      currentBackstory:
        "Mira left her harbor home after a dockside creditor tied her family's debt to an old coastal tax.",
      campaignGenre: "Eldermere",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "eldermere"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(CharacterBackstoryGenerateResponseSchema.parse(response.json()), {
    backstory:
      "Mira left her harbor home for Selwick after a dockside creditor tied her family's debt to an old Salt Concordat tithe.",
    eldermereStart: {
      regionName: "The Salt Concordat",
      settlementName: "Selwick",
      reason: "The localized backstory points toward Selwick debt trouble."
    }
  });

  const providerInput = getProviderInputs().at(-1);

  assert.match(providerInput?.message ?? "", /Localize the player-written backstory/i);
  assert.match(providerInput?.message ?? "", /changing as little as possible/i);
  assert.match(providerInput?.message ?? "", /Do not expand the backstory into a new story/i);
  assert.match(providerInput?.message ?? "", /Player-written backstory:/);
  assert.match(providerInput?.message ?? "", /old coastal tax/);
  assert.match(providerInput?.message ?? "", /Canonical Eldermere start options:/);
  resetProviderInputs();
});

test("POST /api/campaigns/backstory accepts Eldermere starts without reasons", async () => {
  resetProviderInputs();
  setProviderOverride(async () => {
    const content = JSON.stringify({
      backstory: "Mira follows a salt-stained debt into Selwick.",
      eldermereStart: {
        regionName: "The Salt Concordat",
        settlementName: "Selwick"
      }
    });

    return {
      id: "provider-backstory-eldermere-no-reason",
      content,
      debug: {
        requestMessages: [],
        rawResponse: content,
        model: "test-model",
        temperature: 0.8,
        providerTimings: []
      }
    };
  });
  const cookie = await signIn("backstory-eldermere-no-reason@example.com");
  const response = await app.inject({
    method: "POST",
    url: "/api/campaigns/backstory",
    headers: {
      cookie
    },
    payload: {
      mode: "generate",
      characterSheet: "Character Name: Mira Vale\nClass: Fighter",
      campaignGenre: "Eldermere",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "eldermere"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(CharacterBackstoryGenerateResponseSchema.parse(response.json()), {
    backstory: "Mira follows a salt-stained debt into Selwick.",
    eldermereStart: {
      regionName: "The Salt Concordat",
      settlementName: "Selwick"
    }
  });
  resetProviderInputs();
});

test("POST /api/campaigns/:campaignId/restart/backstory generates from the saved character and campaign world", async () => {
  const cookie = await signIn("restart-backstory@example.com");
  resetProviderInputs();

  try {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: { cookie },
      payload: {
        mode: "single_player",
        campaignGenreKind: "preset",
        campaignGenrePresetId: "eldermere",
        ownerClientId: "restart-backstory-client",
        playerName: "Mira",
        characterName: "Mira",
        characterSheet:
          "Character Name: Mira\nClass: Rogue\nBackstory\nMira follows a brass compass toward Selwick.",
        eldermereStart: {
          regionName: "The Salt Concordat",
          settlementName: "Selwick"
        }
      }
    });

    assert.equal(createResponse.statusCode, 201, createResponse.body);
    const created = CampaignCreateResponseSchema.parse(createResponse.json());
    resetProviderInputs();
    setProviderOverride(async () => {
      const content = JSON.stringify({
        backstory:
          "Mira sharpens her oath around the old shrine bell and the debt she still owes.",
        eldermereStart: {
          regionName: "The Salt Concordat",
          settlementName: "Selwick",
          reason: "The backstory keeps Mira pointed at Selwick."
        }
      });

      return {
        id: "provider-restart-backstory",
        content,
        debug: {
          requestMessages: [],
          rawResponse: content,
          model: "test-model",
          temperature: 0.8,
          providerTimings: []
        }
      };
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/campaigns/${created.campaign.id}/restart/backstory`,
      headers: { cookie },
      payload: {
        mode: "add_details",
        currentBackstory: "Mira follows a brass compass toward Selwick."
      }
    });

    assert.equal(response.statusCode, 200, response.body);
    const parsed = CharacterBackstoryGenerateResponseSchema.parse(response.json());
    const providerInput = getProviderInputs().at(0);

    assert.match(parsed.backstory, /old shrine bell/);
    assert.deepEqual(parsed.eldermereStart, {
      regionName: "The Salt Concordat",
      settlementName: "Selwick",
      reason: "The backstory keeps Mira pointed at Selwick."
    });
    assert.match(providerInput?.message ?? "", /Mira follows a brass compass/);
    assert.match(providerInput?.message ?? "", /Player-written backstory:/);
    assert.match(providerInput?.message ?? "", /Eldermere/);
  } finally {
    resetProviderInputs();
  }
});

test("POST /api/campaigns/:campaignId/restart/backstory rejects invalid restart backstory contexts", async () => {
  const cookie = await signIn("restart-backstory-errors@example.com");

  const emptyDetailsResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns/00000000-0000-4000-8000-000000000404/restart/backstory",
    headers: { cookie },
    payload: {
      mode: "add_details",
      currentBackstory: ""
    }
  });

  assert.equal(emptyDetailsResponse.statusCode, 400, emptyDetailsResponse.body);
  assert.equal(
    ApiErrorResponseSchema.parse(emptyDetailsResponse.json()).error.message,
    "Write a backstory before adding details."
  );

  const missingResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns/00000000-0000-4000-8000-000000000404/restart/backstory",
    headers: { cookie },
    payload: {
      mode: "generate"
    }
  });

  assert.equal(missingResponse.statusCode, 404, missingResponse.body);
  assert.equal(
    ApiErrorResponseSchema.parse(missingResponse.json()).error.message,
    "Campaign not found."
  );

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: { cookie },
    payload: {
      mode: "multiplayer",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "restart-backstory-errors-client",
      playerName: "Table Owner"
    }
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  const multiplayerResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/restart/backstory`,
    headers: { cookie },
    payload: {
      mode: "generate"
    }
  });

  assert.equal(multiplayerResponse.statusCode, 400, multiplayerResponse.body);
  assert.equal(
    ApiErrorResponseSchema.parse(multiplayerResponse.json()).error.message,
    "Campaign restart is available for singleplayer adventures."
  );
});

test("POST /api/campaigns/:campaignId/restart creates a fresh singleplayer campaign", async () => {
  const cookie = await signIn("restart-success@example.com");
  resetProviderInputs();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: { cookie },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "restart-success-client",
      playerName: "Mira",
      characterName: "Mira",
      characterSheet:
        "Character Name: Mira\nClass: Rogue\nBackstory\nMira began beside the first road."
    }
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);
  const created = CampaignCreateResponseSchema.parse(createResponse.json());
  resetProviderInputs();

  const response = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/restart`,
    headers: { cookie },
    payload: {
      backstory: "Mira restarts beside a stranger shrine and a brighter moon."
    }
  });

  assert.equal(response.statusCode, 201, response.body);
  const restarted = CampaignRestartResponseSchema.parse(response.json());
  const restartedPlayer = database.players.find(
    (player) => player.campaign_id === restarted.campaign.id
  );
  const sourcePlayer = database.players.find(
    (player) => player.campaign_id === created.campaign.id
  );

  assert.notEqual(restarted.campaign.id, created.campaign.id);
  assert.equal(restarted.campaign.mode, "single_player");
  assert.equal(restarted.campaign.title, created.campaign.title);
  assert.equal(restartedPlayer?.character_name, sourcePlayer?.character_name);
  assert.match(
    restartedPlayer?.character_sheet ?? "",
    /Mira restarts beside a stranger shrine/
  );
  assert.equal(
    database.campaignEvents.some(
      (event) =>
        event.campaign_id === created.campaign.id &&
        event.type === "campaign_restart_diagnostic"
    ),
    true
  );
});

test("POST /api/campaigns/:campaignId/restart logs and returns restart failures", async () => {
  const cookie = await signIn("restart-failure@example.com");

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: { cookie },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "restart-failure-client",
      playerName: "Mira",
      characterName: "Mira",
      characterSheet: "Character Name: Mira\nClass: Rogue"
    }
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  const response = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/restart`,
    headers: { cookie },
    payload: {
      backstory: "   "
    }
  });

  assert.equal(response.statusCode, 400, response.body);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).error.message,
    "Write a backstory before restarting."
  );
});

test("character portrait preview reports provider failures", async () => {
  const originalQwenImageApiKey = process.env.QWEN_IMAGE_API_KEY;
  const originalQwenImageEndpoint = process.env.QWEN_IMAGE_ENDPOINT;
  const originalQwenImageModel = process.env.QWEN_IMAGE_MODEL;

  process.env.QWEN_IMAGE_API_KEY = "test-qwen-image-key";
  process.env.QWEN_IMAGE_ENDPOINT = "https://qwen-image.example.test/failure";
  process.env.QWEN_IMAGE_MODEL = "qwen-image-failure-model";

  try {
    const result = await generateCharacterPortraitPreview({
      characterName: "Mira",
      characterSheet: "Level 5 Fighter",
      imageModel: "qwen",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: "BadRequest",
            message: "preview prompt rejected"
          }),
          {
            status: 400,
            headers: {
              "content-type": "application/json"
            }
          }
        )
    });

    assert.deepEqual(result, {
      status: "failed",
      reason: "preview prompt rejected"
    });
  } finally {
    if (originalQwenImageApiKey === undefined) {
      delete process.env.QWEN_IMAGE_API_KEY;
    } else {
      process.env.QWEN_IMAGE_API_KEY = originalQwenImageApiKey;
    }

    if (originalQwenImageEndpoint === undefined) {
      delete process.env.QWEN_IMAGE_ENDPOINT;
    } else {
      process.env.QWEN_IMAGE_ENDPOINT = originalQwenImageEndpoint;
    }

    if (originalQwenImageModel === undefined) {
      delete process.env.QWEN_IMAGE_MODEL;
    } else {
      process.env.QWEN_IMAGE_MODEL = originalQwenImageModel;
    }
  }
});

test("character portrait preview applies Qwen defaults and fallback prompt fields", async () => {
  const originalQwenImageApiKey = process.env.QWEN_IMAGE_API_KEY;
  const originalDashscopeApiKey = process.env.DASHSCOPE_API_KEY;
  const originalQwenApiKey = process.env.QWEN_API_KEY;
  const originalQwenImageEndpoint = process.env.QWEN_IMAGE_ENDPOINT;
  const originalQwenBaseUrl = process.env.QWEN_BASE_URL;
  const originalQwenImageModel = process.env.QWEN_IMAGE_MODEL;
  const originalCwd = process.cwd();
  const emptyCwd = await mkdtemp(join(tmpdir(), "portrait-preview-qwen-defaults-"));

  delete process.env.QWEN_IMAGE_API_KEY;
  delete process.env.DASHSCOPE_API_KEY;
  process.env.QWEN_API_KEY = "fallback-qwen-key";
  delete process.env.QWEN_IMAGE_ENDPOINT;
  process.env.QWEN_BASE_URL = "not a url";
  delete process.env.QWEN_IMAGE_MODEL;
  process.chdir(emptyCwd);

  try {
    const result = await generateCharacterPortraitPreview({
      characterName: " ",
      playerName: " ",
      characterSheet: "A careful wanderer with a patched cloak.",
      artStyle: "ink_and_watercolor",
      imageModel: "qwen",
      fetchImpl: async (url, init) => {
        if (
          String(url) ===
          "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
        ) {
          const headers = new Headers(init?.headers);
          assert.equal(headers.get("authorization"), "Bearer fallback-qwen-key");
          const body = JSON.parse(String(init?.body)) as {
            input?: { messages?: { content?: { text?: string }[] }[] };
            model?: string;
          };
          const prompt = body.input?.messages?.[0]?.content?.[0]?.text ?? "";

          assert.equal(body.model, "qwen-image-2.0-pro");
          assert.match(prompt, /Create fantasy character key art for Adventurer/);
          assert.match(prompt, /Campaign world or genre: fantasy/);
          assert.match(prompt, /expressive ink lines with layered watercolor washes/);

          return new Response(
            JSON.stringify({
              output: {
                choices: [
                  {
                    message: {
                      content: [
                        {
                          image: "https://qwen-image.example.test/defaults.png"
                        }
                      ]
                    }
                  }
                ]
              }
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          );
        }

        if (String(url) === "https://qwen-image.example.test/defaults.png") {
          return new Response(Buffer.from("portrait"), {
            status: 200
          });
        }

        throw new Error(`Unexpected fetch URL: ${String(url)}`);
      }
    });

    assert.equal(result.status, "ready");
    if (result.status === "ready") {
      assert.equal(result.contentType, "image/png");
      assert.match(result.imageDataUrl, /^data:image\/png;base64,/);
    }

    process.env.QWEN_BASE_URL = "https://api.example.test";

    const nonDashscopeBaseUrlResult = await generateCharacterPortraitPreview({
      characterName: "Adventurer",
      characterSheet: "A careful wanderer with a patched cloak.",
      imageModel: "qwen",
      fetchImpl: async (url) => {
        if (String(url) === "https://qwen-image.example.test/defaults.png") {
          return new Response(Buffer.from("portrait"), {
            status: 200
          });
        }

        assert.equal(
          String(url),
          "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
        );

        return new Response(
          JSON.stringify({
            output: {
              choices: [
                {
                  message: {
                    content: [
                      {
                        image: "https://qwen-image.example.test/defaults.png"
                      }
                    ]
                  }
                }
              ]
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }
    });

    assert.equal(nonDashscopeBaseUrlResult.status, "ready");
    if (nonDashscopeBaseUrlResult.status === "ready") {
      assert.equal(nonDashscopeBaseUrlResult.contentType, "image/png");
    }
  } finally {
    if (originalQwenImageApiKey === undefined) {
      delete process.env.QWEN_IMAGE_API_KEY;
    } else {
      process.env.QWEN_IMAGE_API_KEY = originalQwenImageApiKey;
    }

    if (originalDashscopeApiKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = originalDashscopeApiKey;
    }

    if (originalQwenApiKey === undefined) {
      delete process.env.QWEN_API_KEY;
    } else {
      process.env.QWEN_API_KEY = originalQwenApiKey;
    }

    if (originalQwenImageEndpoint === undefined) {
      delete process.env.QWEN_IMAGE_ENDPOINT;
    } else {
      process.env.QWEN_IMAGE_ENDPOINT = originalQwenImageEndpoint;
    }

    if (originalQwenBaseUrl === undefined) {
      delete process.env.QWEN_BASE_URL;
    } else {
      process.env.QWEN_BASE_URL = originalQwenBaseUrl;
    }

    if (originalQwenImageModel === undefined) {
      delete process.env.QWEN_IMAGE_MODEL;
    } else {
      process.env.QWEN_IMAGE_MODEL = originalQwenImageModel;
    }

    process.chdir(originalCwd);
    await rm(emptyCwd, { recursive: true, force: true });
  }
});

test("POST /api/campaigns/portrait/preview generates transient art without campaign rows", async () => {
  const cookie = await signIn("portrait-preview-owner@example.com");
  const originalFetch = globalThis.fetch;
  const originalQwenImageApiKey = process.env.QWEN_IMAGE_API_KEY;
  const originalQwenImageEndpoint = process.env.QWEN_IMAGE_ENDPOINT;
  const originalQwenImageModel = process.env.QWEN_IMAGE_MODEL;
  const imageBuffer = await sharp({
    create: {
      width: 96,
      height: 96,
      channels: 4,
      background: "#0f766e"
    }
  })
    .png()
    .toBuffer();
  const campaignsBefore = database.campaigns.length;
  const mediaAssetsBefore = database.mediaAssets.length;

  process.env.QWEN_IMAGE_API_KEY = "test-qwen-image-key";
  process.env.QWEN_IMAGE_ENDPOINT = "https://qwen-image.example.test/generation";
  process.env.QWEN_IMAGE_MODEL = "qwen-image-2.0-pro";
  globalThis.fetch = (async (url, init) => {
    if (String(url) === "https://qwen-image.example.test/generation") {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer test-qwen-image-key");
      const body = JSON.parse(String(init?.body)) as {
        input?: {
          messages?: { content?: { text?: string }[] }[];
        };
      };
      const prompt = body.input?.messages?.[0]?.content?.[0]?.text ?? "";

      assert.match(prompt, /Create fantasy character key art for Mira/);
      assert.match(prompt, /Campaign world or genre: Clockwork Isles/);
      assert.match(prompt, /richly textured fantasy storybook illustration/);

      return new Response(
        JSON.stringify({
          request_id: "qwen-image-preview-request-1",
          output: {
            choices: [
              {
                message: {
                  content: [
                    {
                      image: "https://qwen-image.example.test/preview.png"
                    }
                  ]
                }
              }
            ]
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    if (String(url) === "https://qwen-image.example.test/preview.png") {
      return new Response(imageBuffer, {
        status: 200,
        headers: {
          "content-type": "image/png"
        }
      });
    }

    throw new Error(`Unexpected fetch URL: ${String(url)}`);
  }) as typeof fetch;

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/campaigns/portrait/preview",
      headers: {
        cookie
      },
      payload: {
        characterName: " ",
        playerName: "Mira",
        characterSheet: "Level 5 Human Fighter carrying a silver shield.",
        customWorldName: "Clockwork Isles",
        guidelines: "warm tavern light",
        artStyle: "storybook_illustration",
        imageModel: "qwen"
      }
    });

    assert.equal(response.statusCode, 200, response.body);

    const preview = CharacterPortraitPreviewResponseSchema.parse(response.json());
    assert.equal(preview.contentType, "image/png");
    assert.match(preview.imageDataUrl, /^data:image\/png;base64,/);
    assert.equal(database.campaigns.length, campaignsBefore);
    assert.equal(database.mediaAssets.length, mediaAssetsBefore);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.QWEN_IMAGE_API_KEY = originalQwenImageApiKey;
    process.env.QWEN_IMAGE_ENDPOINT = originalQwenImageEndpoint;
    process.env.QWEN_IMAGE_MODEL = originalQwenImageModel;
  }
});

test("POST /api/campaigns/portrait/preview can use OpenAI GPT Image", async () => {
  const cookie = await signIn("portrait-openai-preview-owner@example.com");
  const originalFetch = globalThis.fetch;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalOpenAiImageEndpoint = process.env.OPENAI_IMAGE_ENDPOINT;
  const originalOpenAiImageModel = process.env.OPENAI_IMAGE_MODEL;
  const imageBuffer = await sharp({
    create: {
      width: 96,
      height: 96,
      channels: 4,
      background: "#1d4ed8"
    }
  })
    .jpeg()
    .toBuffer();

  process.env.OPENAI_API_KEY = "test-openai-image-key";
  process.env.OPENAI_IMAGE_ENDPOINT =
    "https://openai-image.example.test/generations";
  process.env.OPENAI_IMAGE_MODEL = "gpt-image-2";
  globalThis.fetch = (async (url, init) => {
    if (String(url) === "https://openai-image.example.test/result.jpg") {
      return new Response(imageBuffer, {
        status: 200,
        headers: {
          "content-type": "image/jpeg"
        }
      });
    }

    assert.equal(String(url), "https://openai-image.example.test/generations");

    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer test-openai-image-key");
    const body = JSON.parse(String(init?.body)) as {
      model?: string;
      prompt?: string;
      n?: number;
      size?: string;
      quality?: string;
      output_format?: string;
      output_compression?: number;
    };

    assert.equal(body.model, "gpt-image-2");
    assert.match(
      body.prompt ?? "",
      /Create fantasy character key art/
    );
    assert.match(body.prompt ?? "", /square 1024 by 1024/);
    assert.match(body.prompt ?? "", /Mira Vale/);
    assert.match(body.prompt ?? "", /Avoid:/);
    assert.equal(body.n, 1);
    assert.equal(body.size, "1024x1024");
    assert.equal(body.quality, "medium");
    assert.equal(body.output_format, "jpeg");
    assert.equal(body.output_compression, 88);

    return new Response(
      JSON.stringify({
        data: [
          {
            url: "https://openai-image.example.test/result.jpg"
          }
        ],
        usage: {
          output_tokens: 196
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "openai-image-preview-request-1"
        }
      }
    );
  }) as typeof fetch;

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/campaigns/portrait/preview",
      headers: {
        cookie
      },
      payload: {
        characterName: "Mira Vale",
        playerName: "Mira",
        characterSheet: "Level 5 Human Fighter carrying a silver shield.",
        campaignGenre: "Eldermere",
        guidelines: "warm tavern light",
        artStyle: "painterly_fantasy",
        imageModel: "openai"
      }
    });

    assert.equal(response.statusCode, 200, response.body);

    const preview = CharacterPortraitPreviewResponseSchema.parse(response.json());
    assert.equal(preview.contentType, "image/jpeg");
    assert.match(preview.imageDataUrl, /^data:image\/jpeg;base64,/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }

    if (originalOpenAiImageEndpoint === undefined) {
      delete process.env.OPENAI_IMAGE_ENDPOINT;
    } else {
      process.env.OPENAI_IMAGE_ENDPOINT = originalOpenAiImageEndpoint;
    }

    if (originalOpenAiImageModel === undefined) {
      delete process.env.OPENAI_IMAGE_MODEL;
    } else {
      process.env.OPENAI_IMAGE_MODEL = originalOpenAiImageModel;
    }
  }
});

test("POST /api/campaigns/portrait/preview exposes image provider failures", async () => {
  const cookie = await signIn("portrait-openai-failure-owner@example.com");
  const originalFetch = globalThis.fetch;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalOpenAiImageEndpoint = process.env.OPENAI_IMAGE_ENDPOINT;
  const originalOpenAiImageModel = process.env.OPENAI_IMAGE_MODEL;

  process.env.OPENAI_API_KEY = "test-openai-image-key";
  process.env.OPENAI_IMAGE_ENDPOINT =
    "https://openai-image.example.test/failure";
  process.env.OPENAI_IMAGE_MODEL = "gpt-image-2";
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          code: "invalid_request_error",
          message: "Unsupported image parameter."
        }
      }),
      {
        status: 400,
        headers: {
          "content-type": "application/json",
          "x-request-id": "openai-image-error-request-1"
        }
      }
    )) as typeof fetch;

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/campaigns/portrait/preview",
      headers: {
        cookie
      },
      payload: {
        characterName: "Mira Vale",
        characterSheet: "Level 5 Human Fighter",
        imageModel: "openai"
      }
    });

    assert.equal(response.statusCode, 502, response.body);
    assert.match(
      response.body,
      /OpenAI image generation failed \(invalid_request_error\): Unsupported image parameter\. Request ID: openai-image-error-request-1\./
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }

    if (originalOpenAiImageEndpoint === undefined) {
      delete process.env.OPENAI_IMAGE_ENDPOINT;
    } else {
      process.env.OPENAI_IMAGE_ENDPOINT = originalOpenAiImageEndpoint;
    }

    if (originalOpenAiImageModel === undefined) {
      delete process.env.OPENAI_IMAGE_MODEL;
    } else {
      process.env.OPENAI_IMAGE_MODEL = originalOpenAiImageModel;
    }
  }
});

test("POST /api/campaigns can generate and attach a character portrait", async () => {
  const cookie = await signIn("portrait-owner@example.com");
  const originalFetch = globalThis.fetch;
  const originalQwenImageApiKey = process.env.QWEN_IMAGE_API_KEY;
  const originalQwenImageEndpoint = process.env.QWEN_IMAGE_ENDPOINT;
  const originalQwenImageModel = process.env.QWEN_IMAGE_MODEL;
  const imageBuffer = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: "#7c3aed"
    }
  })
    .png()
    .toBuffer();
  const fetchCalls: string[] = [];

  process.env.QWEN_IMAGE_API_KEY = "test-qwen-image-key";
  process.env.QWEN_IMAGE_ENDPOINT = "https://qwen-image.example.test/generation";
  process.env.QWEN_IMAGE_MODEL = "qwen-image-2.0-pro";
  globalThis.fetch = (async (url, init) => {
    fetchCalls.push(String(url));

    if (String(url) === "https://qwen-image.example.test/generation") {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer test-qwen-image-key");
      const body = JSON.parse(String(init?.body)) as {
        model?: string;
        input?: {
          messages?: { content?: { text?: string }[] }[];
        };
        parameters?: {
          size?: string;
        };
      };
      const prompt = body.input?.messages?.[0]?.content?.[0]?.text ?? "";

      assert.equal(body.model, "qwen-image-2.0-pro");
      assert.match(prompt, /Create fantasy character key art/);
      assert.match(prompt, /square 1024 by 1024/);
      assert.match(prompt, /Seraphina/);
      assert.match(prompt, /Level 5 Tiefling Warlock/);
      assert.equal(body.parameters?.size, "1024*1024");

      return new Response(
        JSON.stringify({
          request_id: "qwen-image-request-1",
          output: {
            choices: [
              {
                message: {
                  content: [
                    {
                      image: "https://qwen-image.example.test/result.png"
                    }
                  ]
                }
              }
            ]
          },
          usage: {
            image_count: 1
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    if (String(url) === "https://qwen-image.example.test/result.png") {
      return new Response(imageBuffer, {
        status: 200,
        headers: {
          "content-type": "image/png"
        }
      });
    }

    throw new Error(`Unexpected fetch URL: ${String(url)}`);
  }) as typeof fetch;

  try {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: {
        cookie
      },
      payload: {
        mode: "multiplayer",
        campaignGenreKind: "preset",
        campaignGenrePresetId: "dark_fantasy",
        ownerClientId: "portrait-owner-client",
        playerName: "Portrait Owner",
        characterName: "Seraphina",
        characterSheet:
          "Character Name: Seraphina\nLevel: 5\nClass: Warlock\nSpecies: Tiefling\nDM Brief: Level 5 Tiefling Warlock with a violet pact flame.",
        generateCharacterPortrait: true
      }
    });

    assert.equal(createResponse.statusCode, 201, createResponse.body);

    const created = CampaignCreateResponseSchema.parse(createResponse.json());
    assert.ok(created.campaign.portraitAssetId);
    assert.match(
      created.campaign.portraitUrl ?? "",
      /^\/media\/campaigns\/.+\/512\.webp$/
    );
    assert.deepEqual(fetchCalls, [
      "https://qwen-image.example.test/generation",
      "https://qwen-image.example.test/result.png"
    ]);
    assert.equal(database.mediaAssets.length, 1);
    assert.equal(database.mediaAssets[0]?.status, "ready");
    assert.equal(database.mediaAssets[0]?.provider_request_id, "qwen-image-request-1");
    assert.equal(
      database.players.find((player) => player.client_id === "portrait-owner-client")
        ?.portrait_asset_id,
      created.campaign.portraitAssetId
    );

    const roomResponse = await app.inject({
      method: "GET",
      url: `/api/room?roomId=${encodeURIComponent(created.campaign.id)}`,
      headers: {
        cookie
      }
    });
    assert.equal(roomResponse.statusCode, 200, roomResponse.body);
    const room = roomResponse.json() as {
      players: { portraitUrl?: string; portraitAssetId?: string }[];
    };
    assert.equal(room.players[0]?.portraitUrl, created.campaign.portraitUrl);
    assert.equal(room.players[0]?.portraitAssetId, created.campaign.portraitAssetId);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalQwenImageApiKey === undefined) {
      delete process.env.QWEN_IMAGE_API_KEY;
    } else {
      process.env.QWEN_IMAGE_API_KEY = originalQwenImageApiKey;
    }
    if (originalQwenImageEndpoint === undefined) {
      delete process.env.QWEN_IMAGE_ENDPOINT;
    } else {
      process.env.QWEN_IMAGE_ENDPOINT = originalQwenImageEndpoint;
    }
    if (originalQwenImageModel === undefined) {
      delete process.env.QWEN_IMAGE_MODEL;
    } else {
      process.env.QWEN_IMAGE_MODEL = originalQwenImageModel;
    }
  }
});

test("POST /api/campaigns/:campaignId/portrait/generate creates art after campaign setup", async () => {
  const cookie = await signIn("portrait-route-owner@example.com");
  const originalFetch = globalThis.fetch;
  const originalQwenImageApiKey = process.env.QWEN_IMAGE_API_KEY;
  const originalQwenImageEndpoint = process.env.QWEN_IMAGE_ENDPOINT;
  const originalQwenImageModel = process.env.QWEN_IMAGE_MODEL;
  const imageBuffer = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: "#0f766e"
    }
  })
    .png()
    .toBuffer();

  process.env.QWEN_IMAGE_API_KEY = "test-qwen-route-key";
  process.env.QWEN_IMAGE_ENDPOINT = "https://qwen-image.example.test/route";
  process.env.QWEN_IMAGE_MODEL = "qwen-image-route-model";
  globalThis.fetch = (async (url, init) => {
    if (String(url) === "https://qwen-image.example.test/route") {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer test-qwen-route-key");
      const body = JSON.parse(String(init?.body)) as {
        model?: string;
        input?: {
          messages?: { content?: { text?: string }[] }[];
        };
      };
      const prompt = body.input?.messages?.[0]?.content?.[0]?.text ?? "";

      assert.equal(body.model, "qwen-image-route-model");
      assert.match(prompt, /silver cloak and a wary half-smile/);
      assert.match(prompt, /cinematic fantasy concept art/i);

      return new Response(
        JSON.stringify({
          request_id: "qwen-image-route-request",
          output: {
            choices: [
              {
                message: {
                  content: [
                    {
                      image: "https://qwen-image.example.test/route-result.png"
                    }
                  ]
                }
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (String(url) === "https://qwen-image.example.test/route-result.png") {
      return new Response(imageBuffer, {
        status: 200,
        headers: { "Content-Type": "image/png" }
      });
    }

    throw new Error(`Unexpected fetch URL ${String(url)}`);
  }) as typeof fetch;

  try {
    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: {
        cookie
      },
      payload: {
        mode: "single_player",
        title: "Route Portrait Campaign",
        campaignGenre: "Classic Fantasy",
        campaignGenreKind: "preset",
        campaignGenrePresetId: "classic_fantasy",
        ownerClientId: "portrait-route-owner-client",
        playerName: "Nyra",
        characterName: "Nyra",
        characterSheet: "Level 5 Human Rogue"
      }
    });

    assert.equal(createdResponse.statusCode, 201, createdResponse.body);
    const created = CampaignCreateResponseSchema.parse(createdResponse.json());
    assert.equal(created.campaign.portraitUrl, undefined);

    const portraitResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${created.campaign.id}/portrait/generate`,
      headers: {
        cookie
      },
      payload: {
        guidelines: "silver cloak and a wary half-smile",
        artStyle: "cinematic_concept_art",
        imageModel: "qwen"
      }
    });
    const withPortrait = CampaignCreateResponseSchema.parse(
      portraitResponse.json()
    );

    assert.equal(portraitResponse.statusCode, 200, portraitResponse.body);
    assert.ok(withPortrait.campaign.portraitAssetId);
    assert.match(withPortrait.campaign.portraitUrl ?? "", /\/media\/campaigns\//);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.QWEN_IMAGE_API_KEY = originalQwenImageApiKey;
    process.env.QWEN_IMAGE_ENDPOINT = originalQwenImageEndpoint;
    process.env.QWEN_IMAGE_MODEL = originalQwenImageModel;
  }
});

test("POST /api/campaigns/:campaignId/portrait/generate can start art in the background", async () => {
  const cookie = await signIn("portrait-background-owner@example.com");
  const originalFetch = globalThis.fetch;
  const originalQwenImageApiKey = process.env.QWEN_IMAGE_API_KEY;
  const originalQwenImageEndpoint = process.env.QWEN_IMAGE_ENDPOINT;
  const originalQwenImageModel = process.env.QWEN_IMAGE_MODEL;
  const imageBuffer = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: "#2563eb"
    }
  })
    .png()
    .toBuffer();
  let releaseQwenRequest: (() => void) | undefined;
  const qwenRequestStarted = new Promise<void>((resolve) => {
    globalThis.fetch = (async (url) => {
      if (String(url) === "https://qwen-image.example.test/background") {
        resolve();
        await new Promise<void>((release) => {
          releaseQwenRequest = release;
        });

        return new Response(
          JSON.stringify({
            request_id: "qwen-image-background-request",
            output: {
              choices: [
                {
                  message: {
                    content: [
                      {
                        image:
                          "https://qwen-image.example.test/background-result.png"
                      }
                    ]
                  }
                }
              ]
            }
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      if (
        String(url) === "https://qwen-image.example.test/background-result.png"
      ) {
        return new Response(imageBuffer, {
          status: 200,
          headers: { "Content-Type": "image/png" }
        });
      }

      throw new Error(`Unexpected fetch URL ${String(url)}`);
    }) as typeof fetch;
  });

  process.env.QWEN_IMAGE_API_KEY = "test-qwen-background-key";
  process.env.QWEN_IMAGE_ENDPOINT = "https://qwen-image.example.test/background";
  process.env.QWEN_IMAGE_MODEL = "qwen-image-background-model";

  try {
    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: {
        cookie
      },
      payload: {
        mode: "single_player",
        title: "Background Portrait Campaign",
        campaignGenre: "Classic Fantasy",
        campaignGenreKind: "preset",
        campaignGenrePresetId: "classic_fantasy",
        ownerClientId: "portrait-background-owner-client",
        playerName: "Eris",
        characterName: "Eris",
        characterSheet: "Level 5 Human Wizard"
      }
    });
    const created = CampaignCreateResponseSchema.parse(createdResponse.json());

    const portraitResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${created.campaign.id}/portrait/generate`,
      headers: {
        cookie
      },
      payload: {
        guidelines: "blue cloak with careful eyes",
        artStyle: "ink_and_watercolor",
        imageModel: "qwen",
        background: true
      }
    });
    const immediate = CampaignCreateResponseSchema.parse(portraitResponse.json());

    assert.equal(portraitResponse.statusCode, 200, portraitResponse.body);
    assert.equal(immediate.campaign.portraitUrl, undefined);
    await qwenRequestStarted;

    releaseQwenRequest?.();

    await assert.doesNotReject(async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const readResponse = await app.inject({
          method: "GET",
          url: `/api/room?roomId=${created.campaign.id}&sessionId=${created.campaign.sessionId}`,
          headers: {
            cookie
          }
        });
        const read = readResponse.json() as {
          players?: {
            portraitAssetId?: string;
            portraitUrl?: string;
          }[];
        };
        const player = read.players?.[0];

        if (player?.portraitUrl) {
          assert.ok(player.portraitAssetId);
          assert.match(player.portraitUrl, /\/media\/campaigns\//);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      throw new Error("Background portrait did not finish.");
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.QWEN_IMAGE_API_KEY = originalQwenImageApiKey;
    process.env.QWEN_IMAGE_ENDPOINT = originalQwenImageEndpoint;
    process.env.QWEN_IMAGE_MODEL = originalQwenImageModel;
  }
});

test("POST /api/campaigns/:campaignId/portrait/upload stores user character art", async () => {
  const cookie = await signIn("portrait-upload-owner@example.com");
  const imageBuffer = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: "#92400e"
    }
  })
    .png()
    .toBuffer();
  const createdResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      title: "Uploaded Portrait Campaign",
      campaignGenre: "Classic Fantasy",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "portrait-upload-owner-client",
      playerName: "Orrin",
      characterName: "Orrin",
      characterSheet: "Level 5 Dwarf Cleric"
    }
  });

  assert.equal(createdResponse.statusCode, 201, createdResponse.body);
  const created = CampaignCreateResponseSchema.parse(createdResponse.json());
  const uploadResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/portrait/upload`,
    headers: {
      cookie
    },
    payload: {
      imageDataUrl: `data:image/png;base64,${imageBuffer.toString("base64")}`,
      fileName: "orrin.png",
      guidelines: "keep the amber cloak and holy symbol",
      artStyle: "ink_and_watercolor"
    }
  });
  const uploaded = CampaignCreateResponseSchema.parse(uploadResponse.json());

  assert.equal(uploadResponse.statusCode, 200, uploadResponse.body);
  assert.ok(uploaded.campaign.portraitAssetId);
  assert.match(uploaded.campaign.portraitUrl ?? "", /\/media\/campaigns\//);
  const asset = database.mediaAssets.find(
    (candidate) => candidate.id === uploaded.campaign.portraitAssetId
  );

  assert.equal(asset?.provider, "upload");
  assert.equal(asset?.model, "user-upload");
  assert.match(asset?.prompt ?? "", /amber cloak and holy symbol/);
  assert.equal(
    database.players.find(
      (player) => player.client_id === "portrait-upload-owner-client"
    )?.portrait_asset_id,
    uploaded.campaign.portraitAssetId
  );
});

test("POST /api/campaigns/:campaignId/portrait/upload accepts generated preview-sized payloads", async () => {
  const cookie = await signIn("large-portrait-upload-owner@example.com");
  const width = 800;
  const height = 800;
  const imageBuffer = await sharp(randomBytes(width * height * 3), {
    raw: {
      width,
      height,
      channels: 3
    }
  })
    .png()
    .toBuffer();

  assert.ok(imageBuffer.byteLength > 1_000_000);

  const createdResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      title: "Large Portrait Campaign",
      campaignGenre: "Classic Fantasy",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "large-portrait-owner-client",
      playerName: "Liora",
      characterName: "Liora",
      characterSheet: "Level 5 Elf Wizard"
    }
  });

  assert.equal(createdResponse.statusCode, 201, createdResponse.body);
  const created = CampaignCreateResponseSchema.parse(createdResponse.json());
  const uploadResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/portrait/upload`,
    headers: {
      cookie
    },
    payload: {
      imageDataUrl: `data:image/png;base64,${imageBuffer.toString("base64")}`,
      fileName: "generated-character-portrait.png",
      guidelines: "generated preview image from the create-art step",
      artStyle: "painterly_fantasy"
    }
  });

  assert.equal(uploadResponse.statusCode, 200, uploadResponse.body);
  const uploaded = CampaignCreateResponseSchema.parse(uploadResponse.json());

  assert.ok(uploaded.campaign.portraitAssetId);
  assert.match(uploaded.campaign.portraitUrl ?? "", /\/media\/campaigns\//);
});

test("POST /api/campaigns/:campaignId/portrait/upload reports invalid image bytes", async () => {
  const cookie = await signIn("portrait-invalid-upload-owner@example.com");
  const createdResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      title: "Invalid Upload Campaign",
      campaignGenre: "Classic Fantasy",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "portrait-invalid-upload-client",
      playerName: "Ira",
      characterName: "Ira",
      characterSheet: "Level 5 Human Wizard"
    }
  });

  assert.equal(createdResponse.statusCode, 201, createdResponse.body);
  const created = CampaignCreateResponseSchema.parse(createdResponse.json());
  const uploadResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/portrait/upload`,
    headers: {
      cookie
    },
    payload: {
      imageDataUrl: `data:image/png;base64,${Buffer.from("not an image").toString(
        "base64"
      )}`,
      fileName: "broken.png"
    }
  });
  const error = ApiErrorResponseSchema.parse(uploadResponse.json()).error;

  assert.equal(uploadResponse.statusCode, 400);
  assert.equal(error.code, "BAD_REQUEST");
  assert.match(error.message, /Input buffer contains unsupported image format/);
});

test("POST /api/campaigns/:campaignId/portrait/upload rejects unsupported image MIME types", async () => {
  const cookie = await signIn("portrait-gif-upload-owner@example.com");
  const createdResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: {
      cookie
    },
    payload: {
      mode: "single_player",
      title: "Unsupported Upload Campaign",
      campaignGenre: "Classic Fantasy",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "portrait-gif-upload-client",
      playerName: "Gia",
      characterName: "Gia",
      characterSheet: "Level 5 Elf Ranger"
    }
  });

  assert.equal(createdResponse.statusCode, 201, createdResponse.body);
  const created = CampaignCreateResponseSchema.parse(createdResponse.json());
  const uploadResponse = await app.inject({
    method: "POST",
    url: `/api/campaigns/${created.campaign.id}/portrait/upload`,
    headers: {
      cookie
    },
    payload: {
      imageDataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
    }
  });
  const error = ApiErrorResponseSchema.parse(uploadResponse.json()).error;

  assert.equal(uploadResponse.statusCode, 400);
  assert.equal(error.code, "BAD_REQUEST");
  assert.equal(error.message, "Upload a PNG, JPEG, or WebP image.");
});

test("POST /api/campaigns uses production Qwen base URL for character portraits", async () => {
  const cookie = await signIn("portrait-production-env@example.com");
  const originalFetch = globalThis.fetch;
  const originalQwenImageApiKey = process.env.QWEN_IMAGE_API_KEY;
  const originalDashscopeApiKey = process.env.DASHSCOPE_API_KEY;
  const originalQwenApiKey = process.env.QWEN_API_KEY;
  const originalQwenImageEndpoint = process.env.QWEN_IMAGE_ENDPOINT;
  const originalQwenBaseUrl = process.env.QWEN_BASE_URL;
  const originalQwenImageModel = process.env.QWEN_IMAGE_MODEL;
  const imageBuffer = await sharp({
    create: {
      width: 128,
      height: 128,
      channels: 4,
      background: "#0f766e"
    }
  })
    .png()
    .toBuffer();
  const imageGenerationEndpoint =
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
  const fetchCalls: string[] = [];

  delete process.env.QWEN_IMAGE_API_KEY;
  delete process.env.DASHSCOPE_API_KEY;
  process.env.QWEN_API_KEY = "production-qwen-key";
  delete process.env.QWEN_IMAGE_ENDPOINT;
  process.env.QWEN_BASE_URL =
    "https://dashscope.aliyuncs.com/compatible-mode/v1";
  delete process.env.QWEN_IMAGE_MODEL;

  globalThis.fetch = (async (url, init) => {
    fetchCalls.push(String(url));

    if (String(url) === imageGenerationEndpoint) {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer production-qwen-key");
      const body = JSON.parse(String(init?.body)) as {
        model?: string;
      };

      assert.equal(body.model, "qwen-image-2.0-pro");

      return new Response(
        JSON.stringify({
          request_id: "qwen-image-production-request",
          output: {
            choices: [
              {
                message: {
                  content: [
                    {
                      image: "https://qwen-image.example.test/production.png"
                    }
                  ]
                }
              }
            ]
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    if (String(url) === "https://qwen-image.example.test/production.png") {
      return new Response(imageBuffer, {
        status: 200,
        headers: {
          "content-type": "image/png"
        }
      });
    }

    throw new Error(`Unexpected fetch URL: ${String(url)}`);
  }) as typeof fetch;

  try {
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
        ownerClientId: "portrait-production-env-client",
        playerName: "Production Portrait Owner",
        characterName: "Thalia",
        characterSheet:
          "Character Name: Thalia\nLevel: 2\nClass: Fighter\nSpecies: Human\nDM Brief: A shield-bearing mercenary with sea-green armor.",
        generateCharacterPortrait: true
      }
    });

    assert.equal(createResponse.statusCode, 201, createResponse.body);

    const created = CampaignCreateResponseSchema.parse(createResponse.json());
    assert.ok(created.campaign.portraitAssetId);
    assert.match(
      created.campaign.portraitUrl ?? "",
      /^\/media\/campaigns\/.+\/512\.webp$/
    );
    assert.deepEqual(fetchCalls, [
      imageGenerationEndpoint,
      "https://qwen-image.example.test/production.png"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalQwenImageApiKey === undefined) {
      delete process.env.QWEN_IMAGE_API_KEY;
    } else {
      process.env.QWEN_IMAGE_API_KEY = originalQwenImageApiKey;
    }
    if (originalDashscopeApiKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = originalDashscopeApiKey;
    }
    if (originalQwenApiKey === undefined) {
      delete process.env.QWEN_API_KEY;
    } else {
      process.env.QWEN_API_KEY = originalQwenApiKey;
    }
    if (originalQwenImageEndpoint === undefined) {
      delete process.env.QWEN_IMAGE_ENDPOINT;
    } else {
      process.env.QWEN_IMAGE_ENDPOINT = originalQwenImageEndpoint;
    }
    if (originalQwenBaseUrl === undefined) {
      delete process.env.QWEN_BASE_URL;
    } else {
      process.env.QWEN_BASE_URL = originalQwenBaseUrl;
    }
    if (originalQwenImageModel === undefined) {
      delete process.env.QWEN_IMAGE_MODEL;
    } else {
      process.env.QWEN_IMAGE_MODEL = originalQwenImageModel;
    }
  }
});

test("POST /api/campaigns records failed character portrait generation", async () => {
  const cookie = await signIn("portrait-failure@example.com");
  const originalFetch = globalThis.fetch;
  const originalCwd = process.cwd();
  const originalQwenImageApiKey = process.env.QWEN_IMAGE_API_KEY;
  const originalDashscopeApiKey = process.env.DASHSCOPE_API_KEY;
  const originalQwenApiKey = process.env.QWEN_API_KEY;
  const originalQwenImageEndpoint = process.env.QWEN_IMAGE_ENDPOINT;
  const originalQwenImageModel = process.env.QWEN_IMAGE_MODEL;
  const tempDir = await mkdtemp(join(tmpdir(), "ai-taverns-qwen-env-"));

  await writeFile(
    join(tempDir, ".env.local"),
    [
      "THIS LINE HAS NO SEPARATOR",
      "QWEN_IMAGE_API_KEY='file-qwen-image-key'",
      'QWEN_IMAGE_ENDPOINT="https://qwen-image.example.test/fail"',
      "QWEN_IMAGE_MODEL=qwen-image-file-model"
    ].join("\n")
  );

  delete process.env.QWEN_IMAGE_API_KEY;
  delete process.env.DASHSCOPE_API_KEY;
  delete process.env.QWEN_API_KEY;
  delete process.env.QWEN_IMAGE_ENDPOINT;
  delete process.env.QWEN_IMAGE_MODEL;
  process.chdir(tempDir);

  globalThis.fetch = (async (url, init) => {
    assert.equal(String(url), "https://qwen-image.example.test/fail");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer file-qwen-image-key");

    return new Response(
      JSON.stringify({
        code: "ImageGenerationFailed",
        message: "The portrait forge went cold."
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  try {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: {
        cookie
      },
      payload: {
        mode: "multiplayer",
        campaignGenreKind: "preset",
        campaignGenrePresetId: "dark_fantasy",
        ownerClientId: "portrait-failure-owner-client",
        playerName: "Portrait Failure Owner",
        characterName: "Mira",
        characterSheet:
          "Character Name: Mira\nLevel: 3\nClass: Ranger\nSpecies: Human\nDM Brief: A hooded trail warden with a moonlit bow.",
        generateCharacterPortrait: true
      }
    });

    assert.equal(createResponse.statusCode, 201, createResponse.body);

    const created = CampaignCreateResponseSchema.parse(createResponse.json());
    assert.equal(created.campaign.portraitAssetId, undefined);
    assert.equal(created.campaign.portraitUrl, undefined);
    assert.equal(database.mediaAssets.at(-1)?.status, "failed");
    assert.deepEqual(database.mediaAssets.at(-1)?.generation_metadata, {
      endpoint: "https://qwen-image.example.test/fail",
      model: "qwen-image-file-model",
      error: "The portrait forge went cold."
    });
    assert.equal(
      database.players.find(
        (player) => player.client_id === "portrait-failure-owner-client"
      )?.portrait_asset_id,
      null
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });

    if (originalQwenImageApiKey === undefined) {
      delete process.env.QWEN_IMAGE_API_KEY;
    } else {
      process.env.QWEN_IMAGE_API_KEY = originalQwenImageApiKey;
    }
    if (originalDashscopeApiKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = originalDashscopeApiKey;
    }
    if (originalQwenApiKey === undefined) {
      delete process.env.QWEN_API_KEY;
    } else {
      process.env.QWEN_API_KEY = originalQwenApiKey;
    }
    if (originalQwenImageEndpoint === undefined) {
      delete process.env.QWEN_IMAGE_ENDPOINT;
    } else {
      process.env.QWEN_IMAGE_ENDPOINT = originalQwenImageEndpoint;
    }
    if (originalQwenImageModel === undefined) {
      delete process.env.QWEN_IMAGE_MODEL;
    } else {
      process.env.QWEN_IMAGE_MODEL = originalQwenImageModel;
    }
  }
});

test("POST /api/campaigns records empty Qwen image responses", async () => {
  const cookie = await signIn("portrait-empty-response@example.com");
  const originalFetch = globalThis.fetch;
  const originalQwenImageApiKey = process.env.QWEN_IMAGE_API_KEY;
  const originalQwenImageEndpoint = process.env.QWEN_IMAGE_ENDPOINT;
  const originalQwenImageModel = process.env.QWEN_IMAGE_MODEL;

  process.env.QWEN_IMAGE_API_KEY = "empty-response-key";
  process.env.QWEN_IMAGE_ENDPOINT = "https://qwen-image.example.test/empty";
  process.env.QWEN_IMAGE_MODEL = "qwen-image-empty-model";
  globalThis.fetch = (async (url) => {
    assert.equal(String(url), "https://qwen-image.example.test/empty");

    return new Response(
      JSON.stringify({
        output: {
          choices: [
            {
              message: {
                content: [{ text: "No image today." }]
              }
            }
          ]
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  try {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: {
        cookie
      },
      payload: {
        mode: "multiplayer",
        campaignGenreKind: "preset",
        campaignGenrePresetId: "dark_fantasy",
        ownerClientId: "portrait-empty-owner-client",
        playerName: "Portrait Empty Owner",
        characterName: "Kael",
        characterSheet:
          "Character Name: Kael\nLevel: 2\nClass: Bard\nSpecies: Elf\nDM Brief: A silver-voiced wanderer in green velvet.",
        generateCharacterPortrait: true
      }
    });

    assert.equal(createResponse.statusCode, 201, createResponse.body);

    const created = CampaignCreateResponseSchema.parse(createResponse.json());
    assert.equal(created.campaign.portraitAssetId, undefined);
    assert.equal(created.campaign.portraitUrl, undefined);
    assert.equal(database.mediaAssets.at(-1)?.status, "failed");
    assert.deepEqual(database.mediaAssets.at(-1)?.generation_metadata, {
      endpoint: "https://qwen-image.example.test/empty",
      model: "qwen-image-empty-model",
      error: "Qwen image generation returned no image URL."
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalQwenImageApiKey === undefined) {
      delete process.env.QWEN_IMAGE_API_KEY;
    } else {
      process.env.QWEN_IMAGE_API_KEY = originalQwenImageApiKey;
    }
    if (originalQwenImageEndpoint === undefined) {
      delete process.env.QWEN_IMAGE_ENDPOINT;
    } else {
      process.env.QWEN_IMAGE_ENDPOINT = originalQwenImageEndpoint;
    }
    if (originalQwenImageModel === undefined) {
      delete process.env.QWEN_IMAGE_MODEL;
    } else {
      process.env.QWEN_IMAGE_MODEL = originalQwenImageModel;
    }
  }
});

test("POST /api/campaigns records generated image download failures", async () => {
  const cookie = await signIn("portrait-download-failure@example.com");
  const originalFetch = globalThis.fetch;
  const originalQwenImageApiKey = process.env.QWEN_IMAGE_API_KEY;
  const originalQwenImageEndpoint = process.env.QWEN_IMAGE_ENDPOINT;
  const originalQwenImageModel = process.env.QWEN_IMAGE_MODEL;

  process.env.QWEN_IMAGE_API_KEY = "download-failure-key";
  process.env.QWEN_IMAGE_ENDPOINT = "https://qwen-image.example.test/download";
  process.env.QWEN_IMAGE_MODEL = "qwen-image-download-model";
  globalThis.fetch = (async (url) => {
    if (String(url) === "https://qwen-image.example.test/download") {
      return new Response(
        JSON.stringify({
          output: {
            choices: [
              {
                message: {
                  content: [
                    {
                      image: "https://qwen-image.example.test/missing.png"
                    }
                  ]
                }
              }
            ]
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    assert.equal(String(url), "https://qwen-image.example.test/missing.png");
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: {
        cookie
      },
      payload: {
        mode: "multiplayer",
        campaignGenreKind: "preset",
        campaignGenrePresetId: "dark_fantasy",
        ownerClientId: "portrait-download-failure-owner-client",
        playerName: "Portrait Download Failure Owner",
        characterName: "Lio",
        characterSheet:
          "Character Name: Lio\nLevel: 4\nClass: Rogue\nSpecies: Halfling\nDM Brief: A quick-footed lockbreaker with amber eyes.",
        generateCharacterPortrait: true
      }
    });

    assert.equal(createResponse.statusCode, 201, createResponse.body);

    const created = CampaignCreateResponseSchema.parse(createResponse.json());
    assert.equal(created.campaign.portraitAssetId, undefined);
    assert.equal(created.campaign.portraitUrl, undefined);
    assert.equal(database.mediaAssets.at(-1)?.status, "failed");
    assert.deepEqual(database.mediaAssets.at(-1)?.generation_metadata, {
      endpoint: "https://qwen-image.example.test/download",
      model: "qwen-image-download-model",
      error: "Generated image download failed with 404."
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalQwenImageApiKey === undefined) {
      delete process.env.QWEN_IMAGE_API_KEY;
    } else {
      process.env.QWEN_IMAGE_API_KEY = originalQwenImageApiKey;
    }
    if (originalQwenImageEndpoint === undefined) {
      delete process.env.QWEN_IMAGE_ENDPOINT;
    } else {
      process.env.QWEN_IMAGE_ENDPOINT = originalQwenImageEndpoint;
    }
    if (originalQwenImageModel === undefined) {
      delete process.env.QWEN_IMAGE_MODEL;
    } else {
      process.env.QWEN_IMAGE_MODEL = originalQwenImageModel;
    }
  }
});

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
      characterSheet: [
        "Character Name: Mira",
        "",
        "Backstory",
        "Mira is a ruin-delver who follows old glowing roads after her missing mentor, Captain Saela, left her a brass compass that points toward Selwick only during stormlight.",
        "",
        "Core Stats",
        "Class: Rogue",
        "Background: Archaeologist"
      ].join("\n"),
      eldermereStart: {
        regionName: "The Salt Concordat",
        settlementName: "Selwick",
        reason: "Mira's generated backstory points toward port trouble."
      }
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
  const openingEvent = database.campaignEvents.find(
    (event) =>
      event.campaign_id === created.campaign.id &&
      event.type === "adventure_begun"
  );
  const openingPayload = openingEvent?.payload as Record<string, unknown> | undefined;
  const aiDebug = openingPayload?.aiDebug as Record<string, unknown> | undefined;
  const plannerDebug = aiDebug?.eldermereOpeningPlanner as
    | Record<string, unknown>
    | undefined;

  assert.equal(worldProfile.worldName, "Eldermere");
  assert.equal(worldProfile.source, "flagship_world");
  assert.equal(selectedRegion.name, "The Salt Concordat");
  assert.equal(startingLocation.name, "Selwick");
  assert.equal(startingLocation.displayLocation, startingLocation.name);
  assert.equal(metadata.eldermereOpeningPlanVersion, 1);
  assert.equal(openingPlan.region, "The Salt Concordat");
  assert.equal(openingPlan.starting_location, "Selwick");
  assert.match(openingPlan.concept as string, /local request turns into an escalating mystery/i);
  assert.ok(Array.isArray(openingPlan.campaign_anchors));
  assert.match(openingPayload?.content as string, /What do you do\?$/);
  assert.ok(getProviderInputs().length >= 2);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const refreshedOpeningPayload = database.campaignEvents.find(
    (event) =>
      event.campaign_id === created.campaign.id &&
      event.type === "adventure_begun"
  )?.payload as Record<string, unknown> | undefined;
  const contextStorageState = (
    refreshedOpeningPayload?.aiDebug as Record<string, unknown> | undefined
  )?.contextStorageState as
    | {
        contextChunkCount?: unknown;
        contextChunks?: { context_id?: unknown; body_markdown?: unknown }[];
      }
    | undefined;

  assert.equal(
    contextStorageState?.contextChunkCount,
    contextStorageState?.contextChunks?.length
  );
  assert.ok((contextStorageState?.contextChunkCount ?? 0) >= 3);

  assert.ok(plannerInput);
  assert.match(plannerInput.instructions, /campaign-opening planner/);
  assert.match(plannerInput.message, /PLAYER CHARACTER/);
  assert.match(plannerInput.message, /CANONICAL START/);
  assert.match(plannerInput.message, /ELDERMERE GROUNDING/);
  assert.match(plannerInput.message, /CONCEPT REQUIREMENTS/);
  assert.match(plannerInput.message, /campaign as an evolving situation/i);
  assert.match(plannerInput.message, /not merely as an opening hook/i);
  assert.match(plannerInput.message, /what the player may eventually discover and decide/i);
  assert.match(plannerInput.message, /how it recontextualizes their starting situation/i);
  assert.match(plannerInput.message, /CAMPAIGN ANCHOR REQUIREMENTS/);
  assert.match(plannerInput.message, /Create 6-9 campaign anchors/);
  assert.match(plannerInput.message, /exactly one region anchor/);
  assert.match(plannerInput.message, /Visibility applies to the entire anchor object/);
  assert.match(plannerInput.message, /never include hidden motives/i);
  assert.match(plannerInput.message, /future_pressure_or_change/);
  assert.match(plannerInput.message, /Player backstory anchors for the opening scene:/);
  assert.match(plannerInput.message, /Captain Saela/);
  assert.match(plannerInput.message, /compass that points toward Selwick/);
  assert.match(plannerInput.message, /Doesn't require the player to know anything about Eldermere beforehand/i);
  assert.match(plannerInput.message, /serving a prison sentence/i);
  assert.match(plannerInput.message, /Region: The Salt Concordat/);
  assert.match(plannerInput.message, /Starting location: Selwick/);

  assert.ok(narratorInput);
  assert.match(narratorInput.message, /AUTHORITATIVE CHARACTER CONTEXT/);
  assert.match(narratorInput.message, /ELDERMERE OPENING BRIEF/);
  assert.match(narratorInput.message, /NARRATOR TASK - WRITE THE FULL PLAYER-FACING OPENER:/);
  assert.match(narratorInput.message, /campaign source of truth/);
  assert.match(narratorInput.message, /how_the_player_got_here/);
  assert.match(narratorInput.message, /PLAYER KNOWLEDGE AND OPENING FOCUS:/);
  assert.match(
    narratorInput.message,
    /Assume the player knows nothing about this campaign or setting/
  );
  assert.match(narratorInput.message, /concept is author guidance/);
  assert.match(
    narratorInput.message,
    /what is unknown to the player but immediately in front of them/
  );
  assert.match(narratorInput.message, /Do not explain wider factions, politics, history/);
  assert.match(narratorInput.message, /exactly 6 semantic narration color tags/);
  assert.match(narratorInput.message, /<npc>\.\.\.<\/npc>/);
  assert.match(narratorInput.message, /<place>\.\.\.<\/place>/);
  assert.match(narratorInput.message, /<clue>\.\.\.<\/clue>/);
  assert.match(narratorInput.message, /<danger>\.\.\.<\/danger>/);
  assert.match(narratorInput.message, /<faction>\.\.\.<\/faction>/);
  assert.match(narratorInput.message, /<object>\.\.\.<\/object>/);
  assert.match(narratorInput.message, /Authoritative backstory:/);
  assert.match(narratorInput.message, /Captain Saela/);
  assert.match(narratorInput.message, /Use how_the_player_got_here/);
  assert.match(narratorInput.message, /Paragraph 1 — Campaign premise/);
  assert.match(narratorInput.message, /Paragraph 2 — Arrival/);
  assert.match(narratorInput.message, /Paragraph 3 — Live scene/);
  assert.match(narratorInput.message, /opening_scene/);
  assert.match(narratorInput.message, /Paragraph 4 — Pressure/);
  assert.match(narratorInput.message, /Paragraph 5 — Choice/);
  assert.match(narratorInput.message, /Paragraph 6 — Handoff/);
  assert.match(narratorInput.message, /grounded, direct, detailed fantasy prose/);
  assert.doesNotMatch(narratorInput.message, /Flagship world context:/);
  assert.doesNotMatch(narratorInput.message, /Seven regions available for the opener:/);
  assert.doesNotMatch(narratorInput.instructions, /World Context:/);
  assert.doesNotMatch(narratorInput.instructions, /Regions of Eldermere:/);
  assert.match(narratorInput.instructions, /Return only the complete player-facing opener as plain prose/);
  assert.doesNotMatch(narratorInput.instructions, /Required top-level keys/);
  assert.doesNotMatch(narratorInput.message, /Set setting\./);
  assert.doesNotMatch(narratorInput.message, /Return exactly one valid JSON/);
  assert.match(narratorInput.message, /"region": "The Salt Concordat"/);
  assert.match(narratorInput.message, /"starting_location": "Selwick"/);
  assert.match(narratorInput.message, /"how_the_player_got_here":/);
  assert.match(narratorInput.message, /"concept":/);
  assert.match(narratorInput.message, /"opening_scene":/);
  assert.doesNotMatch(narratorInput.message, /"private_truth":/);
  assert.doesNotMatch(narratorInput.message, /"campaign_anchors":/);
  assert.doesNotMatch(narratorInput.message, /Validated name bank for this campaign opener:/);
  assert.doesNotMatch(narratorInput.message, /Campaign opener requirements:/);
  assert.doesNotMatch(narratorInput.message, /Authoritative mechanics state:/);
  assert.match(
    narratorInput.message,
    /Fulfill how_the_player_got_here, concept, and opening_scene/
  );

  assert.ok(plannerDebug);
  assert.equal(
    JSON.parse(plannerDebug.rawResponse as string).concept,
    openingPlan.concept
  );
  assert.deepEqual(plannerDebug.parsedOutput, openingPlan);
  assert.match(
    JSON.stringify(plannerDebug.requestMessages),
    /campaign-opening planner/
  );
  assert.match(
    JSON.stringify(plannerDebug.requestMessages),
    /CONCEPT REQUIREMENTS/
  );
  assert.match(JSON.stringify(plannerDebug.requestMessages), /Captain Saela/);
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
      created_at: now,
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
      created_at: now,
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

test.skip("POST /api/campaigns scrubs forbidden Eldermere opening terms after narrator repair", async () => {
  const cookie = await signIn("eldermere-scrub@example.com");
  resetProviderInputs();

  setProviderOverride(async (input) => {
    if (input.instructions.includes("campaign-opening planner")) {
      return {
        id: "provider-planner-forbidden-terms",
        content: JSON.stringify({
          how_the_player_got_here: "The party followed a local summons to Suncross.",
          concept: "A local request becomes an escalating mystery in Suncross.",
          opening_scene: "Mara Vell waits by a marked doorway while the street watches.",
          private_truth: "The marked doorway conceals evidence a local power wants erased.",
          campaign_anchors: [
            {
              name: "Mara Vell",
              description: "A worried local messenger who knows the first lead and matters to the local mystery."
            }
          ],
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
          starting_location_atmosphere: {
            arrival_impression: "Suncross feels crowded, bright, and watched from the moment the road enters the city.",
            daily_life_and_liveliness: "Pilgrims, market carts, guards, and street vendors keep moving even though every conversation drops when strangers pass.",
            local_attitude: "People are polite to travelers, but they measure every question before answering.",
            dominant_vibe: "busy civic pride under visible strain",
            sensory_entry_details: [
              "road-glow on wet paving stones",
              "cart wheels clattering through narrow market lanes",
              "warm bread smoke mixed with cold rain"
            ],
            transition_into_first_scene: "The city noise thins toward the marked doorway where Mara Vell keeps watching the street."
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

    const repairedNarration = [
      "The summons that brought you to Suncross has the weight of unfinished business, the kind that makes an old promise feel heavier than your pack.",
      "For the last three days, cold rain and stranger warnings followed the road, and the last hour brought you through crowded streets where locals lowered their voices at your questions.",
      "Suncross crouches beneath the old stones of the Second Dominion, where the Hush still seems to press against every shutter.",
      "Mara Vell waits by a marked doorway, rain silvering her cloak while guards argue nearby and market carts slow to stare.",
      "You can question Mara Vell, inspect the marked doorway, or ask nearby locals what frightened them before the street closes around you.",
      "What do you do?"
    ].join("\n\n");

    if (input.message.includes("Rewrite required:")) {
      return {
        id: "provider-narrator-forbidden-terms-repair",
        content: JSON.stringify({
          public_narration: repairedNarration,
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
  const providerInputs = getProviderInputs();
  const repairInput = providerInputs.at(-1);

  assert.ok(payload);
  assert.doesNotMatch(payload.content as string, /Second Dominion|Hush/);
  assert.match(payload.content as string, /<place>Suncross<\/place>/);
  assert.match(payload.content as string, /<npc>Mara Vell<\/npc>/);
  assert.match(payload.content as string, /fallen empire/);
  assert.match(payload.content as string, /long silence/);
  assert.equal(setting?.worldName, "Eldermere");
  assert.equal(setting?.startingLocation, "Suncross");
  assert.equal(setting?.displayLocation, "Suncross");
  assert.equal(providerInputs.length, 3);
  assert.match(
    repairInput?.message ?? "",
    /public_narration must contain exactly 6 semantic narration markup tags; found 0/
  );
});

test.skip("POST /api/campaigns uses a low-temperature final retry for short Eldermere openers", async () => {
  const cookie = await signIn("eldermere-final-retry@example.com");
  resetProviderInputs();

  setProviderOverride(async (input) => {
    if (input.instructions.includes("campaign-opening planner")) {
      return {
        id: "provider-planner-final-retry",
        content: JSON.stringify({
          how_the_player_got_here: "The party followed a local summons to Suncross.",
          concept: "A local request becomes an escalating mystery in Suncross.",
          opening_scene: "Mara Vell waits by a marked doorway while the street watches.",
          private_truth: "The marked doorway conceals evidence a local power wants erased.",
          campaign_anchors: [
            {
              name: "Mara Vell",
              description: "A worried local messenger who knows the first lead and matters to the local mystery."
            }
          ],
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
          starting_location_atmosphere: {
            arrival_impression: "Suncross feels crowded, bright, and watched from the moment the road enters the city.",
            daily_life_and_liveliness: "Pilgrims, market carts, guards, and street vendors keep moving even though every conversation drops when strangers pass.",
            local_attitude: "People are polite to travelers, but they measure every question before answering.",
            dominant_vibe: "busy civic pride under visible strain",
            sensory_entry_details: [
              "road-glow on wet paving stones",
              "cart wheels clattering through narrow market lanes",
              "warm bread smoke mixed with cold rain"
            ],
            transition_into_first_scene: "The city noise thins toward the marked doorway where Mara Vell keeps watching the street."
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
          narrator_instructions: [
            "Begin at the edge of Suncross.",
            "Introduce Mara Vell as a visible NPC.",
            "Keep the opening to exactly 6 paragraphs of vivid sensory detail, with the sixth paragraph only the final direct prompt: What do you do?"
          ]
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

    if (input.message.includes("Final low-temperature rewrite required:")) {
      const finalNarration = [
        "The summons that brought you to Suncross has the weight of unfinished business, the kind that makes an old promise feel heavier than your pack.",
        "For the last three days, cold rain and stranger warnings followed the road, and the last hour brought you through crowded streets where locals lowered their voices at your questions.",
        "<place>Suncross</place> rises around you in wet stone and early lanternlight, busy enough to hide a secret and tense enough to make every passerby look away.",
        "<npc>Mara Vell</npc> waits by a marked doorway, rain silvering her cloak while guards argue nearby and market carts slow to stare.",
        "You can question Mara Vell, inspect the marked doorway, or ask nearby locals what frightened them before the street closes around you.",
        "What do you do?"
      ].join("\n\n");

      return {
        id: "provider-narrator-final-retry",
        content: JSON.stringify({
          public_narration: finalNarration,
          resolution_mode: "resolved_without_dice",
          roll_requests: [],
          next_input_needed: "player_actions",
          input_targets: [],
          input_policy: "all_players",
          mechanics_state_update: {},
          inventory_state_update: { patches: [] },
          combat_events: [],
          proposed_context_updates: [],
          setting: {
            display_location: "Suncross",
            world_name: "Eldermere",
            region_name: "Cael Ambrose",
            settlement_name: "Suncross",
            scene_location: "Suncross",
            starting_location: "Suncross"
          }
        }),
        debug: {
          requestMessages: [],
          rawResponse: "{}",
          model: "test-model",
          temperature: input.temperature ?? 0.8,
          providerTimings: []
        }
      };
    }

    return {
      id: "provider-narrator-short-opener",
      content: JSON.stringify({
        public_narration:
          "The summons that brought you to Suncross has the weight of unfinished business, and Mara Vell waits somewhere ahead.",
        resolution_mode: "resolved_without_dice",
        roll_requests: [],
        next_input_needed: "player_actions",
        input_targets: [],
        input_policy: "all_players",
        mechanics_state_update: {},
        inventory_state_update: { patches: [] },
        combat_events: [],
        proposed_context_updates: [],
        setting: {
          display_location: "Suncross",
          world_name: "Eldermere",
          region_name: "Cael Ambrose",
          settlement_name: "Suncross",
          scene_location: "Suncross",
          starting_location: "Suncross"
        }
      }),
      debug: {
        requestMessages: [],
        rawResponse: "{}",
        model: "test-model",
        temperature: input.temperature ?? 0.8,
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
          ownerClientId: "eldermere-final-retry-client",
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
  const content = String(payload?.content ?? "");
  const providerInputs = getProviderInputs();
  const finalRetryInput = providerInputs.find((input) =>
    input.message.includes("Final low-temperature rewrite required:")
  );

  assert.ok(payload);
  assert.equal(content.split(/\n\s*\n/).filter(Boolean).length, 6);
  assert.match(content, /What do you do\?$/);
  assert.match(content, /<place>Suncross<\/place>/);
  assert.match(content, /<npc>Mara Vell<\/npc>/);
  assert.ok(finalRetryInput);
  assert.equal(finalRetryInput.temperature, 0.2);
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

test("solo turns persist revealed written artifacts as canonical document text", async () => {
  const cookie = await signIn("canonical-document-text@example.com");
  const exactLetterText = [
    "Marra,",
    "",
    "The tide gate opens at moonrise. Bring the black key and trust no one wearing harbor blue.",
    "",
    "- V."
  ].join("\n");
  let secondTurnSawCanonicalText = false;

  resetProviderInputs();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: { cookie },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "canonical-document-text-client",
      playerName: "Document Reader",
      characterName: "Ira",
      characterSheet: "A careful investigator who keeps every scrap of writing."
    }
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  setProviderOverride(async (input) => {
    secondTurnSawCanonicalText ||= input.message.includes(
      `## Canonical Document Text\n${exactLetterText}`
    );
    const content = JSON.stringify({
      public_narration: input.message.includes("read it again")
        ? `You reread the courier letter. It says:\n\n${exactLetterText}`
        : `You unfold the courier letter. It says:\n\n${exactLetterText}`,
      resolution_mode: "resolved_without_dice",
      roll_requests: [],
      next_input_needed: "player_actions",
      input_targets: [],
      input_policy: "all_players",
      mechanics_state_update: {},
      inventory_state_update: { patches: [] },
      combat_events: [],
      proposed_context_updates: []
    });

    return {
      id: "provider-document-main",
      content,
      debug: {
        requestMessages: [],
        rawResponse: content,
        model: "test-model",
        temperature: 0.8,
        providerTimings: []
      }
    };
  });

  try {
    const firstReadResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${created.campaign.id}/solo-turn`,
      headers: { cookie },
      payload: {
        message: "read the courier letter"
      }
    });

    assert.equal(firstReadResponse.statusCode, 200, firstReadResponse.body);

    let documentChunk = database.contextChunks.find(
      (chunk) =>
        chunk.campaign_id === created.campaign.id &&
        chunk.context_key === "world:courier-letter"
    );

    for (let attempt = 0; !documentChunk && attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      documentChunk = database.contextChunks.find(
        (chunk) =>
          chunk.campaign_id === created.campaign.id &&
          chunk.context_key === "world:courier-letter"
      );
    }

    assert.ok(documentChunk);
    assert.match(documentChunk.body_markdown, /## Canonical Document Text/);
    assert.match(documentChunk.body_markdown, /## Established Facts/);
    assert.ok(documentChunk.body_markdown.includes(exactLetterText));
    assert.match(documentChunk.body_markdown, /## DM Seeds/);

    const secondReadResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${created.campaign.id}/solo-turn`,
      headers: { cookie },
      payload: {
        message: "read it again"
      }
    });

    assert.equal(secondReadResponse.statusCode, 200, secondReadResponse.body);
    assert.equal(secondTurnSawCanonicalText, true);
  } finally {
    setProviderOverride(undefined);
  }
});

test("solo turns replay notebook and ledger reads with canonical document chunks", async () => {
  const cookie = await signIn("canonical-cinderhalt-documents@example.com");
  const bellaNotebookText =
    "H.K. - 12 oz Wellglass - 400 gp - delivery via relic exchange - Cinderhalt seal confirmed.";
  const bellaWritText =
    "Bella Trestlemark is authorized to detain, question, and seize property related to suspected illicit Wellglass trade within the Ferrant Concord.";
  const halkaLedgerText = [
    "Borrim Stonehand - two ancient lockets - 15 gp.",
    "Orin Farseeker - raw material - three recurring entries.",
    "Hedd Ironbrow - consulting fee - 200 gp - signed H.I.",
    "Kara Dusthand - Delivery to the Hollow - Copper Lane."
  ].join("\n");
  let crossReferenceSawBellaNotebook = false;
  let crossReferenceSawWrit = false;
  let crossReferenceSawHalkaLedger = false;

  resetProviderInputs();

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/campaigns",
    headers: { cookie },
    payload: {
      mode: "single_player",
      campaignGenreKind: "preset",
      campaignGenrePresetId: "classic_fantasy",
      ownerClientId: "canonical-cinderhalt-client",
      playerName: "Senden",
      characterName: "Senden",
      characterSheet:
        "Senden is a human psion who reads Dwarvish and is investigating Cinderhalt Wellglass transactions."
    }
  });

  assert.equal(createResponse.statusCode, 201, createResponse.body);
  const created = CampaignCreateResponseSchema.parse(createResponse.json());

  setProviderOverride(async (input) => {
    const actionSource = input.currentPlayerAction ?? input.message;
    const currentAction =
      Array.from(actionSource.matchAll(/"content": "([^"]+)"/g)).at(-1)?.[1] ??
      actionSource;

    if (currentAction.includes("cross reference")) {
      crossReferenceSawBellaNotebook ||= input.message.includes(
        `# Bella's Notebook\n\n## Canonical Document Text\n${bellaNotebookText}`
      );
      crossReferenceSawWrit ||= input.message.includes(
        `# League of Brass Writ\n\n## Canonical Document Text\n${bellaWritText}`
      );
      crossReferenceSawHalkaLedger ||= input.message.includes(
        `# Halka's Ledger\n\n## Canonical Document Text\n${halkaLedgerText}`
      );
    }

    const publicNarration = currentAction.includes("look through the notes and writ")
      ? [
          "You pull out Bella's notebook and the League writ.",
          "",
          "Bella's notebook says:",
          "",
          bellaNotebookText,
          "",
          "The writ says:",
          "",
          bellaWritText
        ].join("\n")
      : /read halka'?s ledger/i.test(currentAction) &&
          !/cross reference/i.test(currentAction)
        ? ["Halka's ledger says:", "", halkaLedgerText].join("\n")
        : [
            "You cross-reference Halka's ledger against Bella's notebook.",
            "",
            "The recurring names are Borrim Stonehand, Orin Farseeker, Hedd Ironbrow, and Kara Dusthand. The H.K. entry remains exactly the Wellglass transaction from Bella's notebook."
          ].join("\n");

    const content = JSON.stringify({
      public_narration: publicNarration,
      resolution_mode: "resolved_without_dice",
      roll_requests: [],
      next_input_needed: "player_actions",
      input_targets: [],
      input_policy: "all_players",
      mechanics_state_update: {},
      inventory_state_update: { patches: [] },
      combat_events: [],
      proposed_context_updates: []
    });

    return {
      id: "provider-cinderhalt-document-main",
      content,
      debug: {
        requestMessages: [],
        rawResponse: content,
        model: "test-model",
        temperature: 0.8,
        providerTimings: []
      }
    };
  });

  try {
    const firstReadResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${created.campaign.id}/solo-turn`,
      headers: { cookie },
      payload: {
        message: "I clean myself up and look through the notes and writ"
      }
    });

    assert.equal(firstReadResponse.statusCode, 200, firstReadResponse.body);

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const keys = new Set(
        database.contextChunks
          .filter((chunk) => chunk.campaign_id === created.campaign.id)
          .map((chunk) => chunk.context_key)
      );

      if (
        keys.has("world:bellas-notebook") &&
        keys.has("world:league-of-brass-writ")
      ) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const secondReadResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${created.campaign.id}/solo-turn`,
      headers: { cookie },
      payload: {
        message: "Read halkas ledger"
      }
    });

    assert.equal(secondReadResponse.statusCode, 200, secondReadResponse.body);

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const keys = new Set(
        database.contextChunks
          .filter((chunk) => chunk.campaign_id === created.campaign.id)
          .map((chunk) => chunk.context_key)
      );

      if (
        keys.has("world:bellas-notebook") &&
        keys.has("world:league-of-brass-writ") &&
        keys.has("world:halkas-ledger")
      ) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const bellaNotebookChunk = database.contextChunks.find(
      (chunk) =>
        chunk.campaign_id === created.campaign.id &&
        chunk.context_key === "world:bellas-notebook"
    );
    const writChunk = database.contextChunks.find(
      (chunk) =>
        chunk.campaign_id === created.campaign.id &&
        chunk.context_key === "world:league-of-brass-writ"
    );
    const halkaLedgerChunk = database.contextChunks.find(
      (chunk) =>
        chunk.campaign_id === created.campaign.id &&
        chunk.context_key === "world:halkas-ledger"
    );

    assert.ok(bellaNotebookChunk);
    assert.ok(writChunk);
    assert.ok(halkaLedgerChunk);
    assert.ok(bellaNotebookChunk.body_markdown.includes(bellaNotebookText));
    assert.ok(writChunk.body_markdown.includes(bellaWritText));
    assert.ok(halkaLedgerChunk.body_markdown.includes(halkaLedgerText));
    assert.match(bellaNotebookChunk.body_markdown, /## Canonical Document Text/);
    assert.match(writChunk.body_markdown, /## Canonical Document Text/);
    assert.match(halkaLedgerChunk.body_markdown, /## Canonical Document Text/);

    const crossReferenceResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${created.campaign.id}/solo-turn`,
      headers: { cookie },
      payload: {
        message:
          "Read halkas ledger and cross reference it with Bella's notebook to find recurring names"
      }
    });

    assert.equal(crossReferenceResponse.statusCode, 200, crossReferenceResponse.body);
    const crossReferenceRouterTrace = database.dmTurnTraces
      .filter(
        (trace) =>
          trace.campaign_id === created.campaign.id &&
          trace.phase === "router_response_received"
      )
      .at(-1)?.payload as
      | {
          router?: {
            contextKeys?: {
              relevant_world_context?: string[];
            };
          };
        }
      | undefined;
    assert.deepEqual(
      crossReferenceRouterTrace?.router?.contextKeys?.relevant_world_context,
      [
        "world:bellas-notebook",
        "world:league-of-brass-writ",
        "world:halkas-ledger"
      ]
    );
    assert.equal(crossReferenceSawBellaNotebook, true);
    assert.equal(crossReferenceSawWrit, true);
    assert.equal(crossReferenceSawHalkaLedger, true);
  } finally {
    setProviderOverride(undefined);
  }
});

test("solo turn accepts broad single pending rolls even when over-targeted", async () => {
  const cookie = await signIn("solo-broad-roll@example.com");

  resetProviderInputs();
  setProviderOverride(async () => {
    const content = JSON.stringify({
      public_narration: "The disguise holds long enough for you to slip away.",
      roll_requests: [],
      next_input_needed: "player_actions",
      input_targets: [],
      input_policy: "all_players"
    });

    return {
      id: "provider-solo-broad-roll",
      content,
      debug: {
        requestMessages: [],
        rawResponse: content,
        model: "test-model",
        temperature: 0.8,
        providerTimings: []
      }
    };
  });

  try {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/campaigns",
      headers: { cookie },
      payload: {
        mode: "single_player",
        campaignGenreKind: "preset",
        campaignGenrePresetId: "classic_fantasy",
        ownerClientId: "solo-broad-roll-client",
        playerName: "Senden",
        characterName: "Senden",
        characterSheet: "A frightened spellcaster trying to escape."
      }
    });

    assert.equal(createResponse.statusCode, 201, createResponse.body);
    const created = CampaignCreateResponseSchema.parse(createResponse.json());
    const campaign = database.campaigns.find(
      (candidate) => candidate.id === created.campaign.id
    );

    assert.ok(campaign);
    campaign.metadata = {
      ...(campaign.metadata as Record<string, unknown>),
      inputTargets: [],
      inputPolicy: "all_players",
      pendingRollRequests: [
        {
          id: "disguise-self-deception",
          player: "Disguise Self",
          dice: "1d20",
          label: "Deception (Disguise)",
          modifier: 2
        }
      ],
      nextInputNeeded: "dice_results"
    };

    const rollResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${created.campaign.id}/solo-turn`,
      headers: { cookie },
      payload: {
        rollRequestId: "disguise-self-deception",
        rollResult: {
          rolls: [14],
          total: 16
        }
      }
    });

    assert.equal(rollResponse.statusCode, 200, rollResponse.body);
    const room = CampaignSoloTurnResponseSchema.parse(rollResponse.json());
    assert.equal(room.pendingRollRequest, null);
    assert.deepEqual(room.pendingRollRequests, []);

    assert.equal(
      (campaign.metadata as Record<string, unknown>).pendingRollRequest,
      undefined
    );
    assert.equal(
      (campaign.metadata as Record<string, unknown>).pendingRollRequests,
      undefined
    );
  } finally {
    setProviderOverride(undefined);
    resetProviderInputs();
  }
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
  assert.equal(actors[`player:${player.id}`]?.characterClass, "Warlock");
  assert.equal(actors[`player:${player.id}`]?.level, 5);
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
