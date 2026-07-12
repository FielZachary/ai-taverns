import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const { searchParamsMock } = vi.hoisted(() => ({
  searchParamsMock: vi.fn<() => URLSearchParams>()
}));

vi.mock("next/navigation", () => ({
  useSearchParams: searchParamsMock
}));

function mockStartResponse(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(body)
  });
}

function renderLoginForm(next = "/play") {
  searchParamsMock.mockReturnValue(new URLSearchParams({ next }));
  render(<LoginForm />);
}

function submitEmail(value: string) {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value }
  });
  fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates empty email before starting passwordless login", () => {
    renderLoginForm();

    submitEmail("   ");

    expect(screen.getByText("Enter an email address.")).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("submits trimmed email and a safe next path from query params", async () => {
    globalThis.fetch = mockStartResponse({});
    renderLoginForm("/rooms/room-1?tab=chat");

    submitEmail("  hero@example.com  ");

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/auth/passwordless/start",
        expect.objectContaining({
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            email: "hero@example.com",
            nextPath: "/rooms/room-1?tab=chat"
          })
        })
      );
    });
    expect(screen.getByText("Check your email for a sign-in link.")).toBeInTheDocument();
  });

  it("falls back to the play page for unsafe next query params", async () => {
    globalThis.fetch = mockStartResponse({});
    renderLoginForm("//evil.example/steal");

    submitEmail("hero@example.com");

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/auth/passwordless/start",
        expect.objectContaining({
          body: JSON.stringify({
            email: "hero@example.com",
            nextPath: "/play"
          })
        })
      );
    });
  });

  it("renders the local sign-in link when the API returns one", async () => {
    globalThis.fetch = mockStartResponse({
      loginUrl: "/auth/confirm?token=local-token"
    });
    renderLoginForm();

    submitEmail("local@example.com");

    const link = await screen.findByRole("link", {
      name: /open local sign-in link/i
    });
    expect(link).toHaveAttribute("href", "/auth/confirm?token=local-token");
    expect(screen.getByText("Local sign-in link is ready.")).toBeInTheDocument();
  });

  it("shows the fallback message when upstream login start fails without detail", async () => {
    globalThis.fetch = mockStartResponse({}, false);
    renderLoginForm();

    submitEmail("hero@example.com");

    expect(await screen.findByText("Could not start sign-in.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open local sign-in link/i }))
      .not.toBeInTheDocument();
  });

  it("shows the Google sign-in placeholder error", () => {
    renderLoginForm();

    fireEvent.click(screen.getByRole("button", { name: /enter with google/i }));

    expect(
      screen.getByText("Google sign-in will return after the owned auth migration.")
    ).toBeInTheDocument();
  });
});
