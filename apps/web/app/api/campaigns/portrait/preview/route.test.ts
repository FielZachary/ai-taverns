import { afterEach, describe, expect, it, vi } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

import { POST } from "./route";

describe("campaign portrait preview API route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("proxies portrait previews to Fastify with cookies and JSON body", async () => {
    vi.stubEnv("FASTIFY_API_INTERNAL_ORIGIN", "https://api.internal/");
    cookiesMock.mockResolvedValue({
      getAll: () => [{ name: "sid", value: "session value" }]
    });
    const upstreamBody = {
      imageDataUrl: "data:image/png;base64,preview",
      contentType: "image/png"
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(upstreamBody));
    const body = JSON.stringify({
      characterName: "Mira Vale",
      imageModel: "openai"
    });

    const response = await POST(
      new Request("https://app.example/api/campaigns/portrait/preview", {
        method: "POST",
        body
      })
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.internal/api/campaigns/portrait/preview",
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
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(upstreamBody);
  });
});
