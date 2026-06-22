import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <p className="eyebrow">AI Taverns</p>
        <h1 id="login-title">Enter the tavern</h1>
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
