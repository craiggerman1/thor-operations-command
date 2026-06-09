"use client";

import { useState } from "react";
import { tocFetch } from "@/lib/toc-client-auth";

const regions = ["Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"];
const cadenceOptions = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" }
] as const;

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

export function NationalRequestCommandHub() {
  const [mode, setMode] = useState<"compliance" | "action">("compliance");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [region, setRegion] = useState("Brisbane");
  const [targetRegions, setTargetRegions] = useState<string[]>(["Brisbane"]);
  const [recurring, setRecurring] = useState(false);
  const [cadence, setCadence] = useState<(typeof cadenceOptions)[number]["value"]>("monthly");
  const [intervalMonths, setIntervalMonths] = useState(1);
  const [priority, setPriority] = useState<"normal" | "high" | "urgent">("normal");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function toggleRegion(value: string) {
    setTargetRegions((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  }

  async function createComplianceItem() {
    if (!title.trim()) {
      setMessage("Add a title first.");
      return;
    }
    if (recurring && !targetRegions.length) {
      setMessage("Choose at least one region.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      const response = await tocFetch("/api/compliance", {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          all: true,
          title,
          detail,
          region,
          targetRegions: recurring ? targetRegions : [region],
          recurring,
          cadence,
          intervalMonths,
          directiveType: "National Ops Directive",
          priority,
          status: "open",
          dueDate
        })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Compliance item could not be created.");
      setTitle("");
      setDetail("");
      setMessage(recurring ? "Recurring compliance item created." : "Compliance item created.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
      window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Compliance item could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  async function createActionItem() {
    if (!title.trim()) {
      setMessage("Add a title first.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      const response = await tocFetch("/api/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          title,
          detail,
          sourcePage: "National Requests",
          directiveType: "Scheduled Directive",
          priority,
          region,
          dueDate
        })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Action item could not be created.");
      setTitle("");
      setDetail("");
      setMessage("Action item created.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
      window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action item could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="national-command-hub">
      <div className="lean-flow-head">
        <div>
          <strong>Create manager work</strong>
          <small>Raise compliance checks and action items from the same National queue.</small>
        </div>
        <div className="national-command-mode">
          <button type="button" className={mode === "compliance" ? "active" : ""} onClick={() => setMode("compliance")}>Compliance</button>
          <button type="button" className={mode === "action" ? "active" : ""} onClick={() => setMode("action")}>Action</button>
        </div>
      </div>

      <div className="national-command-form">
        <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={mode === "compliance" ? "Swab Tests Expiry Check - Woolworths Sites" : "Manager action required"} /></label>
        <label className="wide"><span>What needs to happen?</span><textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Keep this short and clear for managers." /></label>
        <label><span>Region</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
        <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as "normal" | "high" | "urgent")}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
      </div>

      {mode === "compliance" ? (
        <details className="lean-advanced-action-options">
          <summary>Recurring and multi-region options</summary>
          <div className="national-command-extra">
            <label className="setup-check-row"><input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} /><span>Make recurring</span></label>
            {recurring ? (
              <>
                <div className="region-check-grid">
                  {regions.map((item) => (
                    <label className="setup-check-row" key={item}>
                      <input type="checkbox" checked={targetRegions.includes(item)} onChange={() => toggleRegion(item)} />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
                <div className="national-command-form compact">
                  <label><span>Schedule</span><select value={cadence} onChange={(event) => setCadence(event.target.value as (typeof cadenceOptions)[number]["value"])}>{cadenceOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  {cadence === "monthly" ? <label><span>Every months</span><input type="number" min="1" max="24" value={intervalMonths} onChange={(event) => setIntervalMonths(Number(event.target.value) || 1)} /></label> : null}
                </div>
              </>
            ) : null}
          </div>
        </details>
      ) : null}

      <div className="national-command-footer">
        <button type="button" disabled={isSaving} onClick={() => void (mode === "compliance" ? createComplianceItem() : createActionItem())}>
          {isSaving ? "Creating..." : mode === "compliance" ? "Create compliance item" : "Create action item"}
        </button>
        {message ? <small>{message}</small> : null}
      </div>
    </div>
  );
}
