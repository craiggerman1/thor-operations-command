"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { allRegions } from "@/lib/access";

type ChatMode = "group" | "direct" | "multi";

type ManagerRecipient = {
  id: string;
  label: string;
  region: string;
};

type ChatMessage = {
  id: number;
  mode: ChatMode;
  author: string;
  audience: string;
  recipients: string[];
  text: string;
  time: string;
  own?: boolean;
};

const managerRecipients: ManagerRecipient[] = allRegions
  .filter((region) => region !== "National")
  .map((region) => ({
    id: region.toLowerCase().replace(/\s+/g, "-"),
    label: `${region} Manager`,
    region
  }));

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    mode: "group",
    author: "Admin User",
    audience: "System-wide group chat",
    recipients: managerRecipients.map((manager) => manager.id),
    text: "Keep Portal approvals tight today and flag anything that will hold invoicing.",
    time: "08:05"
  },
  {
    id: 2,
    mode: "multi",
    author: "National Ops",
    audience: "Sydney Manager, Brisbane Manager",
    recipients: ["sydney", "brisbane"],
    text: "Please keep Fleetio entries clean. Registration, wash type and site all matter.",
    time: "08:18",
    own: true
  },
  {
    id: 3,
    mode: "direct",
    author: "Workshop Manager",
    audience: "Workshop Manager",
    recipients: ["workshop"],
    text: "Workshop servicing notes are ready for review when National Ops has a moment.",
    time: "08:31"
  }
];

function getStoredMessages() {
  if (typeof window === "undefined") return initialMessages;

  try {
    return JSON.parse(localStorage.getItem("toc.chat.messages") || "null") || initialMessages;
  } catch {
    return initialMessages;
  }
}

