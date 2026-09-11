"use client";

import mixpanel from "mixpanel-browser";
import {
  AnalyticsEventSchema,
  type AnalyticsEventName,
  type AnalyticsEventProperties,
  type HookStage
} from "@ai-dnd/contracts";

type TrackInput = {
  name: AnalyticsEventName;
  properties?: Omit<
    AnalyticsEventProperties,
    "app" | "distinctId" | "schemaVersion" | "source"
  >;
  /** @deprecated Legacy score inputs are ignored by the lifecycle model. */
  milestones?: string[];
};

const analyticsGuestIdStorageKey = "ai-taverns.analytics.guestId";
const analyticsAliasStoragePrefix = "ai-taverns.analytics.alias";
const analyticsLifecycleStoragePrefix = "ai-taverns.analytics.lifecycle";
const analyticsCampaignSeenStoragePrefix = "ai-taverns.analytics.campaignSeen";
const analyticsCampaignLastActivityStoragePrefix =
  "ai-taverns.analytics.campaignLastActivity";
const analyticsAttributionStorageKey = "ai-taverns.analytics.attribution.v1";
const oneDayMs = 24 * 60 * 60 * 1000;
const sevenDaysMs = 7 * oneDayMs;
const fourteenDaysMs = 14 * oneDayMs;

let initialized = false;
let identifiedDistinctId = "";

type AttributionValues = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  utm_id?: string;
  utm_source_platform?: string;
  utm_campaign_id?: string;
  utm_creative_format?: string;
  utm_marketing_tactic?: string;
  click_id?: string;
  landing_path: string;
  referrer_domain?: string;
  captured_at: string;
};

type AttributionState = {
  first: AttributionValues;
  last: AttributionValues;
};

const utmParameterNames = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "utm_source_platform",
  "utm_campaign_id",
  "utm_creative_format",
  "utm_marketing_tactic"
] as const;

const clickIdParameterNames = [
  "dclid",
  "fbclid",
  "gclid",
  "ko_click_id",
  "li_fat_id",
  "msclkid",
  "sccid",
  "ttclid",
  "twclid",
  "wbraid"
] as const;

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

function readAttribution(): AttributionState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(analyticsAttributionStorageKey) ?? "null"
    ) as AttributionState | null;
    if (!parsed?.first || !parsed?.last) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function referrerDomain() {
  if (typeof document === "undefined" || !document.referrer) return undefined;
  try {
    return new URL(document.referrer).hostname || undefined;
  } catch {
    return undefined;
  }
}

function currentAttribution(): AttributionValues | undefined {
  if (typeof window === "undefined") return undefined;

  const search = new URLSearchParams(window.location.search);
  const values: AttributionValues = {
    landing_path: window.location.pathname || "/",
    referrer_domain: referrerDomain(),
    captured_at: new Date().toISOString()
  };
  let hasAttribution = false;

  for (const parameter of utmParameterNames) {
    const value = search.get(parameter)?.trim();
    if (value) {
      values[parameter] = value;
      hasAttribution = true;
    }
  }

  for (const parameter of clickIdParameterNames) {
    const value = search.get(parameter)?.trim();
    if (value) {
      values.click_id = value;
      hasAttribution = true;
      break;
    }
  }

  return hasAttribution ? values : undefined;
}

function persistAttributionFromCurrentUrl() {
  const captured = currentAttribution();
  const existing = readAttribution();

  if (!captured || typeof window === "undefined") return existing;

  const next: AttributionState = {
    first: existing?.first ?? captured,
    last: captured
  };
  try {
    window.localStorage.setItem(analyticsAttributionStorageKey, JSON.stringify(next));
  } catch {
    // Analytics must never prevent a visit when storage is unavailable.
  }
  return next;
}

function attributionProperties() {
  const attribution = readAttribution();
  if (!attribution) return {};

  const { first, last } = attribution;
  const properties: Record<string, string> = {
    landing_path: last.landing_path,
    attribution_captured_at: last.captured_at,
    initial_landing_path: first.landing_path,
    initial_attribution_captured_at: first.captured_at
  };

  for (const parameter of utmParameterNames) {
    const currentValue = last[parameter];
    const firstValue = first[parameter];
    if (currentValue) properties[parameter] = currentValue;
    if (firstValue) properties[`initial_${parameter}`] = firstValue;
  }
  if (last.click_id) properties.click_id = last.click_id;
  if (first.click_id) properties.initial_click_id = first.click_id;
  if (last.referrer_domain) properties.referrer_domain = last.referrer_domain;
  if (first.referrer_domain) properties.initial_referrer_domain = first.referrer_domain;

  return properties;
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

type LifecycleState = {
  characterCreated: boolean;
  campaignReady: boolean;
  meaningfulFirstSession: boolean;
  firstMeaningfulPlayAt?: number;
  qualifiedReturnDays: string[];
  pendingReturn?: { campaignId: string; at: number };
  stage: HookStage;
};

function lifecycleStorageKey(id = distinctId()) {
  return `${analyticsLifecycleStoragePrefix}.${id}`;
}

function lifecycleState(): LifecycleState {
  const fallback: LifecycleState = {
    characterCreated: false,
    campaignReady: false,
    meaningfulFirstSession: false,
    qualifiedReturnDays: [],
    stage: "visitor"
  };
  if (typeof window === "undefined") return fallback;
  try {
    return { ...fallback, ...JSON.parse(window.localStorage.getItem(lifecycleStorageKey()) ?? "{}") };
  } catch {
    return fallback;
  }
}

function persistLifecycle(state: LifecycleState) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(lifecycleStorageKey(), JSON.stringify(state));
  }
}

