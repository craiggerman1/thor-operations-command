"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel, Tag } from "@/components/TocCards";
import { calendarWeeks } from "@/lib/toc-data";
import { calendarWeekdays, filterCalendarJobs, getCalendarDaySlug } from "@/lib/calendar-utils";

type CalendarViewMode = "calendar" | "list";

function getStoredScope() {
  if (typeof window === "undefined") return "National";
  const session = JSON.parse(localStorage.getItem("toc.session") || "null");
  return session?.scope || "National";
}

export default function CalendarPage() {
  const [scope, setScope] = useState("National");
  const [viewMode, setViewMode] = useState<CalendarViewMode>("calendar");
  const filteredWeeks = useMemo(() => calendarWeeks.map((week) => week.map((day) => ({
    ...day,
    jobs: filterCalendarJobs(day, scope)
  }))), [scope]);
  const calendarDays = filteredWeeks.flatMap((week) => week);
  const totalVisibleJobs = calendarDays.reduce((total, day) => total + day.jobs.length, 0);

  useEffect(() => {
    function syncScope(event?: Event) {
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : getStoredScope();
      setScope(nextScope);
    }

    syncScope();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    return () => {
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
    };
  }, []);

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
                {calendarDays.map((day) => (
                  <Link className={`calendar-date ${day.today ? "today" : ""}`} href={`/calendar/${getCalendarDaySlug(day)}`} key={getCalendarDaySlug(day)}>
                    <div className="calendar-date-head">
                      <span><strong>{day.date}</strong><em>{day.month}</em></span>
                      <small>{day.jobs.length ? `${day.jobs.length} jobs` : "No jobs"}</small>
                    </div>
                    <span className="calendar-week-label">ABCD {day.week}</span>
                    <div className="calendar-date-jobs">
                      {day.jobs.slice(0, 6).map((job) => (
                        <div className={`calendar-job-pill ${job.severity}`} key={`${day.date}-${job.time}-${job.site}`}>
                          <span>{job.time}</span>
                          <strong>{job.location}</strong>
                          <small>{job.site}</small>
                        </div>
                      ))}
                      {day.jobs.length > 6 ? <small className="calendar-more-count">+{day.jobs.length - 6} more shifts</small> : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="calendar-list-view">
              {calendarDays.map((day) => (
                <Link className="calendar-list-day" href={`/calendar/${getCalendarDaySlug(day)}`} key={getCalendarDaySlug(day)}>
                  <div>
                    <span className="calendar-week-label">ABCD {day.week}</span>
                    <strong>{day.day} {day.date} {day.month}</strong>
                    <small>{day.jobs.length ? `${day.jobs.length} visible jobs for ${scope}` : `No visible jobs for ${scope}`}</small>
                  </div>
                  <div className="calendar-list-jobs">
                    {day.jobs.slice(0, 4).map((job) => <Tag tone={job.severity} key={`${day.date}-${job.time}-${job.site}`}>{job.time} {job.location}</Tag>)}
                    {day.jobs.length > 4 ? <Tag>+{day.jobs.length - 4} more</Tag> : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </TocShell>
  );
}
