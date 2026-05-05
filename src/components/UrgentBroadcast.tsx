"use client";

import { FormEvent, useEffect, useState } from "react";
import { allRegions } from "@/lib/access";
import { tocFetch } from "@/lib/toc-client-auth";

type UrgentBroadcastMessage = {
  id: string;
  message: string;
  version: string;
  active: boolean;
  targetScope: string;
  acknowledgedBy?: string[];
};

type DirectorBroadcastMessage = {
  message: string;
  version: string;
  active: boolean;
  acknowledgedBy?: string[];
};

const broadcastKey = "toc.urgentBroadcast";
const acknowledgedKey = "toc.urgentBroadcastAcknowledged";
const directorBroadcastKey = "toc.directorBroadcast";
const directorAcknowledgedKey = "toc.directorBroadcastAcknowledged";
const broadcastApi = "/api/broadcasts";

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

function readSessionUserKey() {
  if (typeof window === "undefined") return "admin:National";

  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    const role = session?.role || "admin";
    const scope = session?.scope || "National";
    const label = session?.label || role;
    return `${role}:${scope}:${label}`;
  } catch {
    return "admin:National:Admin";
  }
}

function writeBroadcasts(nextBroadcasts: UrgentBroadcastMessage[]) {
  localStorage.setItem(broadcastKey, JSON.stringify(nextBroadcasts));
  syncRemoteBroadcasts("urgent", { broadcasts: nextBroadcasts });
  window.dispatchEvent(new Event("toc.urgentBroadcast.updated"));
}

function readDirectorBroadcast() {
  if (typeof window === "undefined") return null as DirectorBroadcastMessage | null;

  try {
    return JSON.parse(localStorage.getItem(directorBroadcastKey) || "null") as DirectorBroadcastMessage | null;
  } catch {
    return null;
  }
}

function cleanRemoteDirectorBroadcast(raw: unknown) {
  if (!raw || typeof raw !== "object") return null as DirectorBroadcastMessage | null;

  const broadcast = raw as Partial<DirectorBroadcastMessage>;
  return {
    message: broadcast.message || "",
    version: broadcast.version || Date.now().toString(),
    active: Boolean(broadcast.active)
  };
}

function writeDirectorBroadcast(nextBroadcast: DirectorBroadcastMessage) {
  localStorage.setItem(directorBroadcastKey, JSON.stringify(nextBroadcast));
  syncRemoteBroadcasts("director", { broadcast: nextBroadcast });
  window.dispatchEvent(new Event("toc.directorBroadcast.updated"));
}

function deleteDirectorBroadcast() {
  localStorage.removeItem(directorBroadcastKey);
  localStorage.removeItem(directorAcknowledgedKey);
  syncRemoteBroadcasts("clear-director", {});
  window.dispatchEvent(new Event("toc.directorBroadcast.updated"));
}

function syncRemoteBroadcasts(kind: "urgent" | "director" | "clear-director", payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  tocFetch(broadcastApi, {
    method: "POST",
    body: JSON.stringify({ kind, ...payload })
  }, true).catch(() => {
    // Local browser storage remains the fallback until central broadcast storage is active.
  });
}

function syncBroadcastAcknowledgement(kind: "acknowledge" | "acknowledge-director", version: string) {
  tocFetch(broadcastApi, {
    method: "POST",
    body: JSON.stringify({ kind, version, userKey: readSessionUserKey() })
  }, true).catch(() => undefined);
}

function mergeBroadcasts(localBroadcasts: UrgentBroadcastMessage[], remoteBroadcasts: UrgentBroadcastMessage[]) {
  const broadcastMap = new Map<string, UrgentBroadcastMessage>();
  [...remoteBroadcasts, ...localBroadcasts].forEach((broadcast) => {
    broadcastMap.set(broadcast.id, broadcast);
  });
  return Array.from(broadcastMap.values());
}

