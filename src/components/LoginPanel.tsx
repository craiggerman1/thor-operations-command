"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect } from "react";
import { defaultSession } from "@/lib/access";

function startDevelopmentSession() {
  localStorage.setItem(
    "toc.session",
    JSON.stringify({
      role: defaultSession.role,
      label: defaultSession.label,
      scope: "National",
      createdAt: new Date().toISOString()
    })
  );
}

export function LoginPanel() {
  const router = useRouter();

  useEffect(() => {
    document.body.classList.remove("is-authenticated");
    delete document.body.dataset.access;
  }, []);

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startDevelopmentSession();
    router.push("/home");
  }

  function quickSignIn() {
    startDevelopmentSession();
    router.push("/home");
  }

  return (
    <form className="login-card" onSubmit={signIn}>
      <div>
        <span className="eyebrow">Secure access prototype</span>
        <div className="login-title-row">
          <h1>Thor Operations Command</h1>
          <span>Build 0.078</span>
        </div>
        <p>Sign in to open Thor Operations Command.</p>
      </div>
      <label>
        <span>Email</span>
        <input type="email" placeholder="user@example.com" autoComplete="email" />
      </label>
      <label>
        <span>Password</span>
        <input type="password" placeholder="Enter password" autoComplete="current-password" />
      </label>
      <div className="login-actions">
        <button type="submit">Sign in</button>
        <button className="developer-button" type="button" onClick={quickSignIn}>
          Developer quick sign in
        </button>
      </div>
      <small className="login-note">Developer use only while TOC is being built. Full authentication and permissions will be connected later.</small>
    </form>
  );
}
