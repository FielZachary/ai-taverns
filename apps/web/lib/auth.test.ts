import { afterEach, describe, expect, it, vi } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

import { getOptionalUser } from "./auth";

describe("getOptionalUser", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns the authenticated user from the Fastify session endpoint", async () => {
    vi.stubEnv("FASTIFY_API_INTERNAL_ORIGIN", "https://api.internal/");
    cookiesMock.mockResolvedValue({
      getAll: () => [{ name: "sid", value: "session value" }]
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        Response.json({
          authenticated: true,
          user: { id: "user-1", email: "hero@example.com" }
        })
      );

    await expect(getOptionalUser()).resolves.toEqual({
      id: "user-1",
      email: "hero@example.com"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.internal/api/auth/me",
      {
        headers: { cookie: "sid=session%20value" },
        cache: "no-store"
      }
    );
  });

  it("returns a Playwright-only user when the local auth bypass is explicitly enabled", async () => {
    vi.stubEnv("PLAYWRIGHT_AUTH_BYPASS", "true");
    cookiesMock.mockResolvedValue({
      getAll: () => [
        { name: "ai_taverns_playwright_user", value: "smoke@example.com" }
      ]
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(getOptionalUser()).resolves.toEqual({
      id: "playwright-user",
      email: "smoke@example.com"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not honor the Playwright auth bypass in production", async () => {
    vi.stubEnv("PLAYWRIGHT_AUTH_BYPASS", "true");
    vi.stubEnv("NODE_ENV", "production");
    cookiesMock.mockResolvedValue({
      getAll: () => [
        { name: "ai_taverns_playwright_user", value: "smoke@example.com" }
      ]
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        authenticated: false,
        user: null
      })
    );

    await expect(getOptionalUser()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/auth/me", {
      headers: { cookie: "ai_taverns_playwright_user=smoke%40example.com" },
      cache: "no-store"
    });
  });

  it("omits the cookie header when the request has no cookies", async () => {
    cookiesMock.mockResolvedValue({
      getAll: () => []
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        authenticated: false,
        user: null
      })
    );

    await expect(getOptionalUser()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/auth/me", {
      headers: undefined,
      cache: "no-store"
    });
  });

  it("returns null for upstream errors, failed responses, and guest sessions", async () => {
    cookiesMock.mockResolvedValue({
      getAll: () => []
    });

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    await expect(getOptionalUser()).resolves.toBeNull();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("nope", { status: 401 })
    );
    await expect(getOptionalUser()).resolves.toBeNull();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        authenticated: false,
        user: null
      })
    );
    await expect(getOptionalUser()).resolves.toBeNull();
  });
});
