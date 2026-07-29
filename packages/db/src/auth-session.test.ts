import assert from "node:assert/strict";
import { test } from "node:test";
import {
  consumeLoginToken,
  createLoginToken,
  createSession,
  ensureEmailIdentity,
  findActiveSessionByTokenHash,
  logCampaignEvent,
  mapSessionRow,
  mapUserRow,
  revokeSessionByTokenHash,
  upsertUserByEmail,
  withTransaction,
  type Queryable,
  type SessionRow,
  type UserRow
} from "./index.js";

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "user-1",
    email: "mira@example.com",
    display_name: "Mira",
    created_at: new Date("2026-07-29T00:00:00.000Z"),
    updated_at: new Date("2026-07-29T00:01:00.000Z"),
    ...overrides
  };
}

function sessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "session-1",
    user_id: "user-1",
    token_hash: "session-hash",
    created_at: new Date("2026-07-29T00:02:00.000Z"),
    expires_at: new Date("2026-07-30T00:00:00.000Z"),
    revoked_at: null,
    last_seen_at: new Date("2026-07-29T00:03:00.000Z"),
    ...overrides
  };
}

function fakeDb(rows: unknown[] = []): Queryable & {
  queries: { sql: string; values: unknown[] }[];
} {
  const queries: { sql: string; values: unknown[] }[] = [];

  const db = {
    queries,
    async query(sql: unknown, values: unknown[] = []) {
      assert.equal(typeof sql, "string");
      const sqlText = sql as string;
      queries.push({ sql: sqlText, values });
      return { rows };
    }
  };

  return db as unknown as Queryable & {
    queries: { sql: string; values: unknown[] }[];
  };
}

test("auth row mappers preserve public user and session fields", () => {
  const mappedUser = mapUserRow(userRow({ display_name: null }));
  assert.equal(mappedUser.id, "user-1");
  assert.equal(mappedUser.email, "mira@example.com");
  assert.equal(mappedUser.displayName, null);

  const mappedSession = mapSessionRow(
    sessionRow({ revoked_at: new Date("2026-07-29T00:04:00.000Z") })
  );
  assert.equal(mappedSession.id, "session-1");
  assert.equal(mappedSession.userId, "user-1");
  assert.equal(
    mappedSession.revokedAt?.toISOString(),
    "2026-07-29T00:04:00.000Z"
  );
});

test("login token helpers create and consume token rows", async () => {
  const expiresAt = new Date("2026-07-30T00:00:00.000Z");
  const createdAt = new Date("2026-07-29T00:00:00.000Z");
  const tokenRow = {
    id: "token-1",
    email: "mira@example.com",
    token_hash: "token-hash",
    created_at: createdAt,
    expires_at: expiresAt,
    consumed_at: null
  };
  const createDb = fakeDb([tokenRow]);

  const created = await createLoginToken(createDb, {
    email: "mira@example.com",
    tokenHash: "token-hash",
    expiresAt
  });

  assert.equal(created.id, "token-1");
  assert.deepEqual(createDb.queries[0]?.values, [
    "mira@example.com",
    "token-hash",
    expiresAt
  ]);

  const consumedAt = new Date("2026-07-29T00:05:00.000Z");
  const consumeDb = fakeDb([{ ...tokenRow, consumed_at: consumedAt }]);
  const consumed = await consumeLoginToken(consumeDb, {
    tokenHash: "token-hash",
    consumedAt
  });

  assert.equal(consumed?.consumed_at, consumedAt);
  assert.deepEqual(consumeDb.queries[0]?.values, ["token-hash", consumedAt]);

  assert.equal(
    await consumeLoginToken(fakeDb([]), { tokenHash: "missing", consumedAt }),
    null
  );
});

test("user and session helpers map returned records", async () => {
  const upsertDb = fakeDb([userRow({ display_name: "Mira Vale" })]);
  const user = await upsertUserByEmail(upsertDb, {
    email: "mira@example.com",
    displayName: "Mira Vale"
  });

  assert.equal(user.displayName, "Mira Vale");
  assert.deepEqual(upsertDb.queries[0]?.values, [
    "mira@example.com",
    "Mira Vale"
  ]);

  const identityDb = fakeDb();
  await ensureEmailIdentity(identityDb, {
    userId: "user-1" as never,
    email: "mira@example.com"
  });
  assert.deepEqual(identityDb.queries[0]?.values, [
    "user-1",
    "mira@example.com"
  ]);

  const expiresAt = new Date("2026-07-30T00:00:00.000Z");
  const sessionDb = fakeDb([sessionRow({ expires_at: expiresAt })]);
  const session = await createSession(sessionDb, {
    userId: "user-1" as never,
    tokenHash: "session-hash",
    expiresAt
  });

  assert.equal(session.id, "session-1");
  assert.equal(session.expiresAt, expiresAt);
});

test("active session lookup and revocation use expected query values", async () => {
  const now = new Date("2026-07-29T00:05:00.000Z");
  const activeDb = fakeDb([
    {
      ...userRow(),
      session_id: "session-1",
      user_id: "user-1",
      token_hash: "session-hash",
      session_created_at: new Date("2026-07-29T00:02:00.000Z"),
      expires_at: new Date("2026-07-30T00:00:00.000Z"),
      revoked_at: null,
      last_seen_at: now
    }
  ]);

  const active = await findActiveSessionByTokenHash(
    activeDb,
    "session-hash",
    now
  );

  assert.equal(active?.user.email, "mira@example.com");
  assert.equal(active?.session.userId, "user-1");
  assert.deepEqual(activeDb.queries[0]?.values, ["session-hash", now]);
  assert.equal(
    await findActiveSessionByTokenHash(fakeDb([]), "missing", now),
    null
  );

  const revokeDb = fakeDb();
  await revokeSessionByTokenHash(revokeDb, "session-hash", now);
  assert.deepEqual(revokeDb.queries[0]?.values, ["session-hash", now]);
});

test("transactions commit successful callbacks and roll back failures", async () => {
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      return { rows: [] };
    },
    release() {
      queries.push("release");
    }
  };
  const pool = {
    async connect() {
      return client;
    }
  };

  const result = await withTransaction(pool as never, async (transaction) => {
    await transaction.query("select 1");
    return "done";
  });

  assert.equal(result, "done");
  assert.deepEqual(queries, ["begin", "select 1", "commit", "release"]);

  queries.length = 0;
  await assert.rejects(
    () =>
      withTransaction(pool as never, async (transaction) => {
        await transaction.query("select 2");
        throw new Error("nope");
      }),
    /nope/
  );
  assert.deepEqual(queries, ["begin", "select 2", "rollback", "release"]);
});

test("logCampaignEvent stores JSON payloads and returns event ids", async () => {
  const db = fakeDb([{ id: "event-1" }]);

  const eventId = await logCampaignEvent(db, "campaign-1", "turn_resolved", {
    content: "Done."
  });

  assert.equal(eventId, "event-1");
  assert.deepEqual(db.queries[0]?.values, [
    "campaign-1",
    "turn_resolved",
    JSON.stringify({ content: "Done." })
  ]);
});
