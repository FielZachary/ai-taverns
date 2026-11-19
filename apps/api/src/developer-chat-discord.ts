import type { FastifyInstance } from "fastify";
import type { ApiConfig } from "./config.js";

type PendingNotification = {
  id: string;
  attempt_count: number;
  thread_id: string;
  campaign_title: string;
  email: string | null;
  character_name: string | null;
};

const deliveryBatchSize = 20;
const deliveryIntervalMs = 30_000;

function maskedEmail(email: string | null) {
  if (!email) return "Player";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "Player";
  return `${local.slice(0, 2)}${local.length > 2 ? "…" : ""}@${domain}`;
}

function notificationContent(notification: PendingNotification, config: ApiConfig) {
  const inboxUrl = new URL(
    `/dev/chat/${notification.thread_id}`,
    config.authPublicAppOrigin
  ).toString();
  const character = notification.character_name?.trim() || "No character";

  return [
    "**New developer-chat message**",
    `Campaign: **${notification.campaign_title}**`,
    `Character: ${character}`,
    `From: ${maskedEmail(notification.email)}`,
    `Open inbox: ${inboxUrl}`
  ].join("\n");
}

function retryDelaySeconds(attemptCount: number) {
  return Math.min(3600, 30 * 2 ** Math.min(attemptCount, 7));
}

export async function deliverDeveloperChatDiscordNotifications(
  fastify: FastifyInstance,
  config: ApiConfig
) {
  if (!config.devChatDiscordWebhookUrl) return;

  const claimed = await fastify.pg.query<PendingNotification>(
    `with pending as (
       select n.id
       from developer_chat_discord_notifications n
       where n.delivered_at is null
         and n.next_attempt_at <= now()
         and (n.locked_until is null or n.locked_until < now())
       order by n.created_at asc
       for update skip locked
       limit $1
     )
     update developer_chat_discord_notifications n
     set locked_until = now() + interval '1 minute'
     from pending,
       developer_chat_messages m
       join developer_chat_threads t on t.id = m.thread_id
       join campaigns c on c.id = t.campaign_id
       left join users u on u.id = m.author_user_id
       left join players p on p.id = m.author_player_id
     where n.id = pending.id and m.id = n.message_id
     returning n.id, n.attempt_count, t.id as thread_id, c.title as campaign_title,
       u.email, p.character_name`,
    [deliveryBatchSize]
  );

  for (const notification of claimed.rows) {
    try {
      const response = await fetch(config.devChatDiscordWebhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: notificationContent(notification, config),
          allowed_mentions: { parse: [] }
        }),
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error(`Discord webhook returned ${response.status}`);

      await fastify.pg.query(
        `update developer_chat_discord_notifications
         set delivered_at = now(), locked_until = null, last_error = null
         where id = $1`,
        [notification.id]
      );
    } catch (error) {
      const retrySeconds = retryDelaySeconds(notification.attempt_count);
      await fastify.pg.query(
        `update developer_chat_discord_notifications
         set attempt_count = attempt_count + 1,
             locked_until = null,
             next_attempt_at = now() + ($2 * interval '1 second'),
             last_error = $3
         where id = $1`,
        [
          notification.id,
          retrySeconds,
          error instanceof Error ? error.message.slice(0, 1000) : "Unknown Discord delivery error"
        ]
      );
      fastify.log.warn({ error, notificationId: notification.id }, "Developer-chat Discord notification failed.");
    }
  }
}

export function registerDeveloperChatDiscordNotifications(
  fastify: FastifyInstance,
  config: ApiConfig
) {
  if (!config.devChatDiscordWebhookUrl) return;

  const deliver = () => {
    void deliverDeveloperChatDiscordNotifications(fastify, config).catch((error) => {
      fastify.log.error({ error }, "Developer-chat Discord notification dispatcher failed.");
    });
  };

  fastify.addHook("onReady", async () => {
    deliver();
  });
  const interval = setInterval(deliver, deliveryIntervalMs);
  interval.unref();
  fastify.addHook("onClose", async () => {
    clearInterval(interval);
  });
}