export function UrgentBroadcastBanner() {
  const [broadcasts, setBroadcasts] = useState<UrgentBroadcastMessage[]>([]);
  const [acknowledgedVersions, setAcknowledgedVersions] = useState<Record<string, boolean>>({});
  const [sessionScope, setSessionScope] = useState("National");

  useEffect(() => {
    async function syncBroadcast() {
      const localBroadcasts = readBroadcasts();
      setBroadcasts(localBroadcasts);
      setAcknowledgedVersions(readAcknowledged());
      setSessionScope(readSessionScope());

      try {
        const response = await fetch(broadcastApi, { cache: "no-store" });
        if (!response.ok) return;
        const remoteState = await response.json();
        const remoteBroadcasts = normaliseBroadcast(remoteState.urgentBroadcasts || []);
        const acknowledgements = remoteState.acknowledgements || {};
        const remoteWithAcknowledgements = remoteBroadcasts.map((broadcast) => ({ ...broadcast, acknowledgedBy: acknowledgements[broadcast.version] || [] }));
        setBroadcasts(remoteState.connected ? remoteWithAcknowledgements : mergeBroadcasts(localBroadcasts, remoteWithAcknowledgements));
      } catch {
        setBroadcasts(localBroadcasts);
      }
    }

    syncBroadcast();
    window.addEventListener("storage", syncBroadcast);
    window.addEventListener("toc.scopechange", syncBroadcast);
    window.addEventListener("toc.urgentBroadcast.updated", syncBroadcast);
    const refreshInterval = window.setInterval(syncBroadcast, 15000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", syncBroadcast);
      window.removeEventListener("toc.scopechange", syncBroadcast);
      window.removeEventListener("toc.urgentBroadcast.updated", syncBroadcast);
    };
  }, []);

  const visibleBroadcasts = broadcasts.filter((broadcast) => {
    const targetScope = broadcast.targetScope || "All users";
    const isTargetedToUser = targetScope === "All users" || targetScope === sessionScope;
    const acknowledgedRemotely = (broadcast.acknowledgedBy || []).includes(readSessionUserKey());
    return broadcast.active && broadcast.message.trim() && isTargetedToUser && !acknowledgedVersions[broadcast.version] && !acknowledgedRemotely;
  });

  if (!visibleBroadcasts.length) return null;

  function acknowledge(version: string) {
    const nextAcknowledged = { ...acknowledgedVersions, [version]: true };
    localStorage.setItem(acknowledgedKey, JSON.stringify(nextAcknowledged));
    setAcknowledgedVersions(nextAcknowledged);
    syncBroadcastAcknowledgement("acknowledge", version);
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
    async function syncBroadcasts() {
      const localBroadcasts = readBroadcasts();
      setBroadcasts(localBroadcasts);

      try {
        const response = await fetch(broadcastApi, { cache: "no-store" });
        if (!response.ok) return;
        const remoteState = await response.json();
        const remoteBroadcasts = normaliseBroadcast(remoteState.urgentBroadcasts || []);
        const acknowledgements = remoteState.acknowledgements || {};
        const remoteWithAcknowledgements = remoteBroadcasts.map((broadcast) => ({ ...broadcast, acknowledgedBy: acknowledgements[broadcast.version] || [] }));
        setBroadcasts(remoteState.connected ? remoteWithAcknowledgements : mergeBroadcasts(localBroadcasts, remoteWithAcknowledgements));
      } catch {
        setBroadcasts(localBroadcasts);
      }
    }

    syncBroadcasts();
    window.addEventListener("storage", syncBroadcasts);
    window.addEventListener("toc.urgentBroadcast.updated", syncBroadcasts);
    const refreshInterval = window.setInterval(syncBroadcasts, 15000);
    return () => {
      window.clearInterval(refreshInterval);
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
                  <small>{broadcast.targetScope || "All users"} - {broadcast.active ? "Active" : "Disabled"} - {(broadcast.acknowledgedBy || []).length} acknowledgements</small>
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

export function DirectorBroadcastBanner() {
  const [broadcast, setBroadcast] = useState<DirectorBroadcastMessage | null>(null);
  const [acknowledgedVersion, setAcknowledgedVersion] = useState("");

  useEffect(() => {
    async function syncBroadcast() {
      const localBroadcast = readDirectorBroadcast();
      setBroadcast(localBroadcast);
      setAcknowledgedVersion(localStorage.getItem(directorAcknowledgedKey) || "");

      try {
        const response = await fetch(broadcastApi, { cache: "no-store" });
        if (!response.ok) return;
        const remoteState = await response.json();
        const remoteBroadcast = cleanRemoteDirectorBroadcast(remoteState.directorBroadcast);
        const acknowledgedBy = remoteBroadcast ? (remoteState.directorAcknowledgements || {})[remoteBroadcast.version] || [] : [];
        setBroadcast(remoteState.connected ? remoteBroadcast ? { ...remoteBroadcast, acknowledgedBy } : null : remoteBroadcast ? { ...remoteBroadcast, acknowledgedBy } : localBroadcast);
      } catch {
        setBroadcast(localBroadcast);
      }
    }

    syncBroadcast();
    window.addEventListener("storage", syncBroadcast);
    window.addEventListener("toc.directorBroadcast.updated", syncBroadcast);
    const refreshInterval = window.setInterval(syncBroadcast, 15000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", syncBroadcast);
      window.removeEventListener("toc.directorBroadcast.updated", syncBroadcast);
    };
  }, []);

  if (!broadcast?.active || !broadcast.message.trim() || acknowledgedVersion === broadcast.version || (broadcast.acknowledgedBy || []).includes(readSessionUserKey())) return null;

  function acknowledgeDirectorMessage() {
    if (!broadcast) return;
    localStorage.setItem(directorAcknowledgedKey, broadcast.version);
    setAcknowledgedVersion(broadcast.version);
    syncBroadcastAcknowledgement("acknowledge-director", broadcast.version);
  }

  return (
    <section className="director-broadcast-banner" role="alert">
      <div>
        <span>A Message From The Director</span>
        <strong>{broadcast.message}</strong>
      </div>
      <button type="button" onClick={acknowledgeDirectorMessage}>Acknowledge</button>
    </section>
  );
}

export function DirectorBroadcastControls() {
  const [message, setMessage] = useState("");
  const [broadcast, setBroadcast] = useState<DirectorBroadcastMessage | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function syncBroadcast() {
      const current = readDirectorBroadcast();
      setBroadcast(current);
      setMessage(current?.message || "");

      try {
        const response = await fetch(broadcastApi, { cache: "no-store" });
        if (!response.ok) return;
        const remoteState = await response.json();
        const remoteBroadcast = cleanRemoteDirectorBroadcast(remoteState.directorBroadcast);
        if (remoteState.connected && !remoteBroadcast) {
          setBroadcast(null);
          setMessage("");
          return;
        }
        if (!remoteBroadcast) return;
        const acknowledgedBy = (remoteState.directorAcknowledgements || {})[remoteBroadcast.version] || [];
        setBroadcast({ ...remoteBroadcast, acknowledgedBy });
        setMessage(remoteBroadcast.message);
      } catch {
        setBroadcast(current);
      }
    }

    syncBroadcast();
    window.addEventListener("storage", syncBroadcast);
    window.addEventListener("toc.directorBroadcast.updated", syncBroadcast);
    const refreshInterval = window.setInterval(syncBroadcast, 15000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", syncBroadcast);
      window.removeEventListener("toc.directorBroadcast.updated", syncBroadcast);
    };
  }, []);

  function deployDirectorMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (!cleanMessage) return;

    const nextBroadcast = {
      message: cleanMessage,
      version: Date.now().toString(),
      active: true
    };
    writeDirectorBroadcast(nextBroadcast);
    setBroadcast(nextBroadcast);
    setStatus("Director message deployed to all users.");
  }

  function disableDirectorMessage() {
    if (!broadcast) return;
    const nextBroadcast = { ...broadcast, active: false };
    writeDirectorBroadcast(nextBroadcast);
    setBroadcast(nextBroadcast);
    setStatus("Director message disabled.");
  }

  function removeDirectorMessage() {
    if (!broadcast) return;
    const confirmed = window.confirm("Are you sure you want to delete this Director message?");
    if (!confirmed) return;

    deleteDirectorBroadcast();
    setBroadcast(null);
    setMessage("");
    setStatus("Director message deleted.");
  }

  function redeployDirectorMessage() {
    if (!broadcast?.message.trim()) return;
    const nextBroadcast = { ...broadcast, version: Date.now().toString(), active: true };
    writeDirectorBroadcast(nextBroadcast);
    setBroadcast(nextBroadcast);
    setStatus("Director message redeployed to all users.");
  }

  return (
    <div className="director-broadcast-controls">
      <form className="urgent-broadcast-form" onSubmit={deployDirectorMessage}>
        <label>
          <span>A Message From The Director</span>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Enter Director message for all TOC users" />
        </label>
        <div className="urgent-broadcast-actions">
          <button type="submit">Deploy Director Message</button>
          <button type="button" className="secondary-button" onClick={redeployDirectorMessage}>Redeploy</button>
          <button type="button" className="danger-button" onClick={disableDirectorMessage}>Disable</button>
          <button type="button" className="danger-button" onClick={removeDirectorMessage}>Delete</button>
        </div>
      </form>
      {broadcast ? (
        <article className={`urgent-broadcast-admin-card director-message-card ${broadcast.active ? "active" : ""}`}>
          <div>
            <strong>{broadcast.message}</strong>
            <small>{broadcast.active ? "Active Director message" : "Director message disabled"}</small>
          </div>
        </article>
      ) : null}
      {status ? <small>{status}</small> : null}
    </div>
  );
}
