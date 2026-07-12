import { expect, type APIRequestContext, type Page } from "@playwright/test";

const apiBaseURL =
  process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:4000";
const webBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export async function signInWithPasswordlessToken(
  page: Page,
  request: APIRequestContext,
  input: {
    email: string;
    nextPath: string;
  }
) {
  const startResponse = await request.post(
    `${apiBaseURL}/api/auth/passwordless/start`,
    {
      data: {
        email: input.email,
        nextPath: input.nextPath
      }
    }
  );

  expect(startResponse.ok()).toBe(true);

  const startBody = (await startResponse.json()) as {
    loginToken?: string;
  };

  expect(startBody.loginToken).toBeTruthy();

  const confirmUrl = new URL("/auth/confirm", webBaseURL);
  confirmUrl.searchParams.set("token", startBody.loginToken!);
  confirmUrl.searchParams.set("next", input.nextPath);

  await page.goto(confirmUrl.toString());
  await expect(page).toHaveURL(new RegExp(`${input.nextPath.replace("/", "\\/")}$`));
}
