import { afterEach, describe, expect, it, vi } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));

import {
  copySetCookieHeaders,
  getFastifyApiBaseUrl,
  getPublicAppOrigin,
  getRequestCookieHeader,
  safeNextPath
} from "./fastify-api";

describe("fastify API helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("prefers the internal API origin and trims a trailing slash", () => {
    vi.stubEnv("FASTIFY_API_INTERNAL_ORIGIN", "https://api.internal/");
    vi.stubEnv("NEXT_PUBLIC_FASTIFY_API_ORIGIN", "https://api.public/");

    expect(getFastifyApiBaseUrl()).toBe("https://api.internal");
  });

  it("falls back to the public API origin and then localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_FASTIFY_API_ORIGIN", "https://api.public/");

    expect(getFastifyApiBaseUrl()).toBe("https://api.public");

    vi.unstubAllEnvs();

    expect(getFastifyApiBaseUrl()).toBe("http://localhost:4000");
  });

  it("uses the configured public app origin for redirects", () => {
    vi.stubEnv("AUTH_PUBLIC_APP_ORIGIN", "https://app.example/");
    vi.stubEnv("NEXT_PUBLIC_FASTIFY_API_ORIGIN", "https://api.example/");

    expect(getPublicAppOrigin()).toBe("https://app.example");
  });

  it("accepts only same-origin relative next paths", () => {
    expect(safeNextPath("/play?campaignId=abc")).toBe("/play?campaignId=abc");
    expect(safeNextPath("//evil.example/play")).toBe("/play");
    expect(safeNextPath("https://evil.example/play")).toBe("/play");
    expect(safeNextPath(null)).toBe("/play");
  });

  it("serializes request cookies for upstream Fastify calls", async () => {
    cookiesMock.mockResolvedValue({
      getAll: () => [
        { name: "session", value: "abc 123" },
        { name: "theme", value: "dark/mode" }
      ]
    });

    await expect(getRequestCookieHeader()).resolves.toBe(
      "session=abc%20123; theme=dark%2Fmode"
    );
  });

  it("copies multiple upstream set-cookie headers when available", () => {
    const source = new Response(null);
    const getSetCookie = vi.fn(() => ["sid=1; Path=/", "theme=dark; Path=/"]);
    Object.defineProperty(source.headers, "getSetCookie", {
      value: getSetCookie
    });
    const target = new Response(null);

    copySetCookieHeaders(source, target);

    expect(getSetCookie).toHaveBeenCalledOnce();
    expect(target.headers.get("set-cookie")).toContain("sid=1; Path=/");
    expect(target.headers.get("set-cookie")).toContain("theme=dark; Path=/");
  });

  it("copies a single comma-preserved set-cookie header fallback", () => {
    const source = new Response(null, {
      headers: {
        "set-cookie": "sid=1; Path=/"
      }
    });
    const target = new Response(null);

    copySetCookieHeaders(source, target);

    expect(target.headers.get("set-cookie")).toBe("sid=1; Path=/");
  });
});