function lifecycleScore(state: LifecycleState, now: number) {
  const returns = state.qualifiedReturnDays.length;
  const age = state.firstMeaningfulPlayAt ? now - state.firstMeaningfulPlayAt : 0;
  return Math.min(100,
    (state.campaignReady && state.characterCreated ? 10 : 0) +
    (returns >= 1 ? 15 : 0) +
    (returns >= 2 ? 20 : 0) +
    (age >= sevenDaysMs && returns >= 1 ? 30 : 0) +
    (age >= fourteenDaysMs && returns >= 1 ? 30 : 0) +
    Math.min(10, Math.max(0, returns - 2) * 5)
  );
}

function stageForLifecycle(state: LifecycleState, now: number): HookStage {
  const score = lifecycleScore(state, now);
  const firstMeaningfulPlayAt = state.firstMeaningfulPlayAt;
  const hasSevenDayReturn = Boolean(
    firstMeaningfulPlayAt &&
      state.qualifiedReturnDays.some((day) => Date.parse(day) - firstMeaningfulPlayAt >= sevenDaysMs)
  );
  if (score >= 70 && state.qualifiedReturnDays.length >= 2 && hasSevenDayReturn) return "hooked";
  if (state.meaningfulFirstSession) return "engaged";
  if (state.characterCreated && state.campaignReady) return "activated";
  return "visitor";
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
  // Use the same stable anonymous id for the landing event and the later
  // alias call, instead of letting the SDK create an unrelated device id.
  mixpanel.identify(distinctId());
  initialized = true;
}

/** Capture a tagged entrance before client navigation removes its query string. */
export function trackLandingPageView() {
  persistAttributionFromCurrentUrl();
  return trackAnalytics({
    name: "Landing Page Viewed",
    properties: {
      ...(typeof window === "undefined"
        ? {}
        : { landing_path: window.location.pathname || "/" })
    }
  });
}

function mergeGuestLifecycleIntoUser(input: {
  guestIds: string[];
  userDistinctId: string;
}) {
  if (typeof window === "undefined" || input.guestIds.length === 0) {
    return;
  }

  const candidates = input.guestIds.map((guestId) => {
    try { return JSON.parse(window.localStorage.getItem(lifecycleStorageKey(guestId)) ?? "{}") as Partial<LifecycleState>; } catch { return {}; }
  });
  const current = lifecycleState();
  const merged = candidates.reduce<LifecycleState>((state, candidate) => ({
    ...state,
    characterCreated: state.characterCreated || Boolean(candidate.characterCreated),
    campaignReady: state.campaignReady || Boolean(candidate.campaignReady),
    meaningfulFirstSession: state.meaningfulFirstSession || Boolean(candidate.meaningfulFirstSession),
    firstMeaningfulPlayAt: [state.firstMeaningfulPlayAt, candidate.firstMeaningfulPlayAt].filter((value): value is number => typeof value === "number").sort((a, b) => a - b)[0],
    qualifiedReturnDays: [...new Set([...state.qualifiedReturnDays, ...(candidate.qualifiedReturnDays ?? [])])]
  }), current);
  window.localStorage.setItem(lifecycleStorageKey(input.userDistinctId), JSON.stringify(merged));
}

export function identifyAnalyticsUser(input: {
  userId?: string;
  email?: string;
  guestId?: string;
}) {
  ensureInitialized();

  const anonymousDistinctId = analyticsGuestId();
  const nextDistinctId = input.userId ? `user:${input.userId}` : anonymousDistinctId;
  const metricGuestIds = [
    ...new Set([anonymousDistinctId, input.guestId].filter(Boolean) as string[])
  ].filter((guestId) => guestId !== nextDistinctId);

  mergeGuestLifecycleIntoUser({
    guestIds: metricGuestIds,
    userDistinctId: nextDistinctId
  });
  identifiedDistinctId = nextDistinctId;

  if (!isEnabled()) {
    return;
  }

  if (input.userId && anonymousDistinctId !== nextDistinctId) {
    const aliasKey = `${analyticsAliasStoragePrefix}.${anonymousDistinctId}.${nextDistinctId}`;

    if (window.localStorage.getItem(aliasKey) !== "true") {
      mixpanel.alias(nextDistinctId, anonymousDistinctId);
      window.localStorage.setItem(aliasKey, "true");
    }
  }

  mixpanel.identify(nextDistinctId);
  mixpanel.people.set({
    ...(input.email ? { $email: input.email } : {}),
    app: "ai-taverns",
    schemaVersion: 1,
    ...attributionProperties()
  });
}

