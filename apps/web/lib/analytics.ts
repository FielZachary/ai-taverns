"use client";

import mixpanel from "mixpanel-browser";
import {
  AnalyticsEventSchema,
  hookSnapshotForMetrics,
  type AnalyticsEventName,
  type AnalyticsEventProperties,
  type HookMetric
} from "@ai-dnd/contracts";

type TrackInput = {
  name: AnalyticsEventName;
  properties?: Omit<
    AnalyticsEventProperties,
    "app" | "distinctId" | "schemaVersion" | "source"
  >;
  milestones?: HookMetric[];
};

const analyticsGuestIdStorageKey = "ai-taverns.analytics.guestId";
const analyticsMetricsStoragePrefix = "ai-taverns.analytics.hookMetrics";
const analyticsAliasStoragePrefix = "ai-taverns.analytics.alias";
const analyticsCampaignSeenStoragePrefix = "ai-taverns.analytics.campaignSeen";
const analyticsCampaignReturnStoragePrefix =
  "ai-taverns.analytics.campaignReturn24h";
const oneDayMs = 24 * 60 * 60 * 1000;

let initialized = false;
let identifiedDistinctId = "";

function token() {
  return process.env.NEXT_PUBLIC_MIXPANEL_TOKEN?.trim();
}

function isEnabled() {
  return Boolean(token()) && typeof window !== "undefined";
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `guest-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export function analyticsGuestId() {
  if (typeof window === "undefined") {
    return "server-render";
  }

  const saved = window.localStorage.getItem(analyticsGuestIdStorageKey);

  if (saved) {
    return saved;
  }

  const nextId = createId();
  window.localStorage.setItem(analyticsGuestIdStorageKey, nextId);
  return nextId;
}

function distinctId() {
  return identifiedDistinctId || analyticsGuestId();
}

function metricStorageKey() {
  return metricStorageKeyForDistinctId(distinctId());
}

function metricStorageKeyForDistinctId(id: string) {
  return `${analyticsMetricsStoragePrefix}.${id}`;
}

function storedMetricsForKey(key: string) {
  if (typeof window === "undefined") {
    return new Set<HookMetric>();
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(key) ?? "[]"
    ) as HookMetric[];

    return new Set(parsed);
  } catch {
    return new Set<HookMetric>();
  }
}

function storedMetrics() {
  return storedMetricsForKey(metricStorageKey());
}

function persistMetrics(metrics: Set<HookMetric>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(metricStorageKey(), JSON.stringify([...metrics]));
}

function ensureInitialized() {
  if (initialized || !isEnabled()) {
    return;
  }

  mixpanel.init(token()!, {
    debug: process.env.NODE_ENV !== "production",
    persistence: "localStorage",
    ignore_dnt: false
  });
  initialized = true;
}

function mergeGuestMetricsIntoUser(input: { guestId?: string; userDistinctId: string }) {
  if (typeof window === "undefined" || !input.guestId) {
    return;
  }

  const guestKey = metricStorageKeyForDistinctId(input.guestId);
  const userKey = metricStorageKeyForDistinctId(input.userDistinctId);
  const merged = new Set([
    ...storedMetricsForKey(guestKey),
    ...storedMetricsForKey(userKey)
  ]);

  window.localStorage.setItem(userKey, JSON.stringify([...merged]));
}

export function identifyAnalyticsUser(input: {
  userId?: string;
  email?: string;
  guestId?: string;
}) {
  ensureInitialized();

  const nextDistinctId = input.userId ? `user:${input.userId}` : analyticsGuestId();
  mergeGuestMetricsIntoUser({
    guestId: input.guestId,
    userDistinctId: nextDistinctId
  });
  identifiedDistinctId = nextDistinctId;

  if (!isEnabled()) {
    return;
  }

  if (input.guestId && input.guestId !== nextDistinctId) {
    const aliasKey = `${analyticsAliasStoragePrefix}.${input.guestId}.${nextDistinctId}`;

    if (window.localStorage.getItem(aliasKey) !== "true") {
      mixpanel.alias(nextDistinctId, input.guestId);
      window.localStorage.setItem(aliasKey, "true");
    }
  }

  mixpanel.identify(nextDistinctId);
  mixpanel.people.set({
    ...(input.email ? { $email: input.email } : {}),
    app: "ai-taverns",
    schemaVersion: 1
  });
}

export function trackAnalytics(input: TrackInput) {
  const metrics = storedMetrics();
  const newMilestones = (input.milestones ?? []).filter(
    (metric) => !metrics.has(metric)
  );

  newMilestones.forEach((metric) => metrics.add(metric));
  persistMetrics(metrics);

  const hookSnapshot = hookSnapshotForMetrics(metrics);
  const event = AnalyticsEventSchema.parse({
    name: input.name,
    properties: {
      ...input.properties,
      app: "ai-taverns",
      distinctId: distinctId(),
      schemaVersion: 1,
      source: "web",
      hookScore: hookSnapshot.score,
      hookStage: hookSnapshot.stage,
      isHooked: hookSnapshot.isHooked,
      ...(newMilestones.length > 0
        ? {
            hookDeltas: hookSnapshot.deltas.filter((delta) =>
              newMilestones.includes(delta.metric)
            )
          }
        : {})
    }
  });

  if (!isEnabled()) {
    return event;
  }

  ensureInitialized();
  mixpanel.track(event.name, event.properties);

  if (newMilestones.length > 0) {
    mixpanel.people.set({
      hook_score: hookSnapshot.score,
      hook_stage: hookSnapshot.stage,
      is_hooked: hookSnapshot.isHooked
    });
    newMilestones.forEach((metric) => {
      mixpanel.people.set({ [`hook_${metric}`]: true });
      mixpanel.track("Hook Milestone Reached", {
        ...event.properties,
        hookMilestone: metric
      });
    });
  }

  return event;
}

export function trackCampaignReturn(input: {
  campaignId: string;
  campaignMode?: "single_player" | "multiplayer";
}) {
  if (typeof window === "undefined") {
    return;
  }

  const seenKey = `${analyticsCampaignSeenStoragePrefix}.${input.campaignId}`;
  const returnedKey = `${analyticsCampaignReturnStoragePrefix}.${input.campaignId}`;
  const firstSeen = Number(window.localStorage.getItem(seenKey) ?? "0");
  const now = Date.now();

  if (!firstSeen) {
    window.localStorage.setItem(seenKey, String(now));
    return;
  }

  trackAnalytics({
    name: "Session Resumed",
    properties: {
      campaignId: input.campaignId,
      campaignMode: input.campaignMode,
      hoursSinceFirstSeen: Math.floor((now - firstSeen) / (60 * 60 * 1000))
    }
  });

  if (
    now - firstSeen >= oneDayMs &&
    window.localStorage.getItem(returnedKey) !== "true"
  ) {
    window.localStorage.setItem(returnedKey, "true");
    trackAnalytics({
      name: "Campaign Returned After 24h",
      properties: {
        campaignId: input.campaignId,
        campaignMode: input.campaignMode
      },
      milestones: ["returned_after_24h"]
    });
  }
}
