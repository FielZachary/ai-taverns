import { expect, test } from "@playwright/test";
import {
  createMultiplayerCampaignThroughBrowser,
  joinMultiplayerCampaignThroughBrowser
} from "./support/campaigns";
import { signInWithPasswordlessToken } from "./support/passwordless-auth";

test.describe("authenticated navigation smoke", () => {
  test("new adventure is reachable with a local authenticated session", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "smoke@example.com",
      nextPath: "/new-adventure"
    });

    await page.goto("/new-adventure");

    await expect(page).toHaveURL(/\/new-adventure$/);
    await expect(
      page.getByRole("main", { name: "Create a new adventure" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /singleplayer/i })).toBeVisible();
  });

  test("play is reachable with a seeded local campaign session", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "play-smoke@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Play Smoke Adventure",
      ownerClientId: "playwright-play-smoke"
    });

    await page.goto(`/play?campaignId=${campaign.id}`);

    await expect(page).toHaveURL(new RegExp(`/play\\?campaignId=${campaign.id}$`));
    await expect(
      page.getByRole("region", { name: "AI Dungeons and Dragons table" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /open chat: smoke host/i })
    ).toBeVisible();
    await expect(page.getByText("Play Smoke Adventure")).toBeVisible();
    await expect(
      page.getByText("Gather at least two players to begin the adventure.")
    ).toBeVisible();
  });

  test("play shows provider-free multiplayer pre-begin room state with two complete players", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Room Smoke Adventure",
      ownerClientId: "playwright-room-smoke-host"
    });

    await signInWithPasswordlessToken(page, request, {
      email: "room-smoke-joiner@example.com",
      nextPath: "/new-adventure"
    });
    await joinMultiplayerCampaignThroughBrowser(page, {
      gameCode: campaign.joinCode!,
      clientId: "playwright-room-smoke-joiner",
      username: "Room Smoke Joiner",
      characterName: "Mira Emberquill",
      characterSheet:
        "Mira Emberquill is a level 1 bard with a steady voice, a travel lute, and a habit of asking careful questions."
    });

    await page.goto(`/play?campaignId=${campaign.id}`);

    await expect(page).toHaveURL(new RegExp(`/play\\?campaignId=${campaign.id}$`));
    await expect(
      page.getByRole("region", { name: "AI Dungeons and Dragons table" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /open chat: mira emberquill/i })
    ).toBeVisible();
    await expect(
      page.getByText("The party is gathered. Let the DM open the campaign.")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /begin adventure/i })
    ).toBeEnabled();
  });

  test("play shows owner-visible multiplayer room state after a second complete player joins", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "owner-room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Owner Room Smoke Adventure",
      ownerClientId: "playwright-owner-room-smoke-host"
    });

    await signInWithPasswordlessToken(page, request, {
      email: "owner-room-smoke-joiner@example.com",
      nextPath: "/new-adventure"
    });
    await joinMultiplayerCampaignThroughBrowser(page, {
      gameCode: campaign.joinCode!,
      clientId: "playwright-owner-room-smoke-joiner",
      username: "Owner Room Smoke Joiner",
      characterName: "Tarin Mosswake",
      characterSheet:
        "Tarin Mosswake is a level 1 ranger with a careful map, a weathered bow, and a calm eye for hidden paths."
    });

    await signInWithPasswordlessToken(page, request, {
      email: "owner-room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    await page.goto(`/play?campaignId=${campaign.id}`);

    await expect(page).toHaveURL(new RegExp(`/play\\?campaignId=${campaign.id}$`));
    await expect(
      page.getByRole("region", { name: "AI Dungeons and Dragons table" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /open chat: smoke host/i })
    ).toBeVisible();
    await expect(page.getByText("Owner Room Smoke Adventure")).toBeVisible();
    await expect(
      page.getByText("The party is gathered. Let the DM open the campaign.")
    ).toBeVisible();
    await expect(page.getByText("Game Code")).toBeVisible();
    await expect(page.getByText(campaign.joinCode!)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /begin adventure/i })
    ).toBeEnabled();
  });

  test("play begins a multiplayer adventure with the deterministic local DM provider", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "begin-room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Begin Room Smoke Adventure",
      ownerClientId: "playwright-begin-room-smoke-host",
      campaignGenreKind: "custom",
      customWorldName: "Playwright Test Realm",
      customWorldDescription:
        "A compact test realm for deterministic local smoke tests.",
      ownerCharacterName: "Orin Hearthguard",
      ownerCharacterSheet:
        "Orin Hearthguard is a level 1 fighter with a dented helm, a travel cloak, and a habit of keeping the road behind the party in view."
    });

    await signInWithPasswordlessToken(page, request, {
      email: "begin-room-smoke-joiner@example.com",
      nextPath: "/new-adventure"
    });
    await joinMultiplayerCampaignThroughBrowser(page, {
      gameCode: campaign.joinCode!,
      clientId: "playwright-begin-room-smoke-joiner",
      username: "Begin Room Smoke Joiner",
      characterName: "Sera Dawnmark",
      characterSheet:
        "Sera Dawnmark is a level 1 paladin with a travel-worn shield, a small oathbook, and a steady habit of standing near the door."
    });

    await signInWithPasswordlessToken(page, request, {
      email: "begin-room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    await page.goto(`/play?campaignId=${campaign.id}`);

    await expect(
      page.getByText("The party is gathered. Let the DM open the campaign.")
    ).toBeVisible();

    await page.getByRole("button", { name: /begin adventure/i }).click();

    await expect(
      page.getByText("Lanternlight gathers around the Ashford Tollhouse")
    ).toBeVisible();
    await expect(page.getByText("What do you do?")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /begin adventure/i })
    ).toBeHidden();
  });

  test("play resolves a post-begin player turn with the deterministic local DM provider", async ({
    browser,
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "turn-room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Turn Room Smoke Adventure",
      ownerClientId: "playwright-turn-room-smoke-host",
      campaignGenreKind: "custom",
      customWorldName: "Playwright Test Realm",
      customWorldDescription:
        "A compact test realm for deterministic local smoke tests.",
      ownerCharacterName: "Bryn Charterhand",
      ownerCharacterSheet:
        "Bryn Charterhand is a level 1 rogue with a rain-dark cloak, a careful lockpick kit, and a habit of checking seals before trusting documents."
    });

    await signInWithPasswordlessToken(page, request, {
      email: "turn-room-smoke-joiner@example.com",
      nextPath: "/new-adventure"
    });
    await joinMultiplayerCampaignThroughBrowser(page, {
      gameCode: campaign.joinCode!,
      clientId: "playwright-turn-room-smoke-joiner",
      username: "Turn Room Smoke Joiner",
      characterName: "Calder Rainwatch",
      characterSheet:
        "Calder Rainwatch is a level 1 cleric with a patched field satchel, a brass rain charm, and a patient eye for frightened witnesses."
    });
    await page.evaluate(() => {
      localStorage.setItem("ai-dnd.playerId", "playwright-turn-room-smoke-joiner");
    });
    const joinerStorageState = await page.context().storageState();

    await signInWithPasswordlessToken(page, request, {
      email: "turn-room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    await page.evaluate(() => {
      localStorage.setItem("ai-dnd.playerId", "playwright-turn-room-smoke-host");
    });
    await page.goto(`/play?campaignId=${campaign.id}`);

    await page.getByRole("button", { name: /begin adventure/i }).click();

    const deterministicOpener = page.getByText(
      "Lanternlight gathers around the Ashford Tollhouse"
    );
    await expect(deterministicOpener).toHaveCount(1);

    const playerAction = "I inspect the sealed road charter for a broken seal.";
    await page
      .getByPlaceholder("Speak, search, attack, bargain...")
      .fill(playerAction);
    await expect(page.getByRole("button", { name: /^send$/i })).toBeEnabled();
    const hostSubmitResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/room/submit") && response.status() === 200
    );
    await page.getByRole("button", { name: /^send$/i }).click();
    await hostSubmitResponse;

    await expect(page.getByText(playerAction)).toBeVisible();

    const joinerContext = await browser.newContext({
      storageState: joinerStorageState
    });

    try {
      const joinerPage = await joinerContext.newPage();
      await joinerPage.goto(`/play?campaignId=${campaign.id}`);

      await expect(
        joinerPage.getByRole("button", { name: /^skip$/i })
      ).toBeEnabled();
      const joinerSubmitResponse = joinerPage.waitForResponse(
        (response) =>
          response.url().endsWith("/api/room/submit") && response.status() === 200
      );
      await joinerPage.getByRole("button", { name: /^skip$/i }).click();
      await joinerSubmitResponse;

      await expect(joinerPage.getByText(playerAction)).toBeVisible();
      await expect(
        joinerPage.getByText("Calder Rainwatch skips their turn.")
      ).toBeVisible();
      await expect(
        joinerPage.getByText("Lanternlight gathers around the Ashford Tollhouse")
      ).toBeVisible();
      await expect(joinerPage.getByText("What do you do?")).toBeVisible();
    } finally {
      await joinerContext.close();
    }
  });

  test("play answers an Ask DM question with the deterministic local DM provider", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "ask-dm-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Ask DM Smoke Adventure",
      ownerClientId: "playwright-ask-dm-smoke-host",
      campaignGenreKind: "custom",
      customWorldName: "Playwright Test Realm",
      customWorldDescription:
        "A compact test realm for deterministic local smoke tests.",
      ownerCharacterName: "Elian Charterwise",
      ownerCharacterSheet:
        "Elian Charterwise is a level 1 wizard with a wax-stained satchel, a careful eye for legal seals, and a habit of asking clarifying questions before acting."
    });

    await signInWithPasswordlessToken(page, request, {
      email: "ask-dm-smoke-joiner@example.com",
      nextPath: "/new-adventure"
    });
    await joinMultiplayerCampaignThroughBrowser(page, {
      gameCode: campaign.joinCode!,
      clientId: "playwright-ask-dm-smoke-joiner",
      username: "Ask DM Smoke Joiner",
      characterName: "Maren Bridgekeep",
      characterSheet:
        "Maren Bridgekeep is a level 1 fighter with a river-marked shield, a practical pack, and a steady sense for when roads feel wrong."
    });

    await signInWithPasswordlessToken(page, request, {
      email: "ask-dm-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    await page.evaluate(() => {
      localStorage.setItem("ai-dnd.playerId", "playwright-ask-dm-smoke-host");
    });
    await page.goto(`/play?campaignId=${campaign.id}`);

    await page.getByRole("button", { name: /begin adventure/i }).click();

    await expect(
      page.getByText("Lanternlight gathers around the Ashford Tollhouse")
    ).toBeVisible();

    const question = "What can I tell about the sealed road charter?";
    await page.getByRole("button", { name: /^ask dm$/i }).click();
    await page
      .getByPlaceholder("Ask the DM a question without advancing time...")
      .fill(question);
    await expect(page.getByRole("button", { name: /^ask$/i })).toBeEnabled();
    const askDmResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/campaigns/${campaign.id}/ask-dm`) &&
        response.status() === 200
    );
    await page.getByRole("button", { name: /^ask$/i }).click();
    await askDmResponse;

    await expect(page.getByText(question)).toBeVisible();
    await expect(page.getByText("Elian Charterwise asks the DM")).toBeVisible();
    await expect(page.getByText("DM Answer")).toBeVisible();
    await expect(page.getByText(/broken seal/)).toBeVisible();
  });

  test("play preserves multiplayer pre-begin room state after page reload", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "refresh-room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Refresh Room Smoke Adventure",
      ownerClientId: "playwright-refresh-room-smoke-host"
    });

    await signInWithPasswordlessToken(page, request, {
      email: "refresh-room-smoke-joiner@example.com",
      nextPath: "/new-adventure"
    });
    await joinMultiplayerCampaignThroughBrowser(page, {
      gameCode: campaign.joinCode!,
      clientId: "playwright-refresh-room-smoke-joiner",
      username: "Refresh Room Smoke Joiner",
      characterName: "Lio Starfen",
      characterSheet:
        "Lio Starfen is a level 1 wizard with a lantern staff, ink-stained notes, and a patient curiosity for old doors."
    });

    await page.goto(`/play?campaignId=${campaign.id}`);
    await expect(
      page.getByText("The party is gathered. Let the DM open the campaign.")
    ).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(new RegExp(`/play\\?campaignId=${campaign.id}$`));
    await expect(
      page.getByRole("region", { name: "AI Dungeons and Dragons table" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /open chat: lio starfen/i })
    ).toBeVisible();
    await expect(page.getByText("Refresh Room Smoke Adventure")).toBeVisible();
    await expect(
      page.getByText("The party is gathered. Let the DM open the campaign.")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /begin adventure/i })
    ).toBeEnabled();
  });

  test("play reconnects a complete multiplayer player in a fresh browser context", async ({
    browser,
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "reconnect-room-smoke-host@example.com",
      nextPath: "/new-adventure"
    });
    const campaign = await createMultiplayerCampaignThroughBrowser(page, {
      title: "Reconnect Room Smoke Adventure",
      ownerClientId: "playwright-reconnect-room-smoke-host"
    });

    await signInWithPasswordlessToken(page, request, {
      email: "reconnect-room-smoke-joiner@example.com",
      nextPath: "/new-adventure"
    });
    await joinMultiplayerCampaignThroughBrowser(page, {
      gameCode: campaign.joinCode!,
      clientId: "playwright-reconnect-room-smoke-joiner",
      username: "Reconnect Room Smoke Joiner",
      characterName: "Nessa Brightvale",
      characterSheet:
        "Nessa Brightvale is a level 1 cleric with a brass sun pendant, a worn field journal, and a gentle instinct for frightened travelers."
    });

    await page.goto(`/play?campaignId=${campaign.id}`);
    await expect(
      page.getByText("The party is gathered. Let the DM open the campaign.")
    ).toBeVisible();

    const reconnectedContext = await browser.newContext({
      storageState: await page.context().storageState()
    });

    try {
      const reconnectedPage = await reconnectedContext.newPage();
      await reconnectedPage.goto(`/play?campaignId=${campaign.id}`);

      await expect(reconnectedPage).toHaveURL(
        new RegExp(`/play\\?campaignId=${campaign.id}$`)
      );
      await expect(
        reconnectedPage.getByRole("region", {
          name: "AI Dungeons and Dragons table"
        })
      ).toBeVisible();
      await expect(
        reconnectedPage.getByRole("button", {
          name: /open chat: nessa brightvale/i
        })
      ).toBeVisible();
      await expect(
        reconnectedPage.getByText("Reconnect Room Smoke Adventure")
      ).toBeVisible();
      await expect(
        reconnectedPage.getByText(
          "The party is gathered. Let the DM open the campaign."
        )
      ).toBeVisible();
      await expect(
        reconnectedPage.getByRole("button", { name: /begin adventure/i })
      ).toBeEnabled();
    } finally {
      await reconnectedContext.close();
    }
  });
});
