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
  const [localLoginUrl, setLocalLoginUrl] = useState("");
  const nextPath = useMemo(() => {
    const next = searchParams.get("next");
    return next?.startsWith("/") && !next.startsWith("//") ? next : "/play";
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
    setLocalLoginUrl("");

    const startResponse = await fetch("/api/auth/passwordless/start", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email: trimmedEmail,
        nextPath
      })
    });
    const startBody = (await startResponse.json()) as {
      loginUrl?: string;
      error?: {
        message?: string;
      };
    };

    if (!startResponse.ok) {
      setState("error");
      setMessage(startBody.error?.message ?? "Could not start sign-in.");
      return;
    }

    if (startBody.loginUrl) {
      setLocalLoginUrl(startBody.loginUrl);
      setState("sent");
      setMessage("Local sign-in link is ready.");
      return;
    }

    setState("sent");
    setMessage("Check your email for a sign-in link.");
  }

  const googleSignInHref = `/api/auth/google/start?nextPath=${encodeURIComponent(nextPath)}`;

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <a
        className="google-auth-button"
        href={googleSignInHref}
        aria-disabled={state === "sending"}
      >
        <span aria-hidden="true">G</span>
        Enter with Google
      </a>
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
      {localLoginUrl ? (
        <a className="auth-local-link" href={localLoginUrl}>
          Open local sign-in link
        </a>
      ) : null}
      {message ? (
        <p className={state === "error" ? "auth-error" : "auth-note"}>{message}</p>
      ) : null}
    </form>
  );
}
