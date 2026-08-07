import { afterEach, describe, expect, it, vi } from "vitest";

const { gameShellMock, getOptionalUserMock, redirectMock } = vi.hoisted(() => ({
  gameShellMock: vi.fn(),
  getOptionalUserMock: vi.fn(),
  redirectMock: vi.fn((destination: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destination });
  })
}));

vi.mock("@/components/playing/GameShell", () => ({
  GameShell: gameShellMock
}));

vi.mock("@/lib/auth", () => ({
  getOptionalUser: getOptionalUserMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

import DebugPage from "./page";

describe("debug page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes pasted campaignId query strings in the login next path", async () => {
    getOptionalUserMock.mockResolvedValue(null);

    await expect(
      DebugPage({
        searchParams: Promise.resolve({
          campaignId: "campaignId=521efdba-6c9b-4b4e-a24b-5020806d169d"
        })
      })
    ).rejects.toMatchObject({
      destination:
        "/login?next=%2Fdebug%3FcampaignId%3D521efdba-6c9b-4b4e-a24b-5020806d169d"
    });

    expect(redirectMock).toHaveBeenCalledWith(
      "/login?next=%2Fdebug%3FcampaignId%3D521efdba-6c9b-4b4e-a24b-5020806d169d"
    );
  });

  it("renders debug mode with a normalized campaignId from a pasted URL", async () => {
    getOptionalUserMock.mockResolvedValue({
      id: "user-1",
      email: "hero@example.com"
    });

    const result = await DebugPage({
      searchParams: Promise.resolve({
        campaignId:
          "https://app.example/debug?campaignId=521efdba-6c9b-4b4e-a24b-5020806d169d",
        sourceCampaignId: "source-campaign-1"
      })
    });

    expect(result).toMatchObject({
      type: gameShellMock,
      props: {
        allowUnlistedInitialCampaign: true,
        includeAllMessages: true,
        initialCampaignId: "521efdba-6c9b-4b4e-a24b-5020806d169d",
        routePath: "/debug",
        userEmail: "hero@example.com",
        userId: "user-1"
      }
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
