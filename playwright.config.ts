import { defineConfig, devices } from "@playwright/test";

const appPort = Number(process.env.E2E_APP_PORT ?? 3100);
const hermesPort = Number(process.env.E2E_HERMES_PORT ?? 18642);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: `node tests/e2e/hermes-stub.mjs ${hermesPort}`,
      url: `http://127.0.0.1:${hermesPort}/health`,
      reuseExistingServer: !process.env.CI
    },
    {
      command: "npm run dev -w @ai-dnd/web -- --hostname 127.0.0.1",
      url: `http://127.0.0.1:${appPort}`,
      env: {
        E2E_TEST_AUTH_ENABLED: "true",
        HERMES_AGENT_URL: `http://127.0.0.1:${hermesPort}`,
        HERMES_AGENT_TOKEN: "e2e-hermes-token",
        PORT: String(appPort)
      },
      reuseExistingServer: !process.env.CI,
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
