import { expect, test } from "@playwright/test";

test.describe("unauthenticated navigation smoke", () => {
  test("landing page loads", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: /a fantasy tavern where every rumor becomes a campaign/i
      })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "AI Taverns" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Play online free" })).toHaveAttribute(
      "href",
      "/play"
    );
  });

  test("play redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/play");

    await expect(page).toHaveURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/play");
  });

  test("new adventure redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/new-adventure");

    await expect(page).toHaveURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/new-adventure");
  });
});
