"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(
          nextPath
        )}`
      }
    });

    if (error) {
      setState("error");
      setMessage(error.message);
      return;
    }

    setState("sent");
    setMessage("Check your email for a sign-in link.");
  }

  async function handleGoogleSignIn() {
    setState("sending");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(
          nextPath
        )}`
      }
    });

    if (error) {
      setState("error");
      setMessage(error.message);
    }
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
