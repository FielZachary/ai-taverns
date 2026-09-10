import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mixpanelMock = vi.hoisted(() => ({
  alias: vi.fn(),
  identify: vi.fn(),
  init: vi.fn(),
  people: {
    set: vi.fn()
  },
  track: vi.fn()
}));

vi.mock("mixpanel-browser", () => ({
  default: mixpanelMock
}));

describe("client analytics retention tracking", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_MIXPANEL_TOKEN", "token");
    localStorage.clear();
    Object.values(mixpanelMock).forEach((value) => {
      if (typeof value === "function") {
        value.mockClear();
      }
    });
    mixpanelMock.people.set.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("tracks qualified returns only after a meaningful resumed play action", async () => {
    const { trackAnalytics, trackCampaignReturn } = await import("./analytics");
    const campaignId = "00000000-0000-4000-8000-000000000001";

    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    trackAnalytics({ name: "Character Created" });
    trackAnalytics({ name: "Campaign Created", properties: { campaignId } });
    trackAnalytics({
      name: "Player Message Sent",
      properties: { campaignId, playerMessageCount: 5, dmMessageCount: 5 }
    });
    trackCampaignReturn({
      campaignId,
      campaignMode: "single_player"
    });

    vi.setSystemTime(new Date("2026-08-02T01:00:00.000Z"));
    trackCampaignReturn({
      campaignId,
      campaignMode: "single_player"
    });
    trackAnalytics({
      name: "Player Message Sent",
      properties: { campaignId, playerMessageCount: 6, dmMessageCount: 6 }
    });

    expect(mixpanelMock.track).toHaveBeenCalledWith(
      "Session Resumed",
      expect.objectContaining({
        hoursSinceFirstSeen: 25,
        hoursSinceLastActivity: 25
      })
    );
    expect(mixpanelMock.track).toHaveBeenCalledWith(
      "Qualified Return",
      expect.objectContaining({
        campaignId,
        qualifiedReturnOrdinal: 1
      })
    );

    vi.setSystemTime(new Date("2026-08-08T01:00:00.000Z"));
    trackCampaignReturn({
      campaignId,
      campaignMode: "single_player"
    });
    trackAnalytics({
      name: "Player Message Sent",
      properties: { campaignId, playerMessageCount: 6, dmMessageCount: 6 }
    });
    expect(mixpanelMock.track).toHaveBeenCalledWith(
      "Lifecycle Stage Reached",
      expect.objectContaining({ lifecycleStage: "hooked" })
    );
  });

  it("aliases signed-in users to the browser analytics guest id", async () => {
    const analyticsGuestIdStorageKey = "ai-taverns.analytics.guestId";
    const analyticsLifecycleStoragePrefix = "ai-taverns.analytics.lifecycle";
    const browserGuestId = "browser-guest-id";
    const playerId = "player-client-id";
    const userDistinctId = "user:00000000-0000-4000-8000-000000000123";

    localStorage.setItem(analyticsGuestIdStorageKey, browserGuestId);
    localStorage.setItem(
      `${analyticsLifecycleStoragePrefix}.${browserGuestId}`,
      JSON.stringify({ characterCreated: true, campaignReady: true, qualifiedReturnDays: ["2026-08-02"] })
    );
    localStorage.setItem(
      `${analyticsLifecycleStoragePrefix}.${playerId}`,
      JSON.stringify({ meaningfulFirstSession: true, qualifiedReturnDays: ["2026-08-08"] })
    );

    const { identifyAnalyticsUser } = await import("./analytics");

    identifyAnalyticsUser({
      userId: "00000000-0000-4000-8000-000000000123",
      email: "player@example.com",
      guestId: playerId
    });

    expect(mixpanelMock.alias).toHaveBeenCalledWith(
      userDistinctId,
      browserGuestId
    );
    expect(mixpanelMock.alias).not.toHaveBeenCalledWith(
      userDistinctId,
      playerId
    );
    expect(
      JSON.parse(localStorage.getItem(`${analyticsLifecycleStoragePrefix}.${userDistinctId}`) ?? "{}")
    ).toEqual(expect.objectContaining({
      characterCreated: true,
      campaignReady: true,
      meaningfulFirstSession: true,
      qualifiedReturnDays: expect.arrayContaining(["2026-08-02", "2026-08-08"])
    }));
  });

  it("keeps first-touch UTMs through navigation and later identifies the user", async () => {
    window.history.replaceState(
      {},
      "",
      "/?utm_source=instagram&utm_medium=organic_social&utm_campaign=bio"
    );
    const { identifyAnalyticsUser, trackAnalytics, trackLandingPageView } = await import("./analytics");

    trackLandingPageView();
    window.history.replaceState({}, "", "/play");
    trackAnalytics({ name: "Onboarding Started" });
    window.history.replaceState(
      {},
      "",
      "/?utm_source=tiktok&utm_medium=organic_social&utm_campaign=bio"
    );
    trackLandingPageView();
    identifyAnalyticsUser({ userId: "00000000-0000-4000-8000-000000000123" });

    expect(mixpanelMock.track).toHaveBeenCalledWith(
      "Landing Page Viewed",
      expect.objectContaining({
        utm_source: "instagram",
        utm_medium: "organic_social",
        utm_campaign: "bio",
        initial_utm_source: "instagram",
        landing_path: "/"
      })
    );
    expect(mixpanelMock.track).toHaveBeenCalledWith(
      "Onboarding Started",
      expect.objectContaining({
        utm_source: "instagram",
        initial_utm_source: "instagram"
      })
    );
    expect(mixpanelMock.people.set).toHaveBeenCalledWith(
      expect.objectContaining({
        utm_source: "tiktok",
        initial_utm_source: "instagram"
      })
    );
    expect(mixpanelMock.people.set).toHaveBeenCalledWith(
      expect.objectContaining({ initial_utm_source: "instagram" })
    );
  });
});
