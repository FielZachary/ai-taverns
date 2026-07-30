import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("Google auth start route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("requests the Fastify Google start route, copies state cookies, and redirects", async () => {
    vi.stubEnv("FASTIFY_API_INTERNAL_ORIGIN", "https://api.internal/");
    const upstream = new Response(null, {
      status: 302,
      headers: {
        location: "https://accounts.google.com/o/oauth2/v2/auth?state=abc"
      }
    });
    Object.defineProperty(upstream.headers, "getSetCookie", {
      value: () => ["google_state=state; Path=/api/auth/google; HttpOnly"]
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(upstream);

    const response = await GET(
      new Request(
        "https://app.example/api/auth/google/start?nextPath=/new-adventure"
      )
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.internal/api/auth/google/start?nextPath=%2Fnew-adventure"),
      {
        redirect: "manual",
        cache: "no-store"
      }
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?state=abc"
    );
    expect(response.headers.get("set-cookie")).toBe(
      "google_state=state; Path=/api/auth/google; HttpOnly"
    );
  });
});
