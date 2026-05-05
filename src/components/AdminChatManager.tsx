"use client";

import { useEffect, useMemo, useState } from "react";
import { Tag } from "@/components/TocCards";
import { allRegions } from "@/lib/access";
import { getTocRequestHeaders, tocFetch } from "@/lib/toc-client-auth";

type ChatMode = "group" | "direct" | "multi";

type ChatMessage = {
  id: string;
  mode: ChatMode;
  author: string;
  audience: string;
  recipients: string[];
  text: string;
  time: string;
  own?: boolean;
  createdAt: string;
};

const defaultManagerRecipients = allRegions
  .filter((region) => region !== "National")
  .map((region) => ({
    id: region.toLowerCase().replace(/\s+/g, "-"),
    label: `${region} Manager`,
    region
  }));

async function fetchChatMessages() {
  const response = await tocFetch("/api/chat?all=true", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Chat database read failed.");
  return (payload.messages || []) as ChatMessage[];
}

async function mutateChat(body: Record<string, unknown>) {
  const response = await tocFetch("/api/chat", {
    method: "POST",
    body: JSON.stringify(body)
  }, true);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Chat update failed.");
  return (payload.messages || []) as ChatMessage[];
}

export function AdminChatManager() {
  const [managerRecipients, setManagerRecipients] = useState(defaultManagerRecipients);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mode, setMode] = useState<ChatMode>("group");
  const [selectedRecipients, setSelectedRecipients] = useState(defaultManagerRecipients.map((manager) => manager.id));
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const recentMessages = useMemo(() => [...messages].reverse().slice(0, 15), [messages]);
  const audience = useMemo(() => {
    if (mode === "group") return "System-wide group chat";
    const selected = managerRecipients.filter((manager) => selectedRecipients.includes(manager.id));
    return selected.length ? selected.map((manager) => manager.label).join(", ") : "Selected managers";
  }, [mode, selectedRecipients]);

  useEffect(() => {
    fetchChatMessages()
      .then(setMessages)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    async function loadRecipients() {
      try {
        const response = await fetch("/api/admin/users", { headers: await getTocRequestHeaders(), cache: "no-store" });
        const payload = await response.json();
        const users = (payload.users || []) as { name: string; role: string; regions: string[]; status: string }[];
        const recipients = users
          .filter((user) => user.status === "Active" && user.role !== "director")
          .flatMap((user) => user.regions.filter((region) => region !== "National").map((region) => ({
            id: `${user.name}-${region}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
            label: user.name,
            region
          })));

        setManagerRecipients(recipients.length ? recipients : defaultManagerRecipients);
        if (recipients.length) setSelectedRecipients((current) => current.filter((id) => recipients.some((recipient) => recipient.id === id)).length ? current : recipients.map((recipient) => recipient.id));
      } catch {
        setManagerRecipients(defaultManagerRecipients);
      }
    }

    void loadRecipients();
    window.addEventListener("toc.adminUsers.updated", loadRecipients);
    return () => window.removeEventListener("toc.adminUsers.updated", loadRecipients);
  }, []);

  function toggleRecipient(id: string) {
    if (mode === "group") return;
    if (mode === "direct") {
      setSelectedRecipients([id]);
      return;
    }

    setSelectedRecipients((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      return next.length ? next : [id];
    });
  }

  function changeMode(nextMode: ChatMode) {
    setMode(nextMode);
    if (nextMode === "group") setSelectedRecipients(managerRecipients.map((manager) => manager.id));
    if (nextMode === "direct") setSelectedRecipients([selectedRecipients[0] || managerRecipients[0]?.id || "brisbane"]);
    if (nextMode === "multi" && selectedRecipients.length < 2) setSelectedRecipients(managerRecipients.slice(0, 2).map((manager) => manager.id));
  }

  async function sendAdminMessage() {
    const text = draft.trim();
    if (!text) {
      setMessage("Add a chat message first.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      const recipients = mode === "group" ? managerRecipients.map((manager) => manager.id) : selectedRecipients;
      const nextMessages = await mutateChat({ mode, author: "Admin User", audience, recipients, text, own: true, all: true });
      setMessages(nextMessages);
      setDraft("");
      setMessage("Admin chat message sent.");
      window.dispatchEvent(new Event("toc.chat.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send chat message.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteMessage(id: string) {
    if (!window.confirm("Are you sure you want to delete this chat message?")) return;
    setMessage("");
    try {
      const nextMessages = await mutateChat({ action: "delete", id, all: true });
      setMessages(nextMessages);
      setMessage("Chat message deleted.");
      window.dispatchEvent(new Event("toc.chat.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete chat message.");
    }
  }

  return (
    <div className="admin-action-console">
      <div className="admin-action-form">
        <div>
          <strong>Send management message</strong>
          <small>Post group, direct or multi-manager messages into the TOC chat database.</small>
        </div>
        <div className="segmented-control">
          <button className={mode === "group" ? "active" : ""} type="button" onClick={() => changeMode("group")}>Group</button>
          <button className={mode === "direct" ? "active" : ""} type="button" onClick={() => changeMode("direct")}>Direct</button>
          <button className={mode === "multi" ? "active" : ""} type="button" onClick={() => changeMode("multi")}>Multi</button>
        </div>
        <div className="chat-recipient-grid admin-chat-recipient-grid">
          {managerRecipients.map((manager) => (
            <button
              className={selectedRecipients.includes(manager.id) ? "selected" : ""}
              disabled={mode === "group"}
              key={manager.id}
              onClick={() => toggleRecipient(manager.id)}
              type="button"
            >
              <strong>{manager.label}</strong>
              <small>{manager.region}</small>
            </button>
          ))}
        </div>
        <label><span>Message</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${audience}`} /></label>
        <button type="button" onClick={sendAdminMessage} disabled={isSaving}>{isSaving ? "Sending..." : "Send Chat Message"}</button>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
      <div className="admin-action-list">
        <div className="admin-list-head">
          <div>
            <strong>Recent chat messages</strong>
            <small>{messages.length} messages loaded from Supabase.</small>
          </div>
        </div>
        {recentMessages.map((item) => (
          <article className="admin-action-card" key={item.id}>
            <div className="admin-action-card-head">
              <div>
                <strong>{item.author}</strong>
                <small>{item.audience} - {item.time}</small>
              </div>
              <Tag>{item.mode}</Tag>
            </div>
            <p>{item.text}</p>
            <div className="admin-action-controls">
              <button type="button" className="danger-button" onClick={() => void deleteMessage(item.id)}>Delete</button>
            </div>
          </article>
        ))}
        {recentMessages.length ? null : <div className="empty-state">No chat messages are currently loaded from the database.</div>}
      </div>
    </div>
  );
}
