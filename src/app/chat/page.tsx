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
  id: string;
  mode: ChatMode;
  author: string;
  audience: string;
  recipients: string[];
  text: string;
  time: string;
  own?: boolean;
};

type ManagerMeeting = {
  id: string;
  title: string;
  audience: string;
  time: string;
  purpose: string;
  status: "Ready" | "Queued" | "Scheduled";
  link: string;
};

const defaultManagerRecipients: ManagerRecipient[] = allRegions
  .filter((region) => region !== "National")
  .map((region) => ({
    id: region.toLowerCase().replace(/\s+/g, "-"),
    label: `${region} Manager`,
    region
  }));

const initialMessages: ChatMessage[] = [];

const managerMeetings: ManagerMeeting[] = [
  {
    id: "national-ops",
    title: "National Ops Standup",
    audience: "All managers",
    time: "Today 14:30",
    purpose: "Daily risk, blockers, region health and urgent action review.",
    status: "Scheduled",
    link: "https://teams.microsoft.com/"
  },
  {
    id: "region-escalation",
    title: "Region Escalation Room",
    audience: "Selected managers",
    time: "On demand",
    purpose: "Open a focused meeting when an action item needs a quick decision.",
    status: "Ready",
    link: "https://teams.microsoft.com/"
  },
  {
    id: "weekly-productivity",
    title: "Productivity Review",
    audience: "National + region managers",
    time: "Weekly",
    purpose: "Review site scores, manager responses and improvement actions.",
    status: "Queued",
    link: "https://teams.microsoft.com/"
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

function getStoredSession() {
  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return {
      role: session?.role || "admin",
      scope: session?.scope || "National",
      label: session?.label || "Admin"
    };
  } catch {
    return { role: "admin", scope: "National", label: "Admin" };
  }
}

export default function ChatPage() {
  const [managerRecipients, setManagerRecipients] = useState<ManagerRecipient[]>(defaultManagerRecipients);
  const [mode, setMode] = useState<ChatMode>("group");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(defaultManagerRecipients.map((manager) => manager.id));
  const [draft, setDraft] = useState("");
  const [meetingNote, setMeetingNote] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    async function loadRecipients() {
      try {
        const response = await fetch("/api/admin/users", { cache: "no-store" });
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

  useEffect(() => {
    async function loadMessages() {
      try {
        const session = getStoredSession();
        const response = await fetch(`/api/chat?role=${encodeURIComponent(session.role)}&scope=${encodeURIComponent(session.scope)}`, { cache: "no-store" });
        const payload = await response.json();
        setMessages(payload.messages || []);
      } catch {
        setMessages(getStoredMessages());
      }
    }

    void loadMessages();
    window.addEventListener("storage", loadMessages);
    window.addEventListener("toc.scopechange", loadMessages);
    window.addEventListener("toc.chat.updated", loadMessages);
    const refreshInterval = window.setInterval(loadMessages, 10000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", loadMessages);
      window.removeEventListener("toc.scopechange", loadMessages);
      window.removeEventListener("toc.chat.updated", loadMessages);
    };
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

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const recipients = mode === "group"
      ? managerRecipients.map((manager) => manager.id)
      : selectedRecipients;

    const optimisticMessage = {
      id: crypto.randomUUID(),
      mode,
      author: getStoredSession().label,
      audience: mode === "group" ? "System-wide group chat" : audienceLabel,
      recipients,
      text,
      time: getNowTime(),
      own: true
    };

    setMessages((current) => [...current, optimisticMessage]);
    setDraft("");
    setSaveMessage("");

    try {
      const session = getStoredSession();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...optimisticMessage, role: session.role, scope: session.scope })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Message failed");
      setMessages(payload.messages || []);
      window.dispatchEvent(new Event("toc.chat.updated"));
    } catch {
      setSaveMessage("Message shown locally, but database save failed.");
    }
  }

  function openMeeting(meeting: ManagerMeeting) {
    window.open(meeting.link, "_blank", "noopener,noreferrer");
  }

  async function addMeetingNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = meetingNote.trim();
    if (!text) return;

    const noteMessage = {
      id: crypto.randomUUID(),
      mode: "group" as ChatMode,
      author: getStoredSession().label,
      audience: "System-wide group chat",
      recipients: managerRecipients.map((manager) => manager.id),
      text: `Meeting note: ${text}`,
      time: getNowTime(),
      own: true
    };

    setMessages((current) => [...current, noteMessage]);
    setMeetingNote("");
    try {
      const session = getStoredSession();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...noteMessage, role: session.role, scope: session.scope })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Message failed");
      setMessages(payload.messages || []);
      window.dispatchEvent(new Event("toc.chat.updated"));
    } catch {
      setSaveMessage("Meeting note shown locally, but database save failed.");
    }
  }

  return (
    <TocShell>
      <PageIntro title="Chat" detail="Ensure healthy communication between management." />
      <FlowHeading eyebrow="Chat" title="Keep manager communication clear, useful and tied to operational decisions." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Internal comms" title="Manager communications" pill="Comms routing">
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
              <div className="chat-channel-note">
                <strong>Comms status</strong>
                <small>Messages are saved to the central TOC data layer for shared manager visibility.</small>
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
                {visibleMessages.length ? null : (
                  <div className="empty-state">No messages are currently loaded for this chat route.</div>
                )}
              </div>
              {saveMessage ? <small className="admin-hint-message">{saveMessage}</small> : null}
              <form className="chat-form" onSubmit={(event) => void sendMessage(event)}>
                <input value={draft} placeholder={`Message ${audienceLabel}`} onChange={(event) => setDraft(event.target.value)} />
                <button type="submit">Send</button>
              </form>
            </div>
          </div>
          <div className="manager-meetings">
            <div className="manager-meetings-head">
              <div>
                <span className="eyebrow">Teams meetings</span>
                <strong>Manager meeting hub</strong>
                <small>Launch scheduled or on-demand manager meetings from TOC. Microsoft Graph controls will manage live meeting creation from the TOC data layer.</small>
              </div>
              <Tag>Teams routing</Tag>
            </div>
            <div className="meeting-action-strip">
              <button type="button" onClick={() => openMeeting(managerMeetings[0])}>
                <strong>Start National Ops Meeting</strong>
                <small>All managers</small>
              </button>
              <button type="button" onClick={() => selectMode("multi")}>
                <strong>Select Managers</strong>
                <small>Prepare targeted meeting</small>
              </button>
              <button type="button" onClick={() => selectMode("group")}>
                <strong>Post Meeting Note</strong>
                <small>Send note to group chat</small>
              </button>
            </div>
            <div className="manager-meeting-grid">
              {managerMeetings.map((meeting) => (
                <article key={meeting.id} className="manager-meeting-card">
                  <div>
                    <span className="eyebrow">{meeting.time}</span>
                    <strong>{meeting.title}</strong>
                    <small>{meeting.audience}</small>
                  </div>
                  <p>{meeting.purpose}</p>
                  <div className="meeting-card-footer">
                    <span>{meeting.status}</span>
                    <button type="button" onClick={() => openMeeting(meeting)}>Open Teams</button>
                  </div>
                </article>
              ))}
            </div>
            <form className="meeting-note-form" onSubmit={(event) => void addMeetingNote(event)}>
              <div>
                <span className="eyebrow">Meeting actions</span>
                <strong>Capture meeting note or action</strong>
              </div>
              <input
                value={meetingNote}
                placeholder="Example: Sydney to confirm weekend crew coverage before 3pm"
                onChange={(event) => setMeetingNote(event.target.value)}
              />
              <button type="submit">Post to Chat</button>
            </form>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
