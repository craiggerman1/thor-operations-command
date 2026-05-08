"use client";

import type { Status } from "@/lib/toc-data";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { tocFetch } from "@/lib/toc-client-auth";

export function Panel({ children, wide = false, title, eyebrow, pill, className = "" }: { children: ReactNode; wide?: boolean; title: string; eyebrow: string; pill?: string; className?: string }) {
  return (
    <section className={`panel ${wide ? "wide-panel" : ""} ${className}`}>
      <div className="panel-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {pill ? <span className="pill">{pill}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function Tag({ children, tone = "blue" }: { children: ReactNode; tone?: Status | "blue" }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

const hintDismissedKey = "toc.dismissedPageHints";
const hintVersionKey = "toc.pageHintVersion";
const hintEnabledKey = "toc.pageHintsEnabled";
const defaultHintVersion = "0.062";
const pageHintsApi = "/api/page-hints";

function getHintVersion() {
  if (typeof window === "undefined") return defaultHintVersion;
  return localStorage.getItem(hintVersionKey) || defaultHintVersion;
}

function getDismissedHints() {
  if (typeof window === "undefined") return {} as Record<string, boolean>;

  try {
    return JSON.parse(localStorage.getItem(hintDismissedKey) || "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function getHintKey(id: string) {
  return `${getHintVersion()}:${id}`;
}

function pageHintsAreEnabled() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(hintEnabledKey) !== "false";
}

function applyRemoteHintState(state: { enabled?: boolean; version?: string }) {
  localStorage.setItem(hintEnabledKey, state.enabled === false ? "false" : "true");
  if (state.version) localStorage.setItem(hintVersionKey, state.version);
}

async function fetchRemoteHintState() {
  const response = await tocFetch(pageHintsApi, { cache: "no-store" });
  if (!response.ok) throw new Error("Page hint database read failed.");
  return await response.json() as { enabled?: boolean; version?: string };
}

async function saveRemoteHintState(enabled: boolean, version: string) {
  const response = await tocFetch(pageHintsApi, {
    method: "POST",
    body: JSON.stringify({ enabled, version })
  }, true);
  if (!response.ok) throw new Error("Page hint database update failed.");
  return await response.json() as { enabled?: boolean; version?: string };
}

export function FlowHeading({ eyebrow, title, id }: { step?: string; eyebrow: string; title: string; id?: string }) {
  const hintId = id || eyebrow.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [isDismissed, setIsDismissed] = useState(false);
  const [hintsEnabled, setHintsEnabled] = useState(true);

  useEffect(() => {
    function syncHintState() {
      setHintsEnabled(pageHintsAreEnabled());
      setIsDismissed(Boolean(getDismissedHints()[getHintKey(hintId)]));
      fetchRemoteHintState()
        .then((state) => {
          applyRemoteHintState(state);
          setHintsEnabled(state.enabled !== false);
          setIsDismissed(Boolean(getDismissedHints()[getHintKey(hintId)]));
        })
        .catch(() => undefined);
    }

    syncHintState();
    window.addEventListener("storage", syncHintState);
    window.addEventListener("toc.pageHintsRedeployed", syncHintState);
    window.addEventListener("toc.pageHintsSettingChanged", syncHintState);
    const refreshInterval = window.setInterval(syncHintState, 60000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", syncHintState);
      window.removeEventListener("toc.pageHintsRedeployed", syncHintState);
      window.removeEventListener("toc.pageHintsSettingChanged", syncHintState);
    };
  }, [hintId]);

  function dismissHint() {
    const nextDismissed = { ...getDismissedHints(), [getHintKey(hintId)]: true };
    localStorage.setItem(hintDismissedKey, JSON.stringify(nextDismissed));
    setIsDismissed(true);
  }

  if (!hintsEnabled || isDismissed) return null;

  return (
    <div className="flow-heading page-hint" role="note">
      <div>
        <h2>Hint: {title}</h2>
      </div>
      <button type="button" aria-label={`Dismiss ${eyebrow} hint`} onClick={dismissHint}>Clear hint</button>
    </div>
  );
}

export function AdminHintControls() {
  const [message, setMessage] = useState("");
  const [hintsEnabled, setHintsEnabled] = useState(true);

  useEffect(() => {
    function syncHintSetting() {
      setHintsEnabled(pageHintsAreEnabled());
      fetchRemoteHintState()
        .then((state) => {
          applyRemoteHintState(state);
          setHintsEnabled(state.enabled !== false);
        })
        .catch(() => undefined);
    }

    syncHintSetting();
    window.addEventListener("storage", syncHintSetting);
    window.addEventListener("toc.pageHintsSettingChanged", syncHintSetting);
    const refreshInterval = window.setInterval(syncHintSetting, 60000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", syncHintSetting);
      window.removeEventListener("toc.pageHintsSettingChanged", syncHintSetting);
    };
  }, []);

  async function redeployHints() {
    const nextVersion = Date.now().toString();
    localStorage.setItem(hintEnabledKey, "true");
    localStorage.setItem(hintVersionKey, nextVersion);
    localStorage.removeItem(hintDismissedKey);
    window.dispatchEvent(new CustomEvent("toc.pageHintsRedeployed"));
    window.dispatchEvent(new CustomEvent("toc.pageHintsSettingChanged"));
    setHintsEnabled(true);
    try {
      await saveRemoteHintState(true, nextVersion);
      setMessage("Page hints redeployed for all users.");
    } catch {
      setMessage("Page hints redeployed for this browser. Database update needs Supabase server key.");
    }
  }

  async function toggleHints(nextEnabled: boolean) {
    const nextVersion = getHintVersion();
    localStorage.setItem(hintEnabledKey, nextEnabled ? "true" : "false");
    window.dispatchEvent(new CustomEvent("toc.pageHintsSettingChanged"));
    setHintsEnabled(nextEnabled);
    try {
      await saveRemoteHintState(nextEnabled, nextVersion);
      setMessage(nextEnabled ? "Page hints turned on for all users." : "Page hints turned off for all users.");
    } catch {
      setMessage(nextEnabled ? "Page hints turned on for this browser. Database update needs Supabase server key." : "Page hints turned off for this browser. Database update needs Supabase server key.");
    }
  }

  return (
    <div className="admin-hint-controls">
      <div>
        <strong>Page hint controls</strong>
        <small>{hintsEnabled ? "Hints are currently on." : "Hints are currently off."} Use this during testing or training to control guidance banners.</small>
      </div>
      <button type="button" className={hintsEnabled ? "danger-button" : ""} onClick={() => toggleHints(!hintsEnabled)}>
        {hintsEnabled ? "Turn off all hints" : "Turn on all hints"}
      </button>
      <button type="button" onClick={redeployHints}>Redeploy page hints</button>
      {message ? <small className="admin-hint-message">{message}</small> : null}
    </div>
  );
}
