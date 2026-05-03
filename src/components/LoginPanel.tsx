"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
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
  const [signingIn, setSigningIn] = useState(false);
  const [signInMode, setSignInMode] = useState<"secure" | "developer">("secure");
  const routeTimer = useRef<number | null>(null);

  useEffect(() => {
    document.body.classList.remove("is-authenticated");
    delete document.body.dataset.access;
    return () => {
      if (routeTimer.current) window.clearTimeout(routeTimer.current);
    };
  }, []);

  function completeSignIn(mode: "secure" | "developer") {
    if (signingIn) return;

    setSignInMode(mode);
    setSigningIn(true);
    startDevelopmentSession();
    routeTimer.current = window.setTimeout(() => {
      router.push("/home");
    }, 1650);
  }

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    completeSignIn("secure");
  }

  function quickSignIn() {
    completeSignIn("developer");
  }

  return (
    <div className={`login-card-shell ${signingIn ? "signing-in" : ""}`}>
      <form className="login-card" onSubmit={signIn}>
        <div>
          <span className="eyebrow">Secure access beta</span>
          <div className="login-title-row">
            <h1>Thor Operations Command</h1>
            <span>Build 0.116</span>
          </div>
          <p>Sign in to open Thor Operations Command.</p>
        </div>
        <label>
          <span>Email</span>
          <input type="email" placeholder="user@example.com" autoComplete="email" disabled={signingIn} />
        </label>
        <label>
          <span>Password</span>
          <input type="password" placeholder="Enter password" autoComplete="current-password" disabled={signingIn} />
        </label>
        <div className="login-actions">
          <button type="submit" disabled={signingIn}>Sign in</button>
          <button className="developer-button" type="button" onClick={quickSignIn} disabled={signingIn}>
            Developer quick sign in
          </button>
        </div>
        <small className="login-note">Developer use only while TOC is being built. Full authentication and permissions will be connected later.</small>
      </form>

      {signingIn ? (
        <div className="sign-in-sequence" role="status" aria-live="polite">
          <div className="sequence-core">
            <span className="sequence-ring" />
            <img src="/assets/thor-logo-stacked-sidebar.png" alt="" />
          </div>
          <div className="sequence-copy">
            <span>{signInMode === "developer" ? "Developer access" : "Secure access"}</span>
            <strong>Opening command session</strong>
            <small>Identity confirmed. Data loaded. TOC coming online.</small>
          </div>
          <div className="sequence-progress"><span /></div>
        </div>
      ) : null}
    </div>
  );
}
