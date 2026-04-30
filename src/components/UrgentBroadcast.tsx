"use client";

import { FormEvent, useEffect, useState } from "react";
import { allRegions } from "@/lib/access";

type UrgentBroadcastMessage = {
  id: string;
  message: string;
  version: string;
  active: boolean;
  targetScope: string;
};

const broadcastKey = "toc.urgentBroadcast";
const acknowledgedKey = "toc.urgentBroadcastAcknowledged";

function createId() {
  return `urgent-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function normaliseBroadcast(raw: unknown) {
  if (Array.isArray(raw)) {
    return raw.map((item) => ({
      id: item.id || createId(),
      message: item.message || "",
      version: item.version || Date.now().toString(),
      active: Boolean(item.active),
      targetScope: item.targetScope || "All users"
    })) as UrgentBroadcastMessage[];
  }

  if (raw && typeof raw === "object") {
    const item = raw as Partial<UrgentBroadcastMessage>;
    return [{
      id: item.id || "legacy-urgent-broadcast",
      message: item.message || "",
      version: item.version || Date.now().toString(),
      active: Boolean(item.active),
      targetScope: item.targetScope || "All users"
    }];
  }

  return [] as UrgentBroadcastMessage[];
}

function readBroadcasts() {
  if (typeof window === "undefined") return [] as UrgentBroadcastMessage[];

  try {
    return normaliseBroadcast(JSON.parse(localStorage.getItem(broadcastKey) || "[]"));
  } catch {
    return [];
  }
}

function readAcknowledged() {
  if (typeof window === "undefined") return {} as Record<string, boolean>;

  try {
    const raw = JSON.parse(localStorage.getItem(acknowledgedKey) || "{}");
    if (typeof raw === "string") return { [raw]: true };
    return raw || {};
  } catch {
    const legacyVersion = localStorage.getItem(acknowledgedKey) || "";
    return legacyVersion ? { [legacyVersion]: true } : {};
  }
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

function writeBroadcasts(nextBroadcasts: UrgentBroadcastMessage[]) {
  localStorage.setItem(broadcastKey, JSON.stringify(nextBroadcasts));
  window.dispatchEvent(new Event("toc.urgentBroadcast.updated"));
}

export function UrgentBroadcastBanner() {
  const [broadcasts, setBroadcasts] = useState<UrgentBroadcastMessage[]>([]);
  const [acknowledgedVersions, setAcknowledgedVersions] = useState<Record<string, boolean>>({});
  const [sessionScope, setSessionScope] = useState("National");

  useEffect(() => {
    function syncBroadcast() {
      setBroadcasts(readBroadcasts());
      setAcknowledgedVersions(readAcknowledged());
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

  const visibleBroadcasts = broadcasts.filter((broadcast) => {
    const targetScope = broadcast.targetScope || "All users";
    const isTargetedToUser = targetScope === "All users" || targetScope === sessionScope;
    return broadcast.active && broadcast.message.trim() && isTargetedToUser && !acknowledgedVersions[broadcast.version];
  });

  if (!visibleBroadcasts.length) return null;

  function acknowledge(version: string) {
    const nextAcknowledged = { ...acknowledgedVersions, [version]: true };
    localStorage.setItem(acknowledgedKey, JSON.stringify(nextAcknowledged));
    setAcknowledgedVersions(nextAcknowledged);
  }

  return (
    <div className="urgent-broadcast-stack" role="region" aria-label="Urgent notices">
      {visibleBroadcasts.map((broadcast) => {
        const targetScope = broadcast.targetScope || "All users";
        return (
          <section className="urgent-broadcast-banner" role="alert" key={broadcast.version}>
            <div>
              <span>{targetScope === "All users" ? "Urgent site-wide notice" : `Urgent ${targetScope} notice`}</span>
              <strong>{broadcast.message}</strong>
            </div>
            <button type="button" onClick={() => acknowledge(broadcast.version)}>Acknowledge</button>
          </section>
        );
      })}
    </div>
  );
}

export function UrgentBroadcastControls() {
  const [message, setMessage] = useState("");
  const [targetScope, setTargetScope] = useState("All users");
  const [broadcasts, setBroadcasts] = useState<UrgentBroadcastMessage[]>([]);
  const [editingId, setEditingId] = useState("");
  const [editingMessage, setEditingMessage] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    function syncBroadcasts() {
      setBroadcasts(readBroadcasts());
    }

    syncBroadcasts();
    window.addEventListener("storage", syncBroadcasts);
    window.addEventListener("toc.urgentBroadcast.updated", syncBroadcasts);
    return () => {
      window.removeEventListener("storage", syncBroadcasts);
      window.removeEventListener("toc.urgentBroadcast.updated", syncBroadcasts);
    };
  }, []);

  function deployBroadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (!cleanMessage) return;

    const nextBroadcasts = [{
      id: createId(),
      message: cleanMessage,
      version: Date.now().toString(),
      active: true,
      targetScope
    }, ...broadcasts];
    writeBroadcasts(nextBroadcasts);
    setBroadcasts(nextBroadcasts);
    setMessage("");
    setStatus(`Urgent banner deployed to ${targetScope}.`);
  }

  function redeployBroadcast(id: string) {
    const nextBroadcasts = broadcasts.map((broadcast) => broadcast.id === id
      ? { ...broadcast, version: Date.now().toString(), active: true }
      : broadcast);
    writeBroadcasts(nextBroadcasts);
    setBroadcasts(nextBroadcasts);
    setStatus("Urgent banner redeployed.");
  }

  function beginEditBroadcast(id: string) {
    const target = broadcasts.find((broadcast) => broadcast.id === id);
    if (!target) return;

    setEditingId(id);
    setEditingMessage(target.message);
    setStatus("");
  }

  function cancelEditBroadcast() {
    setEditingId("");
    setEditingMessage("");
  }

  function saveEditBroadcast(id: string) {
    const cleanMessage = editingMessage.trim();
    if (!cleanMessage) return;

    const nextBroadcasts = broadcasts.map((broadcast) => broadcast.id === id
      ? { ...broadcast, message: cleanMessage, version: Date.now().toString(), active: true }
      : broadcast);
    writeBroadcasts(nextBroadcasts);
    setBroadcasts(nextBroadcasts);
    setEditingId("");
    setEditingMessage("");
    setStatus("Urgent banner message updated.");
  }

  function disableBroadcast(id: string) {
    const nextBroadcasts = broadcasts.map((broadcast) => broadcast.id === id ? { ...broadcast, active: false } : broadcast);
    writeBroadcasts(nextBroadcasts);
    setBroadcasts(nextBroadcasts);
    setStatus("Urgent banner disabled.");
  }

  function deleteBroadcast(id: string) {
    const target = broadcasts.find((broadcast) => broadcast.id === id);
    if (!target) return;

    const confirmed = window.confirm("Are you sure you want to delete this urgent alert?");
    if (!confirmed) return;

    const nextBroadcasts = broadcasts.filter((broadcast) => broadcast.id !== id);
    writeBroadcasts(nextBroadcasts);
    setBroadcasts(nextBroadcasts);
    setStatus("Urgent banner deleted.");
  }

  return (
    <div className="urgent-broadcast-controls">
      <form className="urgent-broadcast-form" onSubmit={deployBroadcast}>
        <label>
          <span>Urgent banner message</span>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Enter urgent message for TOC users" />
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
        </div>
      </form>
      <div className="urgent-broadcast-list">
        {broadcasts.map((broadcast) => (
          <article className={`urgent-broadcast-admin-card ${broadcast.active ? "active" : ""}`} key={broadcast.id}>
            {editingId === broadcast.id ? (
              <div className="urgent-broadcast-editor">
                <label>
                  <span>Edit alert message</span>
                  <textarea value={editingMessage} onChange={(event) => setEditingMessage(event.target.value)} />
                </label>
                <small>{broadcast.targetScope || "All users"} - {broadcast.active ? "Active" : "Disabled"}</small>
                <div className="urgent-broadcast-actions">
                  <button type="button" onClick={() => saveEditBroadcast(broadcast.id)}>Save message</button>
                  <button type="button" className="secondary-button" onClick={cancelEditBroadcast}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <strong>{broadcast.message}</strong>
                  <small>{broadcast.targetScope || "All users"} - {broadcast.active ? "Active" : "Disabled"}</small>
                </div>
                <div className="urgent-broadcast-actions">
                  <button type="button" onClick={() => beginEditBroadcast(broadcast.id)}>Edit</button>
                  <button type="button" onClick={() => redeployBroadcast(broadcast.id)}>Redeploy</button>
                  <button type="button" className="danger-button" onClick={() => disableBroadcast(broadcast.id)}>Disable</button>
                  <button type="button" className="danger-button" onClick={() => deleteBroadcast(broadcast.id)}>Delete</button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
      {status ? <small>{status}</small> : null}
    </div>
  );
}
