"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";

type ComplianceRegisterItem = {
  id: string;
  title: string;
  detail: string;
  region: string;
  status: string;
  dueDate: string;
  actionHref: string;
};

type ComplianceActionItem = {
  id: string;
  title: string;
  directive: "National Ops Directive" | "Scheduled Directive" | "To Do";
  region: string;
  severity: "red" | "amber" | "green" | "blue";
  dueDate: string;
};

type ComplianceScheduleItem = {
  id: string;
  title: string;
  detail: string;
  region: string;
  cadence: string;
  nextDueDate: string;
  lastGeneratedDate: string;
  priority: string;
};

const regions = ["National", "Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"];
const managerRegions = regions.filter((item) => item !== "National");
const directiveTypes = ["National Ops Directive", "Scheduled Directive", "To Do"] as const;
const priorities = ["urgent", "high", "normal", "low"] as const;
const recurrenceCadences = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" }
] as const;
const statusOptions = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "complete", label: "Complete" }
] as const;

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

async function fetchCompliance() {
  const response = await tocFetch("/api/compliance?all=true", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Compliance database read failed.");
  return {
    register: (payload.register || []) as ComplianceRegisterItem[],
    actions: (payload.actions || []) as ComplianceActionItem[],
    schedules: (payload.schedules || []) as ComplianceScheduleItem[]
  };
}

async function mutateCompliance(body: Record<string, unknown>) {
  const response = await tocFetch("/api/compliance", {
    method: "POST",
    body: JSON.stringify(body)
  }, true);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Compliance update failed.");
  return {
    register: (payload.register || []) as ComplianceRegisterItem[],
    actions: (payload.actions || []) as ComplianceActionItem[],
    schedules: (payload.schedules || []) as ComplianceScheduleItem[]
  };
}

export function AdminComplianceManager() {
  const [items, setItems] = useState<ComplianceRegisterItem[]>([]);
  const [actions, setActions] = useState<ComplianceActionItem[]>([]);
  const [schedules, setSchedules] = useState<ComplianceScheduleItem[]>([]);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [region, setRegion] = useState("Brisbane");
  const [targetRegions, setTargetRegions] = useState<string[]>(["Brisbane"]);
  const [directiveType, setDirectiveType] = useState<(typeof directiveTypes)[number]>("Scheduled Directive");
  const [priority, setPriority] = useState<(typeof priorities)[number]>("normal");
  const [status, setStatus] = useState("open");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [isRecurring, setIsRecurring] = useState(false);
  const [cadence, setCadence] = useState<(typeof recurrenceCadences)[number]["value"]>("monthly");
  const [intervalMonths, setIntervalMonths] = useState(1);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function applyPayload(payload: { register: ComplianceRegisterItem[]; actions: ComplianceActionItem[]; schedules: ComplianceScheduleItem[] }) {
    setItems(payload.register);
    setActions(payload.actions);
    setSchedules(payload.schedules);
  }

  useEffect(() => {
    fetchCompliance()
      .then(applyPayload)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  async function createItem() {
    if (!title.trim()) {
      setMessage("Add a compliance title first.");
      return;
    }
    if (isRecurring && !targetRegions.length) {
      setMessage("Choose at least one region for the recurring compliance action.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      const payload = await mutateCompliance({
        action: "create",
        all: true,
        title,
        detail,
        region,
        targetRegions: isRecurring ? targetRegions : [region],
        recurring: isRecurring,
        cadence,
        intervalMonths,
        directiveType,
        priority,
        status,
        dueDate
      });
      applyPayload(payload);
      setTitle("");
      setDetail("");
      setMessage(isRecurring ? "Recurring compliance actions created and linked to Action Centre." : "Compliance item created and linked to Action Centre.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create compliance item.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateItem(id: string, updates: Record<string, unknown>, successMessage: string) {
    setMessage("");
    try {
      const payload = await mutateCompliance({ action: "update", all: true, id, updates });
      applyPayload(payload);
      setMessage(successMessage);
      window.dispatchEvent(new Event("toc.actionState.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update compliance item.");
    }
  }

  async function deleteItem(id: string) {
    if (!window.confirm("Are you sure you want to delete this compliance item?")) return;
    setMessage("");
    try {
      const payload = await mutateCompliance({ action: "delete", all: true, id });
      applyPayload(payload);
      setMessage("Compliance item deleted.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete compliance item.");
    }
  }

  function toggleTargetRegion(nextRegion: string) {
    setTargetRegions((current) => current.includes(nextRegion)
      ? current.filter((item) => item !== nextRegion)
      : [...current, nextRegion]);
  }

  return (
    <div className="admin-action-console">
      <div className="admin-action-form">
        <div>
          <strong>Create compliance item</strong>
          <small>Creates a compliance register item and linked Action Centre close-out for the assigned manager region.</small>
        </div>
        <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Compliance item" /></label>
        <label><span>Detail</span><textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="What must be completed or verified" /></label>
        <div className="admin-action-grid">
          <label><span>Region</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>Directive</span><select value={directiveType} onChange={(event) => setDirectiveType(event.target.value as (typeof directiveTypes)[number])}>{directiveTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as (typeof priorities)[number])}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
        </div>
        <div className="recurring-action-panel">
          <label className="setup-check-row">
            <input type="checkbox" checked={isRecurring} onChange={(event) => setIsRecurring(event.target.checked)} />
            <span>Make this a recurring manager action</span>
          </label>
          {isRecurring ? (
            <>
              <div>
                <strong>Target regions</strong>
                <small>Each selected region receives its own Action Centre item on the schedule.</small>
              </div>
              <div className="region-check-grid">
                {managerRegions.map((item) => (
                  <label className="setup-check-row" key={item}>
                    <input type="checkbox" checked={targetRegions.includes(item)} onChange={() => toggleTargetRegion(item)} />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
              <div className="admin-action-grid">
                <label><span>Schedule</span><select value={cadence} onChange={(event) => setCadence(event.target.value as (typeof recurrenceCadences)[number]["value"])}>{recurrenceCadences.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                {cadence === "monthly" ? <label><span>Every months</span><input type="number" min="1" max="24" value={intervalMonths} onChange={(event) => setIntervalMonths(Number(event.target.value) || 1)} /></label> : null}
              </div>
            </>
          ) : null}
        </div>
        <button type="button" onClick={createItem} disabled={isSaving}>{isSaving ? "Creating..." : "Create Compliance Item"}</button>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
      <div className="admin-action-list">
        <div className="admin-list-head">
          <div>
            <strong>Compliance register</strong>
            <small>{items.length} register items. {actions.length} open action links.</small>
          </div>
        </div>
        {items.map((item) => (
          <article className="admin-action-card" key={item.id}>
            <div className="admin-action-card-head">
              <div>
                <strong>{item.title}</strong>
                <small>{item.region} - Due {item.dueDate}</small>
              </div>
              <Tag>{item.status}</Tag>
            </div>
            <p>{item.detail}</p>
            <div className="admin-action-controls">
              <select value={statusOptions.find((option) => option.label === item.status)?.value || "open"} onChange={(event) => void updateItem(item.id, { status: event.target.value }, "Compliance status updated.")}>
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button type="button" onClick={() => void updateItem(item.id, { priority: "urgent", directiveType: "National Ops Directive" }, "Compliance item escalated.")}>Escalate</button>
              <button type="button" className="danger-button" onClick={() => void deleteItem(item.id)}>Delete</button>
            </div>
          </article>
        ))}
        {items.length ? null : <div className="empty-state">No compliance register items are currently loaded from the database.</div>}
        {schedules.length ? (
          <div className="recurring-action-list">
            <strong>Recurring compliance schedules</strong>
            {schedules.map((schedule) => (
              <article className="admin-action-card" key={schedule.id}>
                <div className="admin-action-card-head">
                  <div>
                    <strong>{schedule.title}</strong>
                    <small>{schedule.region} - {schedule.cadence} - next due {schedule.nextDueDate}</small>
                  </div>
                  <Tag tone={schedule.priority === "urgent" || schedule.priority === "high" ? "red" : "blue"}>{schedule.priority}</Tag>
                </div>
                <p>{schedule.detail}</p>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
