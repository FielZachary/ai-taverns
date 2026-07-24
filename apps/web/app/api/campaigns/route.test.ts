import { afterEach, describe, expect, it, vi } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

import { GET, POST } from "./route";

describe("campaign API route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("proxies campaign creation to Fastify with cookies and JSON body", async () => {
    vi.stubEnv("FASTIFY_API_INTERNAL_ORIGIN", "https://api.internal/");
    cookiesMock.mockResolvedValue({
      getAll: () => [{ name: "sid", value: "session value" }]
    });
    const upstreamBody = {
      campaign: {
        id: "campaign-1",
        hermesSessionId: "ai-dnd-1",
        mode: "single_player",
        title: "Debug Hero",
        preview: "Eldermere",
        messageCount: 0
      }
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(upstreamBody, { status: 201 }));
    const body = JSON.stringify({
      mode: "single_player",
      campaignGenrePresetId: "eldermere"
    });

    const response = await POST(
      new Request("https://app.example/api/campaigns", {
        method: "POST",
        body
      })
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.internal/api/campaigns",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "sid=session%20value"
        },
        body,
        cache: "no-store"
      }
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(upstreamBody);
  });

  it("proxies campaign list requests without a cookie header when empty", async () => {
    cookiesMock.mockResolvedValue({
      getAll: () => []
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ campaigns: [] }));

    const response = await GET();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/campaigns",
      {
        headers: undefined,
        cache: "no-store"
      }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ campaigns: [] });
  });
});
