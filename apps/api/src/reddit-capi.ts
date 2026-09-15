import { createHash, randomUUID } from "node:crypto";

import type { FastifyBaseLogger } from "fastify";

import type { ApiConfig } from "./config.js";

const REDDIT_CONVERSION_EVENTS_URL = "https://ads-api.reddit.com/api/v3/pixels";

type RedditSignupInput = {
  email: string;
  userId: string;
  eventSourceUrl: string;
  ipAddress: string;
  userAgent: string | undefined;
};

function sha256(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

function clickIdFromSourceUrl(eventSourceUrl: string) {
  try {
    return new URL(eventSourceUrl).searchParams.get("rdt_cid") ?? undefined;
  } catch {
    return undefined;
  }
}

export function redditCapiIsConfigured(config: ApiConfig) {
  return Boolean(config.redditCapiPixelId && config.redditCapiAccessToken);
}

export async function trackRedditSignup(input: {
  config: ApiConfig;
  log: FastifyBaseLogger;
  signup: RedditSignupInput;
  fetchImplementation?: typeof fetch;
}) {
  const { config, log, signup } = input;

  if (!redditCapiIsConfigured(config)) {
    return;
  }

  const fetchImplementation = input.fetchImplementation ?? fetch;
  const endpoint = `${REDDIT_CONVERSION_EVENTS_URL}/${encodeURIComponent(config.redditCapiPixelId!)}/conversion_events`;
  const clickId = clickIdFromSourceUrl(signup.eventSourceUrl);

  try {
    const response = await fetchImplementation(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.redditCapiAccessToken!}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        data: {
          events: [
            {
              event_at: Date.now(),
              event_source_url: signup.eventSourceUrl,
              action_source: "WEBSITE",
              ...(clickId ? { click_id: clickId } : {}),
              type: {
                tracking_type: "SIGN_UP"
              },
              user: {
                email: sha256(signup.email),
                external_id: sha256(signup.userId),
                ip_address: signup.ipAddress,
                ...(signup.userAgent ? { user_agent: signup.userAgent } : {})
              },
              metadata: {
                conversion_id: randomUUID()
              }
            }
          ]
        }
      })
    });

    if (!response.ok) {
      log.warn(
        { statusCode: response.status },
        "Reddit Conversions API rejected signup event."
      );
    }
  } catch (error) {
    log.warn({ err: error }, "Reddit Conversions API signup event failed.");
  }
}
