import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("passwordless auth confirmation route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("redirects missing tokens to the invalid-link login page", async () => {
    vi.stubEnv("AUTH_PUBLIC_APP_ORIGIN", "https://app.example");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await GET(
      new Request("https://app.example/auth/confirm?next=/play")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example/login?error=invalid-link"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies tokens upstream, forwards cookies, and preserves safe next paths", async () => {
    vi.stubEnv("AUTH_PUBLIC_APP_ORIGIN", "https://app.example/");
    vi.stubEnv("FASTIFY_API_INTERNAL_ORIGIN", "https://api.internal/");
    const upstream = Response.json({ ok: true });
    Object.defineProperty(upstream.headers, "getSetCookie", {
      value: () => ["sid=abc; Path=/; HttpOnly"]
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(upstream);

    const response = await GET(
      new Request(
        "https://app.example/auth/confirm?token=magic&next=/play?campaignId=1"
      )
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.internal/api/auth/passwordless/verify",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ token: "magic" }),
        cache: "no-store"
      }
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example/play?campaignId=1"
    );
    expect(response.headers.get("set-cookie")).toBe("sid=abc; Path=/; HttpOnly");
  });

  it("rejects failed verification and unsafe next URLs", async () => {
    vi.stubEnv("AUTH_PUBLIC_APP_ORIGIN", "https://app.example");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("invalid", { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));

    const invalidResponse = await GET(
      new Request("https://app.example/auth/confirm?token=bad&next=/play")
    );
    const safeFallbackResponse = await GET(
      new Request(
        "https://app.example/auth/confirm?token=good&next=//evil.example"
      )
    );

    expect(invalidResponse.headers.get("location")).toBe(
      "https://app.example/login?error=invalid-link"
    );
    expect(safeFallbackResponse.headers.get("location")).toBe(
      "https://app.example/play"
    );
  });
});
