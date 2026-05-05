"use client";

import { useEffect, useMemo, useState } from "react";
import { Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";

type AdminCalendarJob = {
  id: string;
  date: string;
  time: string;
  location: string;
  site: string;
  crew: string;
  job: string;
  status: string;
  notes: string;
  severity: "red" | "amber" | "green" | "blue";
  recurrence: string;
  recurrenceIntervalWeeks?: number;
};

const regions = ["National", "Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"];
const severityOptions = ["green", "amber", "red", "blue"] as const;
const recurrenceOptions = ["None", "Daily", "Weekly", "Fortnightly", "4 weekly", "Custom"];

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchCalendarJobs() {
  const response = await fetch("/api/calendar?all=true", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Calendar database read failed.");
  return (payload.jobs || []) as AdminCalendarJob[];
}

async function mutateCalendar(body: Record<string, unknown>) {
  const response = await tocFetch("/api/calendar", {
    method: "POST",
    body: JSON.stringify(body)
  }, true);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Calendar update failed.");
  return (payload.jobs || []) as AdminCalendarJob[];
}

export function AdminCalendarManager() {
  const [jobs, setJobs] = useState<AdminCalendarJob[]>([]);
  const [date, setDate] = useState(todayInput());
  const [time, setTime] = useState("07:00");
  const [location, setLocation] = useState("Brisbane");
  const [site, setSite] = useState("");
  const [crew, setCrew] = useState("");
  const [job, setJob] = useState("");
  const [status, setStatus] = useState("Scheduled");
  const [notes, setNotes] = useState("");
  const [severity, setSeverity] = useState<(typeof severityOptions)[number]>("green");
  const [recurrence, setRecurrence] = useState("None");
  const [recurrenceIntervalWeeks, setRecurrenceIntervalWeeks] = useState("3");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const upcomingJobs = useMemo(() => [...jobs].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).slice(0, 12), [jobs]);

  useEffect(() => {
    fetchCalendarJobs()
      .then(setJobs)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  async function createJob() {
    if (!job.trim()) {
      setMessage("Add a job title first.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      const nextJobs = await mutateCalendar({ action: "create", date, time, location, site, crew, job, status, notes, severity, recurrence, recurrenceIntervalWeeks: recurrence === "Custom" ? Number(recurrenceIntervalWeeks) : undefined, all: true });
      setJobs(nextJobs);
      setSite("");
      setCrew("");
      setJob("");
      setNotes("");
      setMessage("Calendar job created.");
      window.dispatchEvent(new Event("toc.calendar.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create calendar job.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteJob(id: string) {
    if (!window.confirm("Are you sure you want to delete this calendar job?")) return;
    setMessage("");
    try {
      const nextJobs = await mutateCalendar({ action: "delete", id, all: true });
      setJobs(nextJobs);
      setMessage("Calendar job deleted.");
      window.dispatchEvent(new Event("toc.calendar.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete calendar job.");
    }
  }

  return (
    <div className="admin-action-console">
      <div className="admin-action-form">
        <div>
          <strong>Create scheduled job</strong>
          <small>Jobs created here appear in the Calendar page and day-detail schedule.</small>
        </div>
        <div className="admin-action-grid">
          <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label><span>Time</span><input value={time} onChange={(event) => setTime(event.target.value)} placeholder="07:00" /></label>
          <label><span>Location</span><select value={location} onChange={(event) => setLocation(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Risk colour</span><select value={severity} onChange={(event) => setSeverity(event.target.value as (typeof severityOptions)[number])}>{severityOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>
        <label><span>Job</span><input value={job} onChange={(event) => setJob(event.target.value)} placeholder="Scheduled job title" /></label>
        <label><span>Site</span><input value={site} onChange={(event) => setSite(event.target.value)} placeholder="Customer / site" /></label>
        <label><span>Crew</span><input value={crew} onChange={(event) => setCrew(event.target.value)} placeholder="Assigned crew" /></label>
        <div className="admin-action-grid">
          <label><span>Status</span><input value={status} onChange={(event) => setStatus(event.target.value)} /></label>
          <label><span>Recurring</span><select value={recurrence} onChange={(event) => setRecurrence(event.target.value)}>{recurrenceOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        {recurrence === "Custom" ? <label><span>Repeat every weeks</span><input type="number" min="1" value={recurrenceIntervalWeeks} onChange={(event) => setRecurrenceIntervalWeeks(event.target.value)} /></label> : null}
        <label><span>Notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Manager notes or schedule details" /></label>
        <button type="button" onClick={createJob} disabled={isSaving}>{isSaving ? "Creating..." : "Create Calendar Job"}</button>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
      <div className="admin-action-list">
        <div className="admin-list-head">
          <div>
            <strong>Scheduled jobs</strong>
            <small>{jobs.length} jobs loaded from Supabase.</small>
          </div>
        </div>
        {upcomingJobs.map((item) => (
          <article className="admin-action-card" key={item.id}>
            <div className="admin-action-card-head">
              <div>
                <strong>{item.job}</strong>
                <small>{item.date} at {item.time} - {item.location}</small>
              </div>
              <Tag tone={item.severity}>{item.status}</Tag>
            </div>
            <p>{item.site || "No site supplied"} - {item.crew || "No crew assigned"}</p>
            <div className="admin-action-controls">
              <button type="button" className="danger-button" onClick={() => void deleteJob(item.id)}>Delete</button>
            </div>
          </article>
        ))}
        {upcomingJobs.length ? null : <div className="empty-state">No scheduled jobs are currently loaded from the database.</div>}
      </div>
    </div>
  );
}
