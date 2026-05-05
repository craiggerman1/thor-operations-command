"use client";

import { useEffect, useMemo, useState } from "react";
import { Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";

type AdminActionItem = {
  id: string;
  title: string;
  detail: string;
  source: string;
  directive: "National Ops Directive" | "Scheduled Directive" | "To Do";
  region: string;
  severity: "red" | "amber" | "green" | "blue";
  dueDate: string;
  status: string;
};

const regions = ["National", "Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"];
const sourcePages = ["Action Centre", "Compliance", "Productivity", "Equipment Servicing", "Stock Orders", "Jobsheets", "Calendar", "Staff Availability", "To Do"];
const directiveTypes = ["National Ops Directive", "Scheduled Directive", "To Do"] as const;
const priorities = ["urgent", "high", "normal", "low"] as const;

function toInputDate(value: string) {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return value && !value.includes("No due") ? value : date.toISOString().slice(0, 10);
}

async function fetchActions() {
  const response = await fetch("/api/actions", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Action item database read failed.");
  return (payload.actions || []) as AdminActionItem[];
}

async function mutateAction(body: Record<string, unknown>) {
  const response = await tocFetch("/api/actions", {
    method: "POST",
    body: JSON.stringify(body)
  }, true);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Action item update failed.");
  return (payload.actions || []) as AdminActionItem[];
}

export function AdminActionManager() {
  const [actions, setActions] = useState<AdminActionItem[]>([]);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [sourcePage, setSourcePage] = useState("Action Centre");
  const [directiveType, setDirectiveType] = useState<(typeof directiveTypes)[number]>("Scheduled Directive");
  const [priority, setPriority] = useState<(typeof priorities)[number]>("normal");
  const [region, setRegion] = useState("Brisbane");
  const [dueDate, setDueDate] = useState(toInputDate(""));
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const openActions = useMemo(() => actions.filter((item) => item.status !== "Closed"), [actions]);

  useEffect(() => {
    fetchActions()
      .then(setActions)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  async function createAction() {
    if (!title.trim()) {
      setMessage("Add an action title first.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      const nextActions = await mutateAction({ action: "create", title, detail, sourcePage, directiveType, priority, region, dueDate });
      setActions(nextActions);
      setTitle("");
      setDetail("");
      setMessage("Action item issued to the Action Centre.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
      window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not issue action item.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateAction(id: string, updates: Record<string, unknown>, successMessage: string) {
    setMessage("");
    try {
      const nextActions = await mutateAction({ action: "update", id, updates });
      setActions(nextActions);
      setMessage(successMessage);
      window.dispatchEvent(new Event("toc.actionState.updated"));
      window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update action item.");
    }
  }

  async function deleteAction(id: string) {
    if (!window.confirm("Are you sure you want to delete this action item?")) return;
    setMessage("");
    try {
      const nextActions = await mutateAction({ action: "delete", id });
      setActions(nextActions);
      setMessage("Action item deleted.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
      window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete action item.");
    }
  }

  return (
    <div className="admin-action-console">
      <div className="admin-action-form">
        <div>
          <strong>Issue action item</strong>
          <small>Create manager directives that feed into Action Centre, Region Health and page badges.</small>
        </div>
        <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Action required" /></label>
        <label><span>Detail</span><textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="What the manager needs to do" /></label>
        <div className="admin-action-grid">
          <label><span>Target region</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Source page</span><select value={sourcePage} onChange={(event) => setSourcePage(event.target.value)}>{sourcePages.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Directive</span><select value={directiveType} onChange={(event) => setDirectiveType(event.target.value as (typeof directiveTypes)[number])}>{directiveTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as (typeof priorities)[number])}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
        </div>
        <button type="button" onClick={createAction} disabled={isSaving}>{isSaving ? "Issuing..." : "Issue Action Item"}</button>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
      <div className="admin-action-list">
        <div className="admin-list-head">
          <div>
            <strong>Open action items</strong>
            <small>{openActions.length} currently active across TOC.</small>
          </div>
        </div>
        {openActions.map((item) => (
          <article className="admin-action-card" key={item.id}>
            <div className="admin-action-card-head">
              <div>
                <strong>{item.title}</strong>
                <small>{item.region} - Due {item.dueDate}</small>
              </div>
              <Tag tone={item.severity}>{item.directive}</Tag>
            </div>
            <p>{item.detail}</p>
            <div className="admin-action-controls">
              <select value={item.status === "Returned to manager" ? "returned_to_manager" : "open"} onChange={(event) => void updateAction(item.id, { status: event.target.value }, "Action status updated.")}>
                <option value="open">Open</option>
                <option value="returned_to_manager">Returned to manager</option>
              </select>
              <button type="button" onClick={() => void updateAction(item.id, { status: "closed" }, "Action item closed.")}>Close</button>
              <button type="button" className="danger-button" onClick={() => void deleteAction(item.id)}>Delete</button>
            </div>
          </article>
        ))}
        {openActions.length ? null : <div className="empty-state">No database action items are currently open.</div>}
      </div>
    </div>
  );
}
