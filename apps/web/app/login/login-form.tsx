"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";

type FormState = "idle" | "sending" | "sent" | "error";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");
  const nextPath = useMemo(() => {
    const next = searchParams.get("next");
    return next?.startsWith("/") ? next : "/play";
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setState("error");
      setMessage("Enter an email address.");
      return;
    }

    setState("sending");
    setMessage("");

    const startResponse = await fetch("/api/auth/passwordless/start", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email: trimmedEmail
      })
    });
    const startBody = (await startResponse.json()) as {
      loginToken?: string;
      error?: {
        message?: string;
      };
    };

    if (!startResponse.ok) {
      setState("error");
      setMessage(startBody.error?.message ?? "Could not start sign-in.");
      return;
    }

    if (startBody.loginToken) {
      const verifyResponse = await fetch("/api/auth/passwordless/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          token: startBody.loginToken
        })
      });
      const verifyBody = (await verifyResponse.json()) as {
        error?: {
          message?: string;
        };
      };

      if (!verifyResponse.ok) {
        setState("error");
        setMessage(verifyBody.error?.message ?? "Could not complete sign-in.");
        return;
      }

      window.location.assign(nextPath);
      return;
    }

    setState("sent");
    setMessage("Check your email for a sign-in link.");
  }

  async function handleGoogleSignIn() {
    setState("error");
    setMessage("Google sign-in will return after the owned auth migration.");
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <button
        className="google-auth-button"
        type="button"
        disabled={state === "sending"}
        onClick={() => void handleGoogleSignIn()}
      >
        <span aria-hidden="true">G</span>
        Enter with Google
      </button>
      <div className="auth-divider">
        <span>or</span>
      </div>
      <label htmlFor="email">Email</label>
      <div className="auth-input-row">
        <Mail size={18} aria-hidden="true" />
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending..." : "Send magic link"}
      </button>
      {message ? (
        <p className={state === "error" ? "auth-error" : "auth-note"}>{message}</p>
      ) : null}
    </form>
  );
}
