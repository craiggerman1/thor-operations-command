"use client";

import type { Status } from "@/lib/toc-data";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

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
const defaultHintVersion = "0.062";

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

export function FlowHeading({ eyebrow, title, id }: { step?: string; eyebrow: string; title: string; id?: string }) {
  const hintId = id || eyebrow.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    function syncHintState() {
      setIsDismissed(Boolean(getDismissedHints()[getHintKey(hintId)]));
    }

    syncHintState();
    window.addEventListener("storage", syncHintState);
    window.addEventListener("toc.pageHintsRedeployed", syncHintState);
    return () => {
      window.removeEventListener("storage", syncHintState);
      window.removeEventListener("toc.pageHintsRedeployed", syncHintState);
    };
  }, [hintId]);

  function dismissHint() {
    const nextDismissed = { ...getDismissedHints(), [getHintKey(hintId)]: true };
    localStorage.setItem(hintDismissedKey, JSON.stringify(nextDismissed));
    setIsDismissed(true);
  }

  if (isDismissed) return null;

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

  function redeployHints() {
    localStorage.setItem(hintVersionKey, Date.now().toString());
    localStorage.removeItem(hintDismissedKey);
    window.dispatchEvent(new CustomEvent("toc.pageHintsRedeployed"));
    setMessage("Page hints redeployed for this browser. Database-backed user reset will make this national later.");
  }

  return (
    <div className="admin-hint-controls">
      <div>
        <strong>Page hint controls</strong>
        <small>Use this during testing or training to bring cleared guidance banners back.</small>
      </div>
      <button type="button" onClick={redeployHints}>Redeploy page hints</button>
      {message ? <small className="admin-hint-message">{message}</small> : null}
    </div>
  );
}