export function trackAnalytics(input: TrackInput) {
  const now = Date.now();
  const lifecycle = lifecycleState();
  if (input.name === "Character Created") lifecycle.characterCreated = true;
  if (input.name === "Campaign Created" || input.name === "Campaign Joined") lifecycle.campaignReady = true;
  if (
    input.name === "Player Message Sent" &&
    Number(input.properties?.playerMessageCount ?? 0) >= 5 &&
    Number(input.properties?.dmMessageCount ?? 0) >= 5
  ) {
    lifecycle.meaningfulFirstSession = true;
    lifecycle.firstMeaningfulPlayAt ??= now;
  }

  let qualifiedReturn: { campaignId: string; ordinal: number } | undefined;
  if (input.name === "Player Message Sent" && lifecycle.pendingReturn && lifecycle.firstMeaningfulPlayAt) {
    const day = new Date(now).toISOString().slice(0, 10);
    if (!lifecycle.qualifiedReturnDays.includes(day)) {
      lifecycle.qualifiedReturnDays.push(day);
      qualifiedReturn = { campaignId: lifecycle.pendingReturn.campaignId, ordinal: lifecycle.qualifiedReturnDays.length };
    }
    lifecycle.pendingReturn = undefined;
  }

  const previousStage = lifecycle.stage;
  lifecycle.stage = stageForLifecycle(lifecycle, now);
  const score = lifecycleScore(lifecycle, now);
  const hasQualifiedReturn7d = Boolean(lifecycle.firstMeaningfulPlayAt && lifecycle.qualifiedReturnDays.some(
    (day) => Date.parse(day) - lifecycle.firstMeaningfulPlayAt! >= sevenDaysMs
  ));
  persistLifecycle(lifecycle);
  const event = AnalyticsEventSchema.parse({
    name: input.name,
    properties: {
      ...attributionProperties(),
      ...input.properties,
      app: "ai-taverns",
      distinctId: distinctId(),
      distinct_id: distinctId(),
      schemaVersion: 1,
      source: "web",
      lifecycleScore: score,
      lifecycleStage: lifecycle.stage,
      qualifiedReturnDays: lifecycle.qualifiedReturnDays.length,
      hasQualifiedReturn7d
    }
  });

  if (!isEnabled()) {
    return event;
  }

  ensureInitialized();
  mixpanel.track(event.name, event.properties);

  if (qualifiedReturn) {
    mixpanel.track("Qualified Return", {
      ...event.properties,
      campaignId: qualifiedReturn.campaignId,
      qualifiedReturnOrdinal: qualifiedReturn.ordinal
    });
  }

  if (previousStage !== lifecycle.stage) {
    mixpanel.people.set({
      lifecycle_score: score,
      lifecycle_stage: lifecycle.stage,
      qualified_return_days: lifecycle.qualifiedReturnDays.length,
      has_qualified_return_7d: hasQualifiedReturn7d,
      lifecycle_stage_updated_at: new Date(now).toISOString()
    });
    mixpanel.track("Lifecycle Stage Reached", {
      ...event.properties,
      lifecyclePreviousStage: previousStage,
      lifecycleReason: lifecycle.stage === "hooked" ? "retention_gate" : lifecycle.stage === "engaged" ? "meaningful_first_session" : "campaign_ready"
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
  const lastActivityKey = `${analyticsCampaignLastActivityStoragePrefix}.${input.campaignId}`;
  const firstSeen = Number(window.localStorage.getItem(seenKey) ?? "0");
  const lastActivity = Number(
    window.localStorage.getItem(lastActivityKey) ?? "0"
  );
  const now = Date.now();

  if (!firstSeen) {
    window.localStorage.setItem(seenKey, String(now));
    window.localStorage.setItem(lastActivityKey, String(now));
    return;
  }

  const hoursSinceFirstSeen = Math.floor((now - firstSeen) / (60 * 60 * 1000));
  const hoursSinceLastActivity = lastActivity
    ? Math.floor((now - lastActivity) / (60 * 60 * 1000))
    : hoursSinceFirstSeen;

  trackAnalytics({
    name: "Session Resumed",
    properties: {
      campaignId: input.campaignId,
      campaignMode: input.campaignMode,
      hoursSinceFirstSeen,
      hoursSinceLastActivity
    }
  });

  const lifecycle = lifecycleState();
  if (lifecycle.firstMeaningfulPlayAt && now - lifecycle.firstMeaningfulPlayAt >= oneDayMs) {
    lifecycle.pendingReturn = { campaignId: input.campaignId, at: now };
    persistLifecycle(lifecycle);
  }

  window.localStorage.setItem(lastActivityKey, String(now));
}
