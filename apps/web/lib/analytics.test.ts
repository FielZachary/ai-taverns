import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mixpanelMock = vi.hoisted(() => ({
  alias: vi.fn(),
  identify: vi.fn(),
  init: vi.fn(),
  people: {
    set: vi.fn(),
    set_once: vi.fn()
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
    mixpanelMock.people.set_once.mockClear();
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

  it("keeps the first ad touch while updating the most recent touch", async () => {
    window.history.replaceState({}, "", "/?utm_source=tiktok&utm_medium=paid_social&utm_campaign=launch&ttclid=first-click");
    const { trackLandingPageView, trackAnalytics } = await import("./analytics");

    trackLandingPageView();
    window.history.replaceState({}, "", "/?utm_source=reddit&utm_medium=paid_social&utm_campaign=retargeting");
    trackLandingPageView();
    trackAnalytics({ name: "Onboarding Started" });

    expect(mixpanelMock.track).toHaveBeenCalledWith(
      "Onboarding Started",
      expect.objectContaining({
        utm_source: "reddit",
        utm_campaign: "retargeting",
        initial_utm_source: "tiktok",
        initial_utm_campaign: "launch",
        initial_marketing_click_id: "first-click",
        initial_marketing_click_id_type: "ttclid"
      })
    );
  });

  it("sets first-touch acquisition data on the identified profile", async () => {
    window.history.replaceState({}, "", "/?utm_source=instagram&utm_medium=paid_social");
    const { identifyAnalyticsUser, trackLandingPageView } = await import("./analytics");

    trackLandingPageView();
    identifyAnalyticsUser({ userId: "00000000-0000-4000-8000-000000000321" });

    expect(mixpanelMock.people.set_once).toHaveBeenCalledWith(
      expect.objectContaining({ initial_utm_source: "instagram" })
    );
  });
});
