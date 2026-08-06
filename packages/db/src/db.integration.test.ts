import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const migrationsDir = new URL("../../../infra/db/migrations/", import.meta.url);

async function resetAndMigrate(pool: pg.Pool) {
  const database = await pool.query<{ current_database: string }>(
    "select current_database()"
  );
  const databaseName = database.rows[0]?.current_database ?? "";

  if (!databaseName.includes("test")) {
    throw new Error(
      `Refusing to reset non-test database "${databaseName}" for integration tests.`
    );
  }

  await pool.query("drop schema public cascade");
  await pool.query("create schema public");

  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  for (const migrationFile of migrationFiles) {
    const sql = await readFile(new URL(migrationFile, migrationsDir), "utf8");
    await pool.query(sql);
  }
}

test(
  "database helpers round-trip auth, campaigns, joining, and room reads against Postgres",
  { skip: databaseUrl ? false : "DATABASE_URL is required for DB integration tests." },
  async () => {
    assert.ok(databaseUrl);

    const pool = new Pool({
      connectionString: databaseUrl,
      ssl:
        process.env.DATABASE_SSL_DISABLED === "true"
          ? false
          : {
              rejectUnauthorized: false
            }
    });

    try {
      await resetAndMigrate(pool);

      const {
        consumeLoginToken,
        createCampaignForMode,
        createLoginToken,
        createSession,
        ensureEmailIdentity,
        findActiveSessionByTokenHash,
        getCampaignSummaryForUser,
        getRoomForUser,
        joinCampaignByCode,
        listCampaignSummariesForUser,
        previewCampaignJoinByCode,
        revokeSessionByTokenHash,
        upsertUserByEmail
      } = await import("./index.js");

      const expiresAt = new Date(Date.now() + 60_000);
      const loginToken = await createLoginToken(pool, {
        email: "owner@example.com",
        tokenHash: "login-token-hash",
        expiresAt
      });

      assert.equal(loginToken.email, "owner@example.com");
      assert.equal(loginToken.consumed_at, null);

      const consumedToken = await consumeLoginToken(pool, {
        tokenHash: "login-token-hash",
        consumedAt: new Date()
      });
      const reusedToken = await consumeLoginToken(pool, {
        tokenHash: "login-token-hash",
        consumedAt: new Date()
      });

      assert.equal(consumedToken?.email, "owner@example.com");
      assert.equal(reusedToken, null);

      const owner = await upsertUserByEmail(pool, {
        email: "owner@example.com",
        displayName: "Owner"
      });
      await ensureEmailIdentity(pool, {
        userId: owner.id,
        email: owner.email
      });

      const session = await createSession(pool, {
        userId: owner.id,
        tokenHash: "session-token-hash",
        expiresAt: new Date(Date.now() + 86_400_000)
      });
      const activeSession = await findActiveSessionByTokenHash(
        pool,
        "session-token-hash",
        new Date()
      );

      assert.equal(activeSession?.user.email, "owner@example.com");
      assert.equal(activeSession?.session.id, session.id);

      await revokeSessionByTokenHash(pool, "session-token-hash", new Date());
      assert.equal(
        await findActiveSessionByTokenHash(pool, "session-token-hash", new Date()),
        null
      );

      const campaign = await createCampaignForMode(pool, {
        mode: "multiplayer",
        title: "Integration Quest",
        campaignGenre: "Classic Fantasy",
        campaignGenreKind: "preset",
        campaignGenrePresetId: "classic_fantasy",
        ownerClientId: "owner-client",
        playerName: "Owner",
        characterName: "Guide",
        characterSheet: "A prepared guide.",
        userId: owner.id
      });

      assert.equal(campaign.title, "Guide");
      assert.equal(campaign.mode, "multiplayer");
      assert.match(campaign.joinCode ?? "", /^[A-Z0-9]{6}$/);

      const ownerCampaigns = await listCampaignSummariesForUser(pool, owner.id);
      const ownerRead = await getCampaignSummaryForUser(pool, {
        campaignId: campaign.id,
        userId: owner.id
      });

      assert.equal(ownerCampaigns.length, 1);
      assert.equal(ownerCampaigns[0]?.currentUserPlayerId, "owner-client");
      assert.equal(ownerRead.id, campaign.id);
      assert.equal(ownerRead.joinCode, campaign.joinCode);
      assert.equal(ownerRead.currentUserPlayerId, "owner-client");

      const joinPreview = await previewCampaignJoinByCode(
        pool,
        campaign.joinCode ?? ""
      );
      assert.equal(joinPreview.campaignTitle, "Integration Quest");
      assert.equal(joinPreview.availableSlots, 3);

      const joiner = await upsertUserByEmail(pool, {
        email: "joiner@example.com",
        displayName: "Joiner"
      });
      const joinedCampaign = await joinCampaignByCode(pool, {
        gameCode: campaign.joinCode ?? "",
        clientId: "joiner-client",
        username: "Joiner",
        characterName: "Scout",
        characterSheet: "A careful scout.",
        userId: joiner.id
      });

      assert.equal(joinedCampaign.id, campaign.id);
      assert.equal(joinedCampaign.title, "Scout");
      assert.equal(joinedCampaign.joinCode, undefined);
      assert.equal(joinedCampaign.currentUserPlayerId, "joiner-client");

      const room = await getRoomForUser(pool, {
        roomId: campaign.id,
        sessionId: campaign.id,
        userId: joiner.id
      });

      assert.equal(room.roomId, campaign.id);
      assert.equal(room.currentPlayerId, "joiner-client");
      assert.equal(room.players.length, 2);
      assert.deepEqual(
        room.players.map((player) => player.characterName),
        ["Guide", "Scout"]
      );

      const ownerRoom = await getRoomForUser(pool, {
        roomId: campaign.id,
        sessionId: campaign.id,
        userId: owner.id
      });

      assert.equal(ownerRoom.currentPlayerId, "owner-client");
    } finally {
      await pool.end();
    }
  }
);
