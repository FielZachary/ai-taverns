import { Suspense } from "react";
import Image from "next/image";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-art-panel" aria-hidden="true">
        <Image
          className="auth-art-image"
          src="/auth/viking-warrior-auth.png"
          alt=""
          fill
          priority
          sizes="(max-width: 820px) 100vw, 50vw"
        />
      </section>

      <section className="auth-form-panel" aria-labelledby="login-title">
        <div className="auth-panel">
          <p className="eyebrow">AI Taverns</p>
          <h1 id="login-title">Enter the tavern</h1>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
