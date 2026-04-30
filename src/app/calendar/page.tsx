"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel, Tag } from "@/components/TocCards";
import type { CalendarJob } from "@/lib/toc-data";
import {
  calendarWeekdays,
  getCalendarDaySlug,
  getStoredCalendarWeeks,
  saveStoredCalendarWeeks,
  updateCalendarJob
} from "@/lib/calendar-utils";

type CalendarViewMode = "calendar" | "list";
type EditTarget = { daySlug: string; dayLabel: string; jobIndex: number; job: CalendarJob };
type VisibleJob = CalendarJob & { originalIndex: number };

const recurrenceOptions = ["None", "Daily", "Weekly", "Fortnightly", "4 weekly", "Custom"];

function getStoredScope() {
  if (typeof window === "undefined") return "National";
  const session = JSON.parse(localStorage.getItem("toc.session") || "null");
  return session?.scope || "National";
}

export default function CalendarPage() {
  const [scope, setScope] = useState("National");
  const [viewMode, setViewMode] = useState<CalendarViewMode>("calendar");
  const [calendarData, setCalendarData] = useState(getStoredCalendarWeeks);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const calendarDays = useMemo(() => calendarData.flatMap((week) => week), [calendarData]);
  const totalVisibleJobs = calendarDays.reduce((total, day) => total + getVisibleJobs(day.jobs).length, 0);

  function getVisibleJobs(jobs: CalendarJob[]): VisibleJob[] {
    return jobs
      .map((job, originalIndex) => ({ ...job, originalIndex }))
      .filter((job) => scope === "National" || job.location === scope || job.location === "National");
  }

  useEffect(() => {
    function syncScope(event?: Event) {
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : getStoredScope();
      setScope(nextScope);
    }

    setCalendarData(getStoredCalendarWeeks());
    syncScope();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    return () => {
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
    };
  }, []);

  function openEditor(daySlug: string, dayLabel: string, jobIndex: number, job: CalendarJob) {
    setEditTarget({ daySlug, dayLabel, jobIndex, job: { ...job, recurrence: job.recurrence || "None" } });
  }

  function updateDraft(field: keyof CalendarJob, value: string) {
    if (!editTarget) return;
    const nextJob = { ...editTarget.job, [field]: value } as CalendarJob;
    setEditTarget({ ...editTarget, job: nextJob });
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;

    const nextData = updateCalendarJob(calendarData, editTarget.daySlug, editTarget.jobIndex, editTarget.job);
    setCalendarData(nextData);
    saveStoredCalendarWeeks(nextData);
    setEditTarget(null);
  }

  return (
    <TocShell>
      <PageIntro title="Calendar" detail="Scheduled jobs by Thor operating week, starting Thursday and ending Wednesday." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Schedule view" title={`${scope} job calendar`} pill={`${totalVisibleJobs} visible jobs`}>
          <div className="calendar-toolbar" aria-label="Calendar view settings">
            <div>
              <span className="eyebrow">View setting</span>
              <strong>{viewMode === "calendar" ? "Calendar view" : "List view"}</strong>
            </div>
            <div className="segmented-control">
              <button className={viewMode === "calendar" ? "active" : ""} type="button" onClick={() => setViewMode("calendar")}>Calendar</button>
              <button className={viewMode === "list" ? "active" : ""} type="button" onClick={() => setViewMode("list")}>List</button>
            </div>
          </div>

          {viewMode === "calendar" ? (
            <div className="wall-calendar" aria-label="Scheduled jobs calendar">
              <div className="calendar-weekdays">
                {calendarWeekdays.map((day) => <strong key={day}>{day}</strong>)}
              </div>
              <div className="calendar-month-grid">
                {calendarDays.map((day) => {
                  const daySlug = getCalendarDaySlug(day);
                  const dayLabel = `${day.day} ${day.date} ${day.month}`;
                  const visibleJobs = getVisibleJobs(day.jobs);
                  return (
                    <article className={`calendar-date ${day.today ? "today" : ""}`} key={daySlug}>
                      <div className="calendar-date-head">
                        <span><strong>{day.date}</strong><em>{day.month}</em></span>
                        <small>{visibleJobs.length ? `${visibleJobs.length} jobs` : "No jobs"}</small>
                      </div>
                      <span className="calendar-week-label">{day.week}</span>
                      <div className="calendar-date-jobs">
                        {visibleJobs.slice(0, 6).map((job) => (
                          <button className={`calendar-job-pill ${job.severity}`} key={`${day.date}-${job.time}-${job.site}`} type="button" onClick={() => openEditor(daySlug, dayLabel, job.originalIndex, job)}>
                            <span>{job.time}</span>
                            <strong>{job.location}</strong>
                            <small>{job.site}</small>
                          </button>
                        ))}
                        {visibleJobs.length > 6 ? <small className="calendar-more-count">+{visibleJobs.length - 6} more shifts</small> : null}
                      </div>
                      <Link className="calendar-day-link" href={`/calendar/${daySlug}`}>Open day</Link>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="calendar-list-view">
              {calendarDays.map((day) => {
                const daySlug = getCalendarDaySlug(day);
                const dayLabel = `${day.day} ${day.date} ${day.month}`;
                const visibleJobs = getVisibleJobs(day.jobs);
                return (
                  <article className="calendar-list-day" key={daySlug}>
                    <div>
                      <span className="calendar-week-label">{day.week}</span>
                      <strong>{dayLabel}</strong>
                      <small>{visibleJobs.length ? `${visibleJobs.length} visible jobs for ${scope}` : `No visible jobs for ${scope}`}</small>
                    </div>
                    <div className="calendar-list-jobs">
                      {visibleJobs.slice(0, 4).map((job) => (
                        <button className={`calendar-list-edit ${job.severity}`} type="button" key={`${day.date}-${job.time}-${job.site}`} onClick={() => openEditor(daySlug, dayLabel, job.originalIndex, job)}>
                          {job.time} {job.location}
                        </button>
                      ))}
                      {visibleJobs.length > 4 ? <Tag>+{visibleJobs.length - 4} more</Tag> : null}
                      <Link className="calendar-day-link" href={`/calendar/${daySlug}`}>Open day</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

        {editTarget ? (
          <Panel wide eyebrow="Edit schedule" title={`Edit job - ${editTarget.dayLabel}`} pill={editTarget.job.recurrence || "None"}>
            <form className="calendar-edit-form" onSubmit={saveDraft}>
              <label><span>Time</span><input value={editTarget.job.time} onChange={(event) => updateDraft("time", event.target.value)} /></label>
              <label><span>Location</span><input value={editTarget.job.location} onChange={(event) => updateDraft("location", event.target.value)} /></label>
              <label><span>Site</span><input value={editTarget.job.site} onChange={(event) => updateDraft("site", event.target.value)} /></label>
              <label><span>Crew</span><input value={editTarget.job.crew} onChange={(event) => updateDraft("crew", event.target.value)} /></label>
              <label><span>Job</span><input value={editTarget.job.job} onChange={(event) => updateDraft("job", event.target.value)} /></label>
              <label><span>Status</span><input value={editTarget.job.status} onChange={(event) => updateDraft("status", event.target.value)} /></label>
              <label><span>Risk colour</span><select value={editTarget.job.severity} onChange={(event) => updateDraft("severity", event.target.value)}>
                <option value="green">Green</option>
                <option value="amber">Amber</option>
                <option value="red">Red</option>
              </select></label>
              <label><span>Recurring</span><select value={editTarget.job.recurrence || "None"} onChange={(event) => updateDraft("recurrence", event.target.value)}>
                {recurrenceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select></label>
              {editTarget.job.recurrence === "Custom" ? <label className="calendar-edit-wide"><span>Custom recurrence</span><input value={editTarget.job.recurrenceDetail || ""} placeholder="Example: every 3 weeks on Saturday night" onChange={(event) => updateDraft("recurrenceDetail", event.target.value)} /></label> : null}
              <label className="calendar-edit-wide"><span>Notes</span><textarea value={editTarget.job.notes} onChange={(event) => updateDraft("notes", event.target.value)} /></label>
              <div className="calendar-edit-actions">
                <button type="submit">Save job</button>
                <button type="button" onClick={() => setEditTarget(null)}>Cancel</button>
              </div>
            </form>
          </Panel>
        ) : null}
      </section>
    </TocShell>
  );
}
