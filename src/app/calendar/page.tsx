"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel, Tag } from "@/components/TocCards";
import { CalendarJobEditor } from "@/components/CalendarJobEditor";
import type { CalendarEditTarget } from "@/components/CalendarJobEditor";
import type { CalendarJob } from "@/lib/toc-data";
import {
  calendarWeekdays,
  getCalendarDaySlug,
  getStoredCalendarWeeks,
  saveStoredCalendarWeeks,
  updateCalendarJob
} from "@/lib/calendar-utils";

type CalendarViewMode = "calendar" | "list";
type VisibleJob = CalendarJob & { originalIndex: number };

function getStoredScope() {
  if (typeof window === "undefined") return "National";
  const session = JSON.parse(localStorage.getItem("toc.session") || "null");
  return session?.scope || "National";
}

function cleanEditableJob(job: CalendarJob & { originalIndex?: number }): CalendarJob {
  return {
    time: job.time,
    location: job.location,
    site: job.site,
    crew: job.crew,
    job: job.job,
    status: job.status,
    notes: job.notes,
    severity: job.severity,
    recurrence: job.recurrence,
    recurrenceDetail: job.recurrenceDetail,
    recurrenceIntervalWeeks: job.recurrenceIntervalWeeks
  };
}

export default function CalendarPage() {
  const [scope, setScope] = useState("National");
  const [viewMode, setViewMode] = useState<CalendarViewMode>("calendar");
  const [calendarData, setCalendarData] = useState(getStoredCalendarWeeks);
  const [editTarget, setEditTarget] = useState<CalendarEditTarget | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
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
    setEditTarget({ daySlug, dayLabel, jobIndex, job: { ...job, recurrence: job.recurrence || "None", recurrenceIntervalWeeks: job.recurrenceIntervalWeeks || 3 } });
    setSaveMessage("");
  }

  function updateDraft(field: keyof CalendarJob, value: string | number | undefined) {
    if (!editTarget) return;
    const nextJob = { ...editTarget.job, [field]: value } as CalendarJob;
    if (field === "recurrence" && value !== "Custom") {
      delete nextJob.recurrenceIntervalWeeks;
    }
    setEditTarget({ ...editTarget, job: nextJob });
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;

    const jobToSave = cleanEditableJob(editTarget.job as CalendarJob & { originalIndex?: number });
    const nextData = updateCalendarJob(calendarData, editTarget.daySlug, editTarget.jobIndex, jobToSave);
    setCalendarData(nextData);
    saveStoredCalendarWeeks(nextData);
    setEditTarget(null);
    setSaveMessage("Calendar job updated for this browser.");
  }

  return (
    <TocShell>
      <PageIntro title="Calendar" detail="Scheduled jobs by Thor operating week." />
      <section className="command-grid route-grid">
        <Panel wide className="calendar-panel" eyebrow="Schedule view" title={`${scope} job calendar`} pill={`${totalVisibleJobs} visible jobs`}>
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

          {saveMessage ? <div className="calendar-save-message">{saveMessage}</div> : null}

          {editTarget ? (
            <CalendarJobEditor editTarget={editTarget} onCancel={() => setEditTarget(null)} onSave={saveDraft} onUpdate={updateDraft} />
          ) : null}

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
                        <span><strong>{day.date}</strong><em>{day.month}</em><i className="calendar-week-label">{day.week}</i></span>
                        <small>{visibleJobs.length ? `${visibleJobs.length} jobs` : "No jobs"}</small>
                      </div>
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
                      <strong>{dayLabel} <span className="calendar-week-label">{day.week}</span></strong>
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

      </section>
    </TocShell>
  );
}
