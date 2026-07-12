import { expect, test } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const authCookieName = "ai_taverns_playwright_user";

test.describe("authenticated navigation smoke", () => {
  test.beforeEach(async ({ context }) => {
    const url = new URL(baseURL);

    await context.addCookies([
      {
        name: authCookieName,
        value: "smoke@example.com",
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: url.protocol === "https:",
        sameSite: "Lax"
      }
    ]);
  });

  test("new adventure is reachable with a local authenticated session", async ({
    page
  }) => {
    await page.goto("/new-adventure");

    await expect(page).toHaveURL(/\/new-adventure$/);
    await expect(
      page.getByRole("main", { name: "Create a new adventure" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /singleplayer/i })).toBeVisible();
  });
});
