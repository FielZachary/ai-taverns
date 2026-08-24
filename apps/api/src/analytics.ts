import mixpanel from "mixpanel";
import {
  AnalyticsEventSchema,
  type AnalyticsEventName,
  type AnalyticsEventProperties
} from "@ai-dnd/contracts";
import type { ApiConfig } from "./config.js";

type AnalyticsClient = ReturnType<typeof mixpanel.init>;

type TrackInput = {
  name: AnalyticsEventName;
  distinctId: string;
  properties?: Omit<
    AnalyticsEventProperties,
    "app" | "distinctId" | "schemaVersion" | "source"
  >;
  // Accepted temporarily so existing product events remain source-compatible;
  // lifecycle promotion is now evaluated in the shared client lifecycle model.
  milestones?: string[];
};

type UserProfileInput = {
  distinctId: string;
  properties: Record<string, unknown>;
  setOnce?: Record<string, unknown>;
};

export type ServerAnalytics = {
  enabled: boolean;
  identify(input: UserProfileInput): void;
  track(input: TrackInput): void;
};

function sendFireAndForget(
  send: (callback: (error: Error | undefined) => void) => void,
  onError: (error: Error) => void
) {
  send((error) => {
    if (error) {
      onError(error);
    }
  });
}

export function createServerAnalytics(input: {
  config: ApiConfig;
  log?: {
    warn: (payload: unknown, message: string) => void;
    debug?: (payload: unknown, message: string) => void;
  };
}): ServerAnalytics {
  const { config, log } = input;
  const enabled = config.mixpanelEnabled && Boolean(config.mixpanelProjectToken);

  if (!enabled || !config.mixpanelProjectToken) {
    return {
      enabled: false,
      identify() {},
      track() {}
    };
  }

  const client: AnalyticsClient = mixpanel.init(config.mixpanelProjectToken, {
    debug: config.mixpanelDebug
  });

  const onError = (error: Error) => {
    log?.warn({ error }, "Mixpanel analytics event failed.");
  };

  return {
    enabled: true,
    identify({ distinctId, properties, setOnce }) {
      const profile = {
        ...properties,
        app: "ai-taverns",
        schemaVersion: 1,
        mixpanelProjectId: config.mixpanelProjectId
      };

      sendFireAndForget(
        (callback) => client.people.set(distinctId, profile, callback),
        onError
      );

      if (setOnce && Object.keys(setOnce).length > 0) {
        sendFireAndForget(
          (callback) => client.people.set_once(distinctId, setOnce, callback),
          onError
        );
      }
    },
    track({ name, distinctId, properties = {} }) {
      const event = AnalyticsEventSchema.parse({
        name,
        properties: {
          ...properties,
          app: "ai-taverns",
          distinctId,
          schemaVersion: 1,
          source: "api"
        }
      });
      const mixpanelProperties = {
        ...event.properties,
        distinct_id: distinctId
      };

      sendFireAndForget(
        (callback) =>
          client.track(event.name, mixpanelProperties, callback),
        onError
      );

    }
  };
}
