import { afterEach, describe, expect, it, vi } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

import { GET } from "./route";

describe("Google auth callback route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("forwards callback query and cookies to Fastify, then copies the session cookie", async () => {
    vi.stubEnv("FASTIFY_API_INTERNAL_ORIGIN", "https://api.internal/");
    cookiesMock.mockResolvedValue({
      getAll: () => [{ name: "google_state", value: "state value" }]
    });
    const upstream = new Response(null, {
      status: 302,
      headers: {
        location: "https://app.example/play"
      }
    });
    Object.defineProperty(upstream.headers, "getSetCookie", {
      value: () => ["sid=abc; Path=/; HttpOnly"]
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(upstream);

    const response = await GET(
      new Request(
        "https://app.example/api/auth/google/callback?code=google-code&state=state"
      )
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://api.internal/api/auth/google/callback?code=google-code&state=state"
      ),
      {
        headers: {
          cookie: "google_state=state%20value"
        },
        redirect: "manual",
        cache: "no-store"
      }
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example/play");
    expect(response.headers.get("set-cookie")).toBe("sid=abc; Path=/; HttpOnly");
  });
});