function getNowTime() {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

export default function ChatPage() {
  const [mode, setMode] = useState<ChatMode>("group");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(managerRecipients.map((manager) => manager.id));
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  useEffect(() => {
    setMessages(getStoredMessages());
  }, []);

  useEffect(() => {
    localStorage.setItem("toc.chat.messages", JSON.stringify(messages));
  }, [messages]);

  const visibleMessages = useMemo(() => {
    if (mode === "group") return messages.filter((message) => message.mode === "group");
    if (mode === "direct") {
      const target = selectedRecipients[0];
      return messages.filter((message) => message.mode === "direct" && message.recipients.includes(target));
    }

    return messages.filter((message) => message.mode === "multi");
  }, [messages, mode, selectedRecipients]);

  const audienceLabel = useMemo(() => {
    if (mode === "group") return "System-wide group chat";

    const recipients = managerRecipients.filter((manager) => selectedRecipients.includes(manager.id));
    if (!recipients.length) return "Select manager";
    return recipients.map((recipient) => recipient.label).join(", ");
  }, [mode, selectedRecipients]);

  const selectedManagerLabels = useMemo(() => {
    if (mode === "group") return managerRecipients.map((manager) => manager.label);
    return managerRecipients.filter((manager) => selectedRecipients.includes(manager.id)).map((manager) => manager.label);
  }, [mode, selectedRecipients]);

  const modeSummary = mode === "group"
    ? "Visible management group chat for all configured managers."
    : mode === "direct"
      ? "One-to-one manager message thread."
      : "Target a selected group of managers without sending site-wide.";

  function selectMode(nextMode: ChatMode) {
    setMode(nextMode);
    if (nextMode === "group") {
      setSelectedRecipients(managerRecipients.map((manager) => manager.id));
    }
    if (nextMode === "direct") {
      setSelectedRecipients([selectedRecipients[0] || "sydney"]);
    }
    if (nextMode === "multi") {
      setSelectedRecipients(selectedRecipients.length > 1 ? selectedRecipients : ["sydney", "brisbane"]);
    }
  }

  function toggleRecipient(recipientId: string) {
    if (mode === "direct") {
      setSelectedRecipients([recipientId]);
      return;
    }

    setSelectedRecipients((current) => {
      if (current.includes(recipientId)) {
        const next = current.filter((id) => id !== recipientId);
        return next.length ? next : [recipientId];
      }
      return [...current, recipientId];
    });
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const recipients = mode === "group"
      ? managerRecipients.map((manager) => manager.id)
      : selectedRecipients;

    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        mode,
        author: "Admin User",
        audience: mode === "group" ? "System-wide group chat" : audienceLabel,
        recipients,
        text,
        time: getNowTime(),
        own: true
      }
    ]);
    setDraft("");
  }

  return (
    <TocShell>
      <PageIntro title="Chat" detail="Ensure healthy communication between management." />
      <FlowHeading eyebrow="Chat" title="Keep manager communication clear, useful and tied to operational decisions." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Internal comms" title="Manager communications" pill="Database planned">
          <div className="chat-layout">
            <aside className="chat-channels" aria-label="Chat targeting">
              <div className="chat-sidebar-head">
                <span className="eyebrow">Conversation type</span>
                <strong>Route message</strong>
              </div>
              <button className={mode === "group" ? "active" : ""} type="button" onClick={() => selectMode("group")}>
                <span><strong>System-wide group</strong><small>All visible managers</small></span><em>All</em>
              </button>
              <button className={mode === "direct" ? "active" : ""} type="button" onClick={() => selectMode("direct")}>
                <span><strong>Direct message</strong><small>Single manager thread</small></span><em>1</em>
              </button>
              <button className={mode === "multi" ? "active" : ""} type="button" onClick={() => selectMode("multi")}>
                <span><strong>Multi-manager</strong><small>Selected managers only</small></span><em>{selectedRecipients.length}</em>
              </button>
              <div className="chat-channel-note">
                <strong>Comms staging</strong>
                <small>Messages save in this browser until database-backed chat is connected.</small>
              </div>
            </aside>
            <div className="chat-room">
              <div className="chat-room-head">
                <div>
                  <span className="eyebrow">{mode === "group" ? "Visible group chat" : "Targeted message"}</span>
                  <strong>{audienceLabel}</strong>
                  <small>{modeSummary}</small>
                </div>
                <Tag>{mode === "group" ? "All visible" : "Targeted"}</Tag>
              </div>
              <div className="chat-target-panel">
                <div className="chat-target-head">
                  <span className="eyebrow">Recipients</span>
                  <small>{selectedManagerLabels.length} selected</small>
                </div>
                <div className="chat-recipient-grid">
                  {managerRecipients.map((manager) => (
                    <button
                      key={manager.id}
                      className={selectedRecipients.includes(manager.id) ? "selected" : ""}
                      type="button"
                      onClick={() => toggleRecipient(manager.id)}
                      disabled={mode === "group"}
                    >
                      <strong>{manager.label}</strong>
                      <small>{manager.region}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="chat-messages">
                {visibleMessages.map((message) => (
                  <article key={message.id} className={`chat-message ${message.own ? "own" : ""}`}>
                    <span className="chat-avatar" aria-hidden="true">{message.author.slice(0, 1)}</span>
                    <div className="chat-bubble">
                      <div><strong>{message.author}</strong><span>{message.audience} - {message.time}</span></div>
                    <p>{message.text}</p>
                    </div>
                  </article>
                ))}
              </div>
              <form className="chat-form" onSubmit={sendMessage}>
                <input value={draft} placeholder={`Message ${audienceLabel}`} onChange={(event) => setDraft(event.target.value)} />
                <button type="submit">Send</button>
              </form>
            </div>
            <aside className="chat-context-panel" aria-label="Conversation context">
              <div>
                <span className="eyebrow">Active thread</span>
                <strong>{audienceLabel}</strong>
                <small>{modeSummary}</small>
              </div>
              <div className="chat-context-list">
                {selectedManagerLabels.slice(0, 6).map((label) => <span key={label}>{label}</span>)}
                {selectedManagerLabels.length > 6 ? <span>+{selectedManagerLabels.length - 6} more</span> : null}
              </div>
              <div className="chat-context-footer">
                <strong>Future live state</strong>
                <small>Database chat will add read receipts, user identity, attachments and searchable history.</small>
              </div>
            </aside>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
