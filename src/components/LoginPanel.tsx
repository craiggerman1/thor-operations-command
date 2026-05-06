"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function LoginPanel() {
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const routeTimer = useRef<number | null>(null);

  useEffect(() => {
    document.body.classList.remove("is-authenticated");
    delete document.body.dataset.access;
    return () => {
      if (routeTimer.current) window.clearTimeout(routeTimer.current);
    };
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (signingIn) return;

    setErrorMessage("");
    if (!email.trim() || !password) {
      setErrorMessage("Please enter your email address and password.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Secure login is not configured. Contact Admin.");
      return;
    }

    setSigningIn(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error || !data.session?.access_token) {
      setSigningIn(false);
      setErrorMessage(error?.message || "Sign in failed.");
      return;
    }

    const profileResponse = await fetch("/api/auth/profile", {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`
      },
      cache: "no-store"
    });
    const profilePayload = await profileResponse.json();

    if (!profileResponse.ok || !profilePayload.profile) {
      await supabase.auth.signOut();
      setSigningIn(false);
      setErrorMessage(profilePayload.error || "TOC user profile could not be loaded.");
      return;
    }

    localStorage.setItem(
      "toc.session",
      JSON.stringify({
        ...profilePayload.profile,
        authMode: "supabase",
        createdAt: new Date().toISOString()
      })
    );

    routeTimer.current = window.setTimeout(() => {
      router.push(profilePayload.profile.mustChangePassword ? "/account/password" : "/home");
    }, 1650);
  }

  return (
    <div className={`login-card-shell ${signingIn ? "signing-in" : ""}`}>
      <form className="login-card" onSubmit={signIn}>
        <div>
          <span className="eyebrow">Secure access beta</span>
          <div className="login-title-row">
            <h1>Thor Operations Command</h1>
            <span>Build 0.263</span>
          </div>
          <p>Sign in to open Thor Operations Command.</p>
        </div>
        <label>
          <span>Email</span>
          <input type="email" placeholder="user@example.com" autoComplete="email" disabled={signingIn} value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          <span>Password</span>
          <input type="password" placeholder="Enter password" autoComplete="current-password" disabled={signingIn} value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {errorMessage ? <small className="login-error">{errorMessage}</small> : null}
        <div className="login-actions">
          <button type="submit" disabled={signingIn}>Sign in</button>
        </div>
        <small className="login-note">Secure TOC access for authorised Thor users only.</small>
      </form>

      {signingIn ? (
        <div className="sign-in-sequence" role="status" aria-live="polite">
          <div className="sequence-core">
            <span className="sequence-ring" />
            <img src="/assets/thor-logo-stacked-sidebar.png" alt="" />
          </div>
          <div className="sequence-copy">
            <span>Secure access</span>
            <strong>Opening command session</strong>
            <small>Identity confirmed. Database loading. TOC is coming online.</small>
          </div>
          <div className="sequence-progress"><span /></div>
        </div>
      ) : null}
    </div>
  );
}
