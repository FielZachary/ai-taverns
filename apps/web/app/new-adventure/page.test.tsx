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

    await expect(NewAdventurePage()).rejects.toMatchObject({
      destination: "/login?next=/new-adventure"
    });

    expect(redirectMock).toHaveBeenCalledWith("/login?next=/new-adventure");
  });

  it("renders the adventure form for authenticated users", async () => {
    getOptionalUserMock.mockResolvedValue({
      id: "user-1",
      email: "hero@example.com"
    });

    const result = await NewAdventurePage();

    expect(result).toMatchObject({
      type: newAdventureFormMock,
      props: {}
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
