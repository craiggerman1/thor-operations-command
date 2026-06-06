"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([]);

  function applyPayload(payload: { register: ComplianceRegisterItem[]; actions: ComplianceActionItem[]; schedules: ComplianceScheduleItem[] }) {
    setItems(payload.register);
    setActions(payload.actions);
    setSchedules(payload.schedules);
    setSelectedScheduleIds((current) => current.filter((id) => payload.schedules.some((schedule) => schedule.id === id)));
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

  const scheduleGroups = useMemo(() => {
    const lookup = new Map<string, ComplianceScheduleItem[]>();
    schedules.forEach((schedule) => {
      const key = `${schedule.title}||${schedule.detail}||${schedule.cadence}||${schedule.nextDueDate}||${schedule.priority}`;
      lookup.set(key, [...(lookup.get(key) || []), schedule]);
    });

    return Array.from(lookup.entries()).map(([key, groupSchedules]) => ({
      key,
      title: groupSchedules[0]?.title || "Recurring compliance schedule",
      detail: groupSchedules[0]?.detail || "",
      cadence: groupSchedules[0]?.cadence || "",
      nextDueDate: groupSchedules[0]?.nextDueDate || "",
      priority: groupSchedules[0]?.priority || "normal",
      schedules: groupSchedules.sort((first, second) => first.region.localeCompare(second.region))
    }));
  }, [schedules]);

  function toggleSchedule(id: string) {
    setSelectedScheduleIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function setGroupSelected(ids: string[], selected: boolean) {
    setSelectedScheduleIds((current) => {
      const existing = new Set(current);
      ids.forEach((id) => selected ? existing.add(id) : existing.delete(id));
      return Array.from(existing);
    });
  }

  async function deleteSchedules(ids: string[], label = "selected recurring compliance schedules") {
    const cleanIds = Array.from(new Set(ids)).filter(Boolean);
    if (!cleanIds.length) {
      setMessage("Select at least one recurring schedule first.");
      return;
    }
    if (!window.confirm(`Stop ${cleanIds.length} ${label}? Existing action items stay visible until they are closed or deleted individually.`)) return;
    setMessage("");
    try {
      const payload = await mutateCompliance({ action: "deleteSchedule", all: true, ids: cleanIds });
      applyPayload(payload);
      setMessage(`${cleanIds.length} recurring schedule${cleanIds.length === 1 ? "" : "s"} stopped.`);
      window.dispatchEvent(new Event("toc.actionState.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not stop recurring compliance schedules.");
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
            <div className="admin-list-head">
              <div>
                <strong>Recurring compliance schedules</strong>
                <small>{scheduleGroups.length} grouped schedules. {selectedScheduleIds.length} selected.</small>
              </div>
              <div className="admin-action-controls">
                <button type="button" onClick={() => setGroupSelected(schedules.map((schedule) => schedule.id), true)}>Select All</button>
                <button type="button" onClick={() => setGroupSelected(schedules.map((schedule) => schedule.id), false)}>Clear</button>
                <button type="button" className="danger-button" onClick={() => void deleteSchedules(selectedScheduleIds)}>Stop Selected</button>
              </div>
            </div>
            {scheduleGroups.map((group) => {
              const groupIds = group.schedules.map((schedule) => schedule.id);
              const selectedCount = groupIds.filter((id) => selectedScheduleIds.includes(id)).length;

              return (
              <article className="admin-action-card" key={group.key}>
                <div className="admin-action-card-head">
                  <div>
                    <strong>{group.title}</strong>
                    <small>{group.schedules.length} regions - {group.cadence} - next due {group.nextDueDate}</small>
                  </div>
                  <Tag tone={group.priority === "urgent" || group.priority === "high" ? "red" : "blue"}>{group.priority}</Tag>
                </div>
                <p>{group.detail}</p>
                <div className="recurring-region-list">
                  {group.schedules.map((schedule) => (
                    <label className="setup-check-row" key={schedule.id}>
                      <input type="checkbox" checked={selectedScheduleIds.includes(schedule.id)} onChange={() => toggleSchedule(schedule.id)} />
                      <span>{schedule.region}</span>
                    </label>
                  ))}
                </div>
                <div className="admin-action-controls">
                  <button type="button" onClick={() => setGroupSelected(groupIds, selectedCount !== groupIds.length)}>{selectedCount === groupIds.length ? "Clear Group" : "Select Group"}</button>
                  <button type="button" className="danger-button" onClick={() => void deleteSchedules(groupIds, `${group.title} schedules`)}>Stop Whole Group</button>
                  <button type="button" className="danger-button" disabled={!selectedCount} onClick={() => void deleteSchedules(groupIds.filter((id) => selectedScheduleIds.includes(id)), `${group.title} selected schedules`)}>Stop Selected In Group</button>
                </div>
              </article>
            );})}
          </div>
        ) : null}
      </div>
    </div>
  );
}
