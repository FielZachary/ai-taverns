import type { FastifyInstance } from "fastify";
import {
  DeveloperChatCampaignParamsSchema,
  DeveloperChatListResponseSchema,
  DeveloperChatSendRequestSchema,
  DeveloperChatThreadParamsSchema,
  DeveloperChatThreadResponseSchema,
  DeveloperChatUnreadResponseSchema
} from "@ai-dnd/contracts";
import type { ApiConfig } from "../config.js";
import { requireAuthenticatedUser } from "./auth.js";

type Options = { config: ApiConfig };
type Role = "user" | "developer";

function error(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

async function assertCampaignAccess(fastify: FastifyInstance, campaignId: string, userId: string) {
  const result = await fastify.pg.query<{ id: string }>(
    `select c.id from campaigns c where c.id = $1 and (c.owner_user_id = $2 or exists (select 1 from players p where p.campaign_id = c.id and p.user_id = $2 and p.status <> 'kicked'))`,
    [campaignId, userId]
  );
  if (!result.rowCount) throw error(404, "Campaign not found.");
}

async function threadForCampaign(fastify: FastifyInstance, campaignId: string) {
  await fastify.pg.query("insert into developer_chat_threads (campaign_id) values ($1) on conflict (campaign_id) do nothing", [campaignId]);
  const result = await fastify.pg.query<{ id: string }>("select id from developer_chat_threads where campaign_id = $1", [campaignId]);
  return result.rows[0]!.id;
}

async function threadPayload(fastify: FastifyInstance, threadId: string, role: Role) {
  const result = await fastify.pg.query<{
    id: string; campaign_id: string; title: string; email: string; character_name: string | null; updated_at: Date;
    user_last_read_at: Date | null; developer_last_read_at: Date | null;
  }>(`select t.id, t.campaign_id, c.title, coalesce(last_author.email, owner.email) as email, coalesce(last_player.character_name, owner_player.character_name, '') as character_name, t.updated_at, t.user_last_read_at, t.developer_last_read_at
      from developer_chat_threads t join campaigns c on c.id=t.campaign_id join users owner on owner.id=c.owner_user_id
      left join lateral (select author_user_id, author_player_id from developer_chat_messages where thread_id=t.id and sender_role='user' order by created_at desc limit 1) last_user_message on true
      left join users last_author on last_author.id=last_user_message.author_user_id
      left join players last_player on last_player.id=last_user_message.author_player_id
      left join lateral (select character_name from players where campaign_id=c.id and user_id=c.owner_user_id order by updated_at desc limit 1) owner_player on true where t.id=$1`, [threadId]);
  const row = result.rows[0];
  if (!row) throw error(404, "Conversation not found.");
  const messages = await fastify.pg.query<{ id:string; sender_role:Role; body:string; created_at:Date; email:string|null; character_name:string|null }>(
    `select m.id,m.sender_role,m.body,m.created_at,u.email,p.character_name from developer_chat_messages m left join users u on u.id=m.author_user_id left join players p on p.id=m.author_player_id where m.thread_id=$1 order by m.created_at asc`, [threadId]);
  const unread = await fastify.pg.query<{ count:string }>(`select count(*)::text as count from developer_chat_messages where thread_id=$1 and sender_role=$2 and created_at > coalesce($3::timestamptz, 'epoch'::timestamptz)`, [threadId, role === "user" ? "developer" : "user", role === "user" ? row.user_last_read_at : row.developer_last_read_at]);
  return {
    thread: {
      id: row.id, campaignId: row.campaign_id, campaignTitle: row.title, userEmail: row.email, characterName: row.character_name || undefined,
      updatedAt: row.updated_at.toISOString(), unreadForUser: role === "user" ? Number(unread.rows[0]?.count ?? 0) : 0,
      unreadForDeveloper: role === "developer" ? Number(unread.rows[0]?.count ?? 0) : 0,
      lastMessage: messages.rows.at(-1) ? messageDto(messages.rows.at(-1)!) : undefined
    }, messages: messages.rows.map(messageDto)
  };
}

function messageDto(row: { id:string; sender_role:Role; body:string; created_at:Date; email:string|null; character_name:string|null }) {
  return { id: row.id, senderRole: row.sender_role, body: row.body, createdAt: row.created_at.toISOString(), ...(row.email ? { authorEmail: row.email } : {}), ...(row.character_name ? { authorCharacterName: row.character_name } : {}) };
}

function requireDeveloper(request: { headers: Record<string, string | string[] | undefined> }, config: ApiConfig) {
  if (!config.devChatPassword || request.headers["x-developer-chat-password"] !== config.devChatPassword) throw error(404, "Route not found.");
}

export async function registerDeveloperChatRoutes(fastify: FastifyInstance, options: Options) {
  const { config } = options;
  fastify.get("/developer-chat/campaign/:campaignId", async (request) => {
    const params = DeveloperChatCampaignParamsSchema.parse(request.params);
    const user = await requireAuthenticatedUser(fastify, config, request.cookies[config.authCookieName]);
    await assertCampaignAccess(fastify, params.campaignId, user.id);
    const threadId = await threadForCampaign(fastify, params.campaignId);
    await fastify.pg.query("update developer_chat_threads set user_last_read_at=now() where id=$1", [threadId]);
    return DeveloperChatThreadResponseSchema.parse(await threadPayload(fastify, threadId, "user"));
  });
  fastify.post("/developer-chat/campaign/:campaignId/messages", async (request) => {
    const params = DeveloperChatCampaignParamsSchema.parse(request.params); const body = DeveloperChatSendRequestSchema.parse(request.body);
    const user = await requireAuthenticatedUser(fastify, config, request.cookies[config.authCookieName]);
    await assertCampaignAccess(fastify, params.campaignId, user.id);
    const threadId = await threadForCampaign(fastify, params.campaignId);
    const player = await fastify.pg.query<{id:string}>("select id from players where campaign_id=$1 and user_id=$2 and status <> 'kicked' order by updated_at desc limit 1", [params.campaignId,user.id]);
    await fastify.pg.query("insert into developer_chat_messages (thread_id,author_user_id,author_player_id,sender_role,body) values ($1,$2,$3,'user',$4)", [threadId,user.id,player.rows[0]?.id ?? null,body.body]);
    await fastify.pg.query("update developer_chat_threads set updated_at=now() where id=$1", [threadId]);
    return DeveloperChatThreadResponseSchema.parse(await threadPayload(fastify, threadId, "user"));
  });
  fastify.get("/developer-chat/unread", async (request) => {
    const user = await requireAuthenticatedUser(fastify, config, request.cookies[config.authCookieName]);
    const result = await fastify.pg.query<{count:string}>(`select count(*)::text as count from developer_chat_messages m join developer_chat_threads t on t.id=m.thread_id join campaigns c on c.id=t.campaign_id where m.sender_role='developer' and m.created_at > coalesce(t.user_last_read_at,'epoch') and (c.owner_user_id=$1 or exists (select 1 from players p where p.campaign_id=c.id and p.user_id=$1 and p.status <> 'kicked'))`,[user.id]);
    return DeveloperChatUnreadResponseSchema.parse({ unreadCount:Number(result.rows[0]?.count ?? 0) });
  });
  fastify.get("/internal/developer-chat", async (request) => {
    requireDeveloper(request,config);
    const rows = await fastify.pg.query<{id:string}>("select id from developer_chat_threads order by updated_at desc");
    const threads = await Promise.all(rows.rows.map(async ({id}) => (await threadPayload(fastify,id,"developer")).thread));
    return DeveloperChatListResponseSchema.parse({threads});
  });
  fastify.get("/internal/developer-chat/:threadId", async (request) => {
    requireDeveloper(request,config); const {threadId}=DeveloperChatThreadParamsSchema.parse(request.params);
    await fastify.pg.query("update developer_chat_threads set developer_last_read_at=now() where id=$1",[threadId]);
    return DeveloperChatThreadResponseSchema.parse(await threadPayload(fastify,threadId,"developer"));
  });
  fastify.post("/internal/developer-chat/:threadId/messages", async (request) => {
    requireDeveloper(request,config); const {threadId}=DeveloperChatThreadParamsSchema.parse(request.params); const body=DeveloperChatSendRequestSchema.parse(request.body);
    await fastify.pg.query("insert into developer_chat_messages (thread_id,sender_role,body) values ($1,'developer',$2)",[threadId,body.body]);
    await fastify.pg.query("update developer_chat_threads set updated_at=now() where id=$1",[threadId]);
    return DeveloperChatThreadResponseSchema.parse(await threadPayload(fastify,threadId,"developer"));
  });
}
