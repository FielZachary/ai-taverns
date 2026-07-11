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

import PlayPage from "./page";

describe("play page auth gate", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to login with the play page as next", async () => {
    getOptionalUserMock.mockResolvedValue(null);

    await expect(
      PlayPage({ searchParams: Promise.resolve({}) })
    ).rejects.toMatchObject({
      destination: "/login?next=%2Fplay"
    });

    expect(redirectMock).toHaveBeenCalledWith("/login?next=%2Fplay");
  });

  it("preserves campaign IDs in the unauthenticated login next path", async () => {
    getOptionalUserMock.mockResolvedValue(null);

    await expect(
      PlayPage({
        searchParams: Promise.resolve({ campaignId: "campaign/with spaces" })
      })
    ).rejects.toMatchObject({
      destination:
        "/login?next=%2Fplay%3FcampaignId%3Dcampaign%252Fwith%2520spaces"
    });

    expect(redirectMock).toHaveBeenCalledWith(
      "/login?next=%2Fplay%3FcampaignId%3Dcampaign%252Fwith%2520spaces"
    );
  });

  it("renders the game shell for authenticated users", async () => {
    getOptionalUserMock.mockResolvedValue({
      id: "user-1",
      email: "hero@example.com"
    });

    const result = await PlayPage({
      searchParams: Promise.resolve({ campaignId: "campaign-1" })
    });

    expect(result).toMatchObject({
      type: gameShellMock,
      props: {
        initialCampaignId: "campaign-1",
        userEmail: "hero@example.com"
      }
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
