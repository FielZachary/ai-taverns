import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const apiBaseURL =
  process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:4000";
const playwrightDatabaseURL =
  process.env.PLAYWRIGHT_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/ai_taverns_playwright";
const webPort = new URL(baseURL).port || "3000";
const apiPort = new URL(apiBaseURL).port || "4000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : "list",
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: [
        `env PLAYWRIGHT_DATABASE_URL=${playwrightDatabaseURL} DATABASE_SSL_DISABLED=true npm run test:e2e:db:reset`,
        [
          `env DATABASE_URL=${playwrightDatabaseURL}`,
          "DATABASE_SSL_DISABLED=true",
          "AUTH_EXPOSE_LOCAL_LOGIN_TOKENS=true",
          `AUTH_PUBLIC_APP_ORIGIN=${baseURL}`,
          `WEB_ORIGINS=${baseURL}`,
          `PORT=${apiPort}`,
          "npm run dev -w @ai-dnd/api"
        ].join(" ")
      ].join(" && "),
      url: `${apiBaseURL}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000
    },
    {
      command: [
        `env FASTIFY_API_INTERNAL_ORIGIN=${apiBaseURL}`,
        `NEXT_PUBLIC_FASTIFY_API_ORIGIN=${apiBaseURL}`,
        `AUTH_PUBLIC_APP_ORIGIN=${baseURL}`,
        `PORT=${webPort}`,
        "npm run dev -w @ai-dnd/web"
      ].join(" "),
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
