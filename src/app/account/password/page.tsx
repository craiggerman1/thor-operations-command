"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function PasswordResetPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  function cancelPasswordChange() {
    void getSupabaseBrowserClient()?.auth.signOut();
    localStorage.removeItem("toc.session");
    router.push("/");
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setStatus("");
    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("Secure login is not configured.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setSaving(false);
      setStatus(error.message);
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    const payload = await response.json();
    if (!response.ok) {
      setSaving(false);
      setStatus(payload.error || "Password changed, but TOC could not clear the reset flag.");
      return;
    }

    const storedSession = JSON.parse(localStorage.getItem("toc.session") || "null");
    const nextSession = { ...storedSession, mustChangePassword: false };
    localStorage.setItem("toc.session", JSON.stringify(nextSession));
    window.dispatchEvent(new CustomEvent("toc.sessionchange", { detail: nextSession }));
    router.push("/home");
  }

  return (
    <TocShell>
      <PageIntro title="Password Reset" detail="Set your secure TOC password before continuing." />
      <FlowHeading eyebrow="Account security" title="Create a new password to continue into TOC." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Secure login" title="Create new password" pill="Required">
          <form className="secure-password-form" onSubmit={submitPassword}>
            <div className="secure-password-brief">
              <strong>Password change required</strong>
              <small>Enter and confirm your new password, then press the button below to continue into TOC.</small>
            </div>
            <label>
              <span>New password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 characters" />
            </label>
            <label>
              <span>Confirm new password</span>
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Retype password" />
            </label>
            {status ? <small className="admin-hint-message">{status}</small> : null}
            <div className="secure-password-actions">
              <button type="submit" disabled={saving}>{saving ? "Updating password..." : "Update Password And Continue"}</button>
              <button className="secondary-button" type="button" onClick={cancelPasswordChange} disabled={saving}>Cancel And Sign Out</button>
            </div>
          </form>
        </Panel>
      </section>
    </TocShell>
  );
}
