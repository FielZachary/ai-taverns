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

  it("tracks 24-hour and 7-day campaign returns as hook milestones", async () => {
    const { trackCampaignReturn } = await import("./analytics");

    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    trackCampaignReturn({
      campaignId: "00000000-0000-4000-8000-000000000001",
      campaignMode: "single_player"
    });

    expect(mixpanelMock.track).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-08-02T01:00:00.000Z"));
    trackCampaignReturn({
      campaignId: "00000000-0000-4000-8000-000000000001",
      campaignMode: "single_player"
    });

    expect(mixpanelMock.track).toHaveBeenCalledWith(
      "Session Resumed",
      expect.objectContaining({
        hoursSinceFirstSeen: 25,
        hoursSinceLastActivity: 25
      })
    );
    expect(mixpanelMock.track).toHaveBeenCalledWith(
      "Campaign Returned After 24h",
      expect.objectContaining({
        returnedAfterDays: 1
      })
    );
    expect(mixpanelMock.track).toHaveBeenCalledWith(
      "Hook Milestone Reached",
      expect.objectContaining({
        hookMilestone: "returned_after_24h"
      })
    );

    vi.setSystemTime(new Date("2026-08-08T01:00:00.000Z"));
    trackCampaignReturn({
      campaignId: "00000000-0000-4000-8000-000000000001",
      campaignMode: "single_player"
    });

    expect(mixpanelMock.track).toHaveBeenCalledWith(
      "Campaign Returned After 7d",
      expect.objectContaining({
        returnedAfterDays: 7
      })
    );
    expect(mixpanelMock.track).toHaveBeenCalledWith(
      "Hook Milestone Reached",
      expect.objectContaining({
        hookMilestone: "returned_after_7d"
      })
    );
  });
});
