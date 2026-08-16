import mixpanel from "mixpanel";
import {
  AnalyticsEventSchema,
  hookPointsForMetric,
  type AnalyticsEventName,
  type AnalyticsEventProperties,
  type HookMetric
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
  milestones?: HookMetric[];
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

function milestoneProperty(metric: HookMetric) {
  return `hook_${metric}`;
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
    track({ name, distinctId, properties = {}, milestones = [] }) {
      const hookDeltas = milestones.map((metric) => ({
        metric,
        points: hookPointsForMetric(metric)
      }));
      const event = AnalyticsEventSchema.parse({
        name,
        properties: {
          ...properties,
          app: "ai-taverns",
          distinctId,
          schemaVersion: 1,
          source: "api",
          ...(hookDeltas.length > 0 ? { hookDeltas } : {})
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

      if (hookDeltas.length === 0) {
        return;
      }

      milestones.forEach((metric) => {
        sendFireAndForget(
          (callback) =>
            client.track(
              "Hook Milestone Reached",
              {
                ...mixpanelProperties,
                hookMilestone: metric
              },
              callback
            ),
          onError
        );
      });

      const incrementBy = hookDeltas.reduce(
        (total, delta) => total + delta.points,
        0
      );
      const milestoneFlags = Object.fromEntries(
        hookDeltas.map((delta) => [milestoneProperty(delta.metric), true])
      );

      sendFireAndForget(
        (callback) =>
          client.people.increment(
            distinctId,
            "hook_score_lifetime",
            incrementBy,
            callback
          ),
        onError
      );
      sendFireAndForget(
        (callback) =>
          client.people.set(distinctId, {
            ...milestoneFlags,
            latest_hook_score_delta: incrementBy,
            latest_hook_milestone_at: new Date().toISOString(),
            is_hooked_candidate: Boolean(event.properties.isHooked)
          }, callback),
        onError
      );
    }
  };
}
