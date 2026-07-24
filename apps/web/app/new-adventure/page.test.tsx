import { afterEach, describe, expect, it, vi } from "vitest";

const { getOptionalUserMock, newAdventureFormMock, redirectMock } = vi.hoisted(
  () => ({
    getOptionalUserMock: vi.fn(),
    newAdventureFormMock: vi.fn(),
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

vi.mock("./new-adventure-form", () => ({
  NewAdventureForm: newAdventureFormMock
}));

import NewAdventurePage from "./page";

describe("new adventure page auth gate", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to login with new adventure as next", async () => {
    getOptionalUserMock.mockResolvedValue(null);

    await expect(
      NewAdventurePage({ searchParams: Promise.resolve({}) })
    ).rejects.toMatchObject({
      destination: "/login?next=%2Fnew-adventure"
    });

    expect(redirectMock).toHaveBeenCalledWith("/login?next=%2Fnew-adventure");
  });

  it("preserves invite links through the login redirect", async () => {
    getOptionalUserMock.mockResolvedValue(null);

    await expect(
      NewAdventurePage({
        searchParams: Promise.resolve({ invite: "invite-token" })
      })
    ).rejects.toMatchObject({
      destination: "/login?next=%2Fnew-adventure%3Finvite%3Dinvite-token"
    });
  });

  it("renders the adventure form for authenticated users", async () => {
    getOptionalUserMock.mockResolvedValue({
      id: "user-1",
      email: "hero@example.com"
    });

    const result = await NewAdventurePage({ searchParams: Promise.resolve({}) });

    expect(result).toMatchObject({
      type: newAdventureFormMock,
      props: {
        initialInviteToken: undefined
      }
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("passes invite tokens to the adventure form for authenticated users", async () => {
    getOptionalUserMock.mockResolvedValue({
      id: "user-1",
      email: "hero@example.com"
    });

    const result = await NewAdventurePage({
      searchParams: Promise.resolve({ invite: "invite-token" })
    });

    expect(result).toMatchObject({
      type: newAdventureFormMock,
      props: {
        initialInviteToken: "invite-token"
      }
    });
  });
});
