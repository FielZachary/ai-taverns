import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mixpanel from "mixpanel";

import { createServerAnalytics } from "./analytics.js";
import { loadConfig } from "./config.js";

type MixpanelCallback = (error?: Error) => void;

const mockedMixpanel = mixpanel as unknown as {
  init: (token: string, options?: Record<string, unknown>) => unknown;
};
const originalInit = mockedMixpanel.init;

afterEach(() => {
  mockedMixpanel.init = originalInit;
});

test("server analytics no-ops when Mixpanel is disabled", () => {
  const analytics = createServerAnalytics({
    config: loadConfig({
      MIXPANEL_PROJECT_TOKEN: "token",
      MIXPANEL_ENABLED: "false"
    })
  });

  assert.equal(analytics.enabled, false);
  assert.doesNotThrow(() => {
    analytics.identify({
      distinctId: "user:1",
      properties: {
        email: "player@example.com"
      }
    });
    analytics.track({
      name: "Campaign Loaded",
      distinctId: "user:1",
      properties: {
        campaignId: "00000000-0000-4000-8000-000000000001"
      }
    });
  });
});

test("server analytics sends profile, event, and hook milestone updates", () => {
  const calls: Array<{
    type: string;
    distinctId?: string;
    name?: string;
    property?: string;
    value?: number;
    properties?: Record<string, unknown>;
  }> = [];

  mockedMixpanel.init = (projectToken, options) => {
    calls.push({
      type: "init",
      properties: {
        projectToken,
        debug: options?.debug
      }
    });

    return {
      track(
        name: string,
        properties: Record<string, unknown>,
        callback: MixpanelCallback
      ) {
        calls.push({ type: "track", name, properties });
        callback();
      },
      people: {
        set(
          distinctId: string,
          properties: Record<string, unknown>,
          callback: MixpanelCallback
        ) {
          calls.push({ type: "people.set", distinctId, properties });
          callback();
        },
        set_once(
          distinctId: string,
          properties: Record<string, unknown>,
          callback: MixpanelCallback
        ) {
          calls.push({ type: "people.set_once", distinctId, properties });
          callback();
        },
        increment(
          distinctId: string,
          property: string,
          value: number,
          callback: MixpanelCallback
        ) {
          calls.push({ type: "people.increment", distinctId, property, value });
          callback();
        }
      }
    };
  };

  const analytics = createServerAnalytics({
    config: loadConfig({
      MIXPANEL_PROJECT_TOKEN: "token",
      MIXPANEL_ENABLED: "true",
      MIXPANEL_DEBUG: "true"
    })
  });

  assert.equal(analytics.enabled, true);

  analytics.identify({
    distinctId: "user:1",
    properties: {
      $email: "player@example.com"
    },
    setOnce: {
      firstSeenAt: "2026-07-31T00:00:00.000Z"
    }
  });
  analytics.track({
    name: "Player Message Sent",
    distinctId: "user:1",
    properties: {
      userId: "1",
      playerMessageCount: 1
    },
    milestones: ["first_player_message", "asked_dm"]
  });

  assert.equal(calls[0]?.type, "init");
  assert.deepEqual(calls[0]?.properties, {
    projectToken: "token",
    debug: true
  });
  assert.equal(calls.some((call) => call.type === "people.set_once"), true);

  const eventCall = calls.find((call) => call.type === "track");
  assert.equal(eventCall?.name, "Player Message Sent");
  assert.equal(eventCall?.properties?.source, "api");
  assert.equal(eventCall?.properties?.distinctId, "user:1");
  assert.equal(eventCall?.properties?.distinct_id, "user:1");
  assert.deepEqual(eventCall?.properties?.hookDeltas, [
    {
      metric: "first_player_message",
      points: 15
    },
    {
      metric: "asked_dm",
      points: 5
    }
  ]);

  const milestoneEventCalls = calls.filter(
    (call) => call.type === "track" && call.name === "Hook Milestone Reached"
  );
  assert.deepEqual(
    milestoneEventCalls.map((call) => call.properties?.hookMilestone),
    ["first_player_message", "asked_dm"]
  );
  assert.deepEqual(
    milestoneEventCalls.map((call) => call.properties?.distinct_id),
    ["user:1", "user:1"]
  );

  const incrementCall = calls.find((call) => call.type === "people.increment");
  assert.equal(incrementCall?.property, "hook_score_lifetime");
  assert.equal(incrementCall?.value, 20);

  const milestoneProfile = calls.find(
    (call) =>
      call.type === "people.set" &&
      call.properties?.hook_first_player_message === true
  );
  assert.equal(milestoneProfile?.properties?.hook_asked_dm, true);
  assert.equal(milestoneProfile?.properties?.latest_hook_score_delta, 20);
});

