import { afterEach, describe, expect, it, vi } from "vitest";

const { getOptionalUserMock, onboardingFormMock, redirectMock } = vi.hoisted(
  () => ({
    getOptionalUserMock: vi.fn(),
    onboardingFormMock: vi.fn(),
    redirectMock: vi.fn((destination: string) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { destination });
    })
  })
);

vi.mock("@/lib/auth", () => ({
  getOptionalUser: getOptionalUserMock
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("./onboarding-form", () => ({
  OnboardingForm: onboardingFormMock
}));

import OnboardingPage from "./page";

describe("onboarding page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to login with onboarding as next", async () => {
    getOptionalUserMock.mockResolvedValue(null);

    await expect(
      OnboardingPage({ searchParams: Promise.resolve({}) })
    ).rejects.toMatchObject({
      destination: "/login?next=%2Fonboarding"
    });
  });

  it("preserves invite links through the login redirect", async () => {
    getOptionalUserMock.mockResolvedValue(null);

    await expect(
      OnboardingPage({
        searchParams: Promise.resolve({ invite: "invite-token" })
      })
    ).rejects.toMatchObject({
      destination: "/login?next=%2Fonboarding%3Finvite%3Dinvite-token"
    });
  });

  it("renders the same adventure form for authenticated users", async () => {
    getOptionalUserMock.mockResolvedValue({
      id: "user-1",
      email: "hero@example.com",
      onboardingCompletedAt: null
    });

    const result = await OnboardingPage({ searchParams: Promise.resolve({}) });

    expect(result).toMatchObject({
      type: onboardingFormMock,
      props: {
        initialInviteToken: undefined,
        userEmail: "hero@example.com",
        userId: "user-1"
      }
    });
  });

  it("redirects users who have completed onboarding to play", async () => {
    getOptionalUserMock.mockResolvedValue({
      id: "user-1",
      email: "hero@example.com",
      onboardingCompletedAt: "2026-09-16T00:00:00.000Z"
    });

    await expect(
      OnboardingPage({ searchParams: Promise.resolve({ invite: "invite-token" }) })
    ).rejects.toMatchObject({ destination: "/play" });
  });
});
