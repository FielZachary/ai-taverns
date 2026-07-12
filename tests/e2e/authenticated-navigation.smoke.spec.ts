import { expect, test } from "@playwright/test";
import { signInWithPasswordlessToken } from "./support/passwordless-auth";

test.describe("authenticated navigation smoke", () => {
  test("new adventure is reachable with a local authenticated session", async ({
    page,
    request
  }) => {
    await signInWithPasswordlessToken(page, request, {
      email: "smoke@example.com",
      nextPath: "/new-adventure"
    });

    await page.goto("/new-adventure");

    await expect(page).toHaveURL(/\/new-adventure$/);
    await expect(
      page.getByRole("main", { name: "Create a new adventure" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /singleplayer/i })).toBeVisible();
  });
});
