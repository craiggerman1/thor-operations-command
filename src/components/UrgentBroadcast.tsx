"use client";

import { FormEvent, useEffect, useState } from "react";

type UrgentBroadcastMessage = {
  message: string;
  version: string;
  active: boolean;
};

const broadcastKey = "toc.urgentBroadcast";
const acknowledgedKey = "toc.urgentBroadcastAcknowledged";

function readBroadcast() {
  if (typeof window === "undefined") return null as UrgentBroadcastMessage | null;

  try {
    return JSON.parse(localStorage.getItem(broadcastKey) || "null") as UrgentBroadcastMessage | null;
  } catch {
    return null;
  }
}

function readAcknowledged() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(acknowledgedKey) || "";
}

function writeBroadcast(nextBroadcast: UrgentBroadcastMessage) {
  localStorage.setItem(broadcastKey, JSON.stringify(nextBroadcast));
  window.dispatchEvent(new Event("toc.urgentBroadcast.updated"));
}

export function UrgentBroadcastBanner() {
  const [broadcast, setBroadcast] = useState<UrgentBroadcastMessage | null>(null);
  const [acknowledgedVersion, setAcknowledgedVersion] = useState("");

  useEffect(() => {
    function syncBroadcast() {
      setBroadcast(readBroadcast());
      setAcknowledgedVersion(readAcknowledged());
    }

    syncBroadcast();
    window.addEventListener("storage", syncBroadcast);
    window.addEventListener("toc.urgentBroadcast.updated", syncBroadcast);
    return () => {
      window.removeEventListener("storage", syncBroadcast);
      window.removeEventListener("toc.urgentBroadcast.updated", syncBroadcast);
    };
  }, []);

  if (!broadcast?.active || !broadcast.message.trim() || acknowledgedVersion === broadcast.version) return null;

  function acknowledge() {
    if (!broadcast) return;
    localStorage.setItem(acknowledgedKey, broadcast.version);
    setAcknowledgedVersion(broadcast.version);
  }

  return (
    <section className="urgent-broadcast-banner" role="alert">
      <div>
        <span>Urgent notice</span>
        <strong>{broadcast.message}</strong>
      </div>
      <button type="button" onClick={acknowledge}>Acknowledge</button>
    </section>
  );
}

export function UrgentBroadcastControls() {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const broadcast = readBroadcast();
    if (broadcast?.message) setMessage(broadcast.message);
  }, []);

  function deployBroadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (!cleanMessage) return;

    writeBroadcast({
      message: cleanMessage,
      version: Date.now().toString(),
      active: true
    });
    setStatus("Urgent banner deployed. Users must acknowledge it before it clears.");
  }

  function redeployBroadcast() {
    const current = readBroadcast();
    const cleanMessage = (message || current?.message || "").trim();
    if (!cleanMessage) return;

    writeBroadcast({
      message: cleanMessage,
      version: Date.now().toString(),
      active: true
    });
    localStorage.removeItem(acknowledgedKey);
    setStatus("Urgent banner redeployed.");
  }

  function disableBroadcast() {
    const current = readBroadcast();
    writeBroadcast({
      message: current?.message || message,
      version: Date.now().toString(),
      active: false
    });
    setStatus("Urgent banner disabled.");
  }

  return (
    <form className="urgent-broadcast-controls" onSubmit={deployBroadcast}>
      <label>
        <span>Urgent banner message</span>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Enter urgent message for all TOC users" />
      </label>
      <div className="urgent-broadcast-actions">
        <button type="submit">Deploy urgent banner</button>
        <button type="button" onClick={redeployBroadcast}>Redeploy banner</button>
        <button type="button" className="danger-button" onClick={disableBroadcast}>Disable banner</button>
      </div>
      {status ? <small>{status}</small> : null}
    </form>
  );
}
