"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { CalendarJobEditor } from "@/components/CalendarJobEditor";
import type { CalendarEditTarget } from "@/components/CalendarJobEditor";
import type { CalendarDay, CalendarJob } from "@/lib/toc-data";
import {
  calendarWeekdays,
  getCalendarDaySlug,
  getVisibleCalendarDays,
  isCurrentCalendarDay,
  updateCalendarJob
} from "@/lib/calendar-utils";
import { calendarWeeks } from "@/lib/toc-data";
import { getCalendarForecast } from "@/lib/calendar-weather";
import type { TocWeatherDay, TocWeatherPayload } from "@/lib/weather";

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
  const router = useRouter();
  const [scope, setScope] = useState("National");
  const [viewMode, setViewMode] = useState<CalendarViewMode>("calendar");
  const [calendarData, setCalendarData] = useState<CalendarDay[][]>(calendarWeeks.map((week) => week.map((day) => ({ ...day, jobs: [] }))));
  const [editTarget, setEditTarget] = useState<CalendarEditTarget | null>(null);
  const [weatherForecast, setWeatherForecast] = useState<TocWeatherDay[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const calendarDays = useMemo(() => getVisibleCalendarDays(calendarData), [calendarData]);
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

    async function syncCalendar() {
      try {
        const response = await fetch("/api/calendar", { cache: "no-store" });
        const payload = await response.json();
        setCalendarData(payload.weeks || []);
      } catch {
        setCalendarData(calendarWeeks.map((week) => week.map((day) => ({ ...day, jobs: [] }))));
      }
    }

    void syncCalendar();
    syncScope();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    return () => {
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    fetch(`/api/weather?scope=${encodeURIComponent(scope)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Weather feed unavailable")))
      .then((payload: TocWeatherPayload) => {
        if (!isActive) return;
        setWeatherForecast(payload.forecast || []);
      })
      .catch(() => {
        if (!isActive) return;
        setWeatherForecast([]);
      });

    return () => {
      isActive = false;
    };
  }, [scope]);

  function openEditor(daySlug: string, dayLabel: string, jobIndex: number, job: CalendarJob) {
    setEditTarget({ daySlug, dayLabel, jobIndex, job: { ...job, recurrence: job.recurrence || "None", recurrenceIntervalWeeks: job.recurrenceIntervalWeeks || 3 } });
    setSaveMessage("");
  }

  function openDay(daySlug: string) {
    router.push(`/calendar/${daySlug}`);
  }

  function openDayFromKeyboard(event: KeyboardEvent<HTMLElement>, daySlug: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDay(daySlug);
    }
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
    setEditTarget(null);
    setSaveMessage("Calendar job updated.");

    if (editTarget.job.id) {
      fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: editTarget.job.id, job: jobToSave })
      })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Calendar update failed")))
        .then((payload) => {
          setCalendarData(payload.weeks || nextData);
          setSaveMessage("Calendar job saved to the database.");
        })
        .catch(() => setSaveMessage("Calendar job updated on screen, but database save failed."));
    }
  }

  return (
    <TocShell>
      <PageIntro title="Calendar" detail="Scheduled jobs by Thor operating week" />
      <FlowHeading eyebrow="Calendar" title="Click a day to manage the full schedule, or click a job to quick edit it." />
      <section className="command-grid route-grid">
        <Panel wide className="calendar-panel" eyebrow="Schedule view" title={`${scope} job calendar`} pill={`${totalVisibleJobs} visible jobs`}>
          <div className="calendar-toolbar" aria-label="Calendar view settings">
            <div>
              <span className="eyebrow">View setting</span>
              <strong>{viewMode === "calendar" ? "Calendar view" : "List view"}</strong>
              <small>{scope} schedule. Days open into the detailed job view.</small>
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
                  const forecast = getCalendarForecast(day, scope, weatherForecast);
                  const isToday = isCurrentCalendarDay(day);
                  return (
                    <article
                      className={`calendar-date ${isToday ? "today" : ""}`}
                      key={daySlug}
                      onClick={() => openDay(daySlug)}
                      onKeyDown={(event) => openDayFromKeyboard(event, daySlug)}
                      role="button"
                      tabIndex={0}
                    >
                      {isToday ? <span className="today-marker">Today</span> : null}
                      <div className="calendar-date-head">
                        <span><strong>{day.date}</strong><em>{day.month}</em><i className="calendar-week-label">{day.week}</i></span>
                        {forecast ? (
                          <span className={`calendar-weather-chip ${forecast.icon}`} title={forecast.label} aria-label={forecast.label}>
                            <i className={`calendar-weather-icon ${forecast.icon}`} aria-hidden="true" />
                            <em>{forecast.condition}</em>
                          </span>
                        ) : null}
                        <small>{visibleJobs.length ? `${visibleJobs.length} jobs` : "No jobs"}</small>
                      </div>
                      <div className="calendar-date-jobs">
                        {visibleJobs.slice(0, 5).map((job) => (
                          <button className={`calendar-job-pill ${job.severity}`} key={`${day.date}-${job.time}-${job.site}`} type="button" onClick={(event) => { event.stopPropagation(); openEditor(daySlug, dayLabel, job.originalIndex, job); }}>
                            <span>{job.time}</span>
                            <strong>{job.location}</strong>
                            <small>{job.site}</small>
                          </button>
                        ))}
                        {visibleJobs.length > 5 ? <small className="calendar-more-count">+{visibleJobs.length - 5} more shifts</small> : null}
                      </div>
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
                const forecast = getCalendarForecast(day, scope, weatherForecast);
                return (
                  <article
                    className="calendar-list-day"
                    key={daySlug}
                    onClick={() => openDay(daySlug)}
                    onKeyDown={(event) => openDayFromKeyboard(event, daySlug)}
                    role="button"
                    tabIndex={0}
                  >
                    <div>
                      <strong>{dayLabel} <span className="calendar-week-label">{day.week}</span>{forecast ? <span className={`calendar-weather-chip inline ${forecast.icon}`} title={forecast.label} aria-label={forecast.label}><i className={`calendar-weather-icon ${forecast.icon}`} aria-hidden="true" /><em>{forecast.condition}</em></span> : null}</strong>
                      <small>{visibleJobs.length ? `${visibleJobs.length} visible jobs for ${scope}` : `No visible jobs for ${scope}`}</small>
                    </div>
                    <div className="calendar-list-jobs">
                      {visibleJobs.slice(0, 6).map((job) => (
                        <button className={`calendar-list-edit ${job.severity}`} type="button" key={`${day.date}-${job.time}-${job.site}`} onClick={(event) => { event.stopPropagation(); openEditor(daySlug, dayLabel, job.originalIndex, job); }}>
                          {job.time} {job.location}
                        </button>
                      ))}
                      {visibleJobs.length > 6 ? <small className="calendar-more-count">+{visibleJobs.length - 6} more jobs</small> : null}
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
