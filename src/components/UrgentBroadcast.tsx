"use client";

import { FormEvent, useEffect, useState } from "react";
import { allRegions } from "@/lib/access";

type UrgentBroadcastMessage = {
  message: string;
  version: string;
  active: boolean;
  targetScope: string;
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

function readSessionScope() {
  if (typeof window === "undefined") return "National";

  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.scope || "National";
  } catch {
    return "National";
  }
}

function writeBroadcast(nextBroadcast: UrgentBroadcastMessage) {
  localStorage.setItem(broadcastKey, JSON.stringify(nextBroadcast));
  window.dispatchEvent(new Event("toc.urgentBroadcast.updated"));
}

export function UrgentBroadcastBanner() {
  const [broadcast, setBroadcast] = useState<UrgentBroadcastMessage | null>(null);
  const [acknowledgedVersion, setAcknowledgedVersion] = useState("");
  const [sessionScope, setSessionScope] = useState("National");

  useEffect(() => {
    function syncBroadcast() {
      setBroadcast(readBroadcast());
      setAcknowledgedVersion(readAcknowledged());
      setSessionScope(readSessionScope());
    }

    syncBroadcast();
    window.addEventListener("storage", syncBroadcast);
    window.addEventListener("toc.scopechange", syncBroadcast);
    window.addEventListener("toc.urgentBroadcast.updated", syncBroadcast);
    return () => {
      window.removeEventListener("storage", syncBroadcast);
      window.removeEventListener("toc.scopechange", syncBroadcast);
      window.removeEventListener("toc.urgentBroadcast.updated", syncBroadcast);
    };
  }, []);

  const activeTargetScope = broadcast?.targetScope || "All users";
  const isTargetedToUser = activeTargetScope === "All users" || activeTargetScope === sessionScope;

  if (!broadcast?.active || !broadcast.message.trim() || !isTargetedToUser || acknowledgedVersion === broadcast.version) return null;

  function acknowledge() {
    if (!broadcast) return;
    localStorage.setItem(acknowledgedKey, broadcast.version);
    setAcknowledgedVersion(broadcast.version);
  }

  return (
    <section className="urgent-broadcast-banner" role="alert">
      <div>
        <span>{activeTargetScope === "All users" ? "Urgent site-wide notice" : `Urgent ${activeTargetScope} notice`}</span>
        <strong>{broadcast.message}</strong>
      </div>
      <button type="button" onClick={acknowledge}>Acknowledge</button>
    </section>
  );
}

export function UrgentBroadcastControls() {
  const [message, setMessage] = useState("");
  const [targetScope, setTargetScope] = useState("All users");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const broadcast = readBroadcast();
    if (broadcast?.message) setMessage(broadcast.message);
    if (broadcast?.targetScope) setTargetScope(broadcast.targetScope);
  }, []);

  function deployBroadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (!cleanMessage) return;

    writeBroadcast({
      message: cleanMessage,
      version: Date.now().toString(),
      active: true,
      targetScope
    });
    setStatus(`Urgent banner deployed to ${targetScope}. Users must acknowledge it before it clears.`);
  }

  function redeployBroadcast() {
    const current = readBroadcast();
    const cleanMessage = (message || current?.message || "").trim();
    if (!cleanMessage) return;

    writeBroadcast({
      message: cleanMessage,
      version: Date.now().toString(),
      active: true,
      targetScope
    });
    localStorage.removeItem(acknowledgedKey);
    setStatus(`Urgent banner redeployed to ${targetScope}.`);
  }

  function disableBroadcast() {
    const current = readBroadcast();
    writeBroadcast({
      message: current?.message || message,
      version: Date.now().toString(),
      active: false,
      targetScope: current?.targetScope || targetScope
    });
    setStatus("Urgent banner disabled.");
  }

  return (
    <form className="urgent-broadcast-controls" onSubmit={deployBroadcast}>
      <label>
        <span>Urgent banner message</span>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Enter urgent message for all TOC users" />
      </label>
      <label>
        <span>Alert target</span>
        <select value={targetScope} onChange={(event) => setTargetScope(event.target.value)}>
          <option value="All users">All users - site wide</option>
          {allRegions.map((region) => <option value={region} key={region}>{region}</option>)}
        </select>
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