test("server analytics sends plain events without milestone side effects", () => {
  const calls: Array<{
    type: string;
    name?: string;
    properties?: Record<string, unknown>;
  }> = [];

  mockedMixpanel.init = () => ({
    track(
      name: string,
      properties: Record<string, unknown>,
      callback: MixpanelCallback
    ) {
      calls.push({ type: "track", name, properties });
      callback();
    },
    people: {
      set(
        _distinctId: string,
        _properties: Record<string, unknown>,
        callback: MixpanelCallback
      ) {
        calls.push({ type: "people.set" });
        callback();
      },
      set_once(
        _distinctId: string,
        _properties: Record<string, unknown>,
        callback: MixpanelCallback
      ) {
        calls.push({ type: "people.set_once" });
        callback();
      },
      increment(
        _distinctId: string,
        _property: string,
        _value: number,
        callback: MixpanelCallback
      ) {
        calls.push({ type: "people.increment" });
        callback();
      }
    }
  });

  const analytics = createServerAnalytics({
    config: loadConfig({
      MIXPANEL_PROJECT_TOKEN: "token",
      MIXPANEL_ENABLED: "true"
    })
  });

  analytics.track({
    name: "Campaign Loaded",
    distinctId: "user:1",
    properties: {
      userId: "1",
      campaignId: "00000000-0000-4000-8000-000000000001"
    }
  });

  assert.deepEqual(
    calls.map((call) => call.type),
    ["track"]
  );
  assert.equal(calls[0]?.name, "Campaign Loaded");
  assert.equal(calls[0]?.properties?.distinctId, "user:1");
  assert.equal(calls[0]?.properties?.distinct_id, "user:1");
  assert.equal(calls[0]?.properties?.hookDeltas, undefined);
});

test("server analytics reports Mixpanel callback errors without throwing", () => {
  const warnings: unknown[] = [];

  mockedMixpanel.init = () => ({
    track(
      _name: string,
      _properties: Record<string, unknown>,
      callback: MixpanelCallback
    ) {
      callback(new Error("network down"));
    },
    people: {
      set(
        _distinctId: string,
        _properties: Record<string, unknown>,
        callback: MixpanelCallback
      ) {
        callback(new Error("profile down"));
      },
      set_once(
        _distinctId: string,
        _properties: Record<string, unknown>,
        callback: MixpanelCallback
      ) {
        callback(new Error("set once down"));
      },
      increment(
        _distinctId: string,
        _property: string,
        _value: number,
        callback: MixpanelCallback
      ) {
        callback(new Error("increment down"));
      }
    }
  });

  const analytics = createServerAnalytics({
    config: loadConfig({
      MIXPANEL_PROJECT_TOKEN: "token",
      MIXPANEL_ENABLED: "true"
    }),
    log: {
      warn(payload) {
        warnings.push(payload);
      }
    }
  });

  analytics.identify({
    distinctId: "user:1",
    properties: {},
    setOnce: {
      firstSeenAt: "2026-07-31T00:00:00.000Z"
    }
  });
  analytics.track({
    name: "Ask DM Submitted",
    distinctId: "user:1",
    milestones: ["asked_dm"]
  });

  assert.equal(warnings.length, 6);
});
