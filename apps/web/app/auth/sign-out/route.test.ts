import { afterEach, describe, expect, it, vi } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

import { POST } from "./route";

describe("sign-out route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("forwards request cookies to Fastify and redirects to login", async () => {
    vi.stubEnv("FASTIFY_API_INTERNAL_ORIGIN", "https://api.internal/");
    cookiesMock.mockResolvedValue({
      getAll: () => [{ name: "sid", value: "session value" }]
    });
    const upstream = new Response(null);
    Object.defineProperty(upstream.headers, "getSetCookie", {
      value: () => ["sid=; Max-Age=0; Path=/"]
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(upstream);

    const response = await POST(new Request("https://app.example/play"));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.internal/api/auth/sign-out",
      {
        method: "POST",
        headers: { cookie: "sid=session%20value" },
        cache: "no-store"
      }
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example/login");
    expect(response.headers.get("set-cookie")).toBe("sid=; Max-Age=0; Path=/");
  });

  it("still calls Fastify without cookie headers when no request cookies exist", async () => {
    cookiesMock.mockResolvedValue({
      getAll: () => []
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null));

    const response = await POST(new Request("https://app.example/play"));

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/auth/sign-out",
      {
        method: "POST",
        headers: undefined,
        cache: "no-store"
      }
    );
    expect(response.headers.get("location")).toBe("https://app.example/login");
  });
});
