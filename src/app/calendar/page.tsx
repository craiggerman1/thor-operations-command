"use client";

import { useEffect, useMemo, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel, Tag } from "@/components/TocCards";
import { calendarWeeks } from "@/lib/toc-data";

const weekdays = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];

function getStoredScope() {
  if (typeof window === "undefined") return "National";
  const session = JSON.parse(localStorage.getItem("toc.session") || "null");
  return session?.scope || "National";
}

export default function CalendarPage() {
  const [scope, setScope] = useState("National");
  const [selectedKey, setSelectedKey] = useState("");
  const filteredWeeks = useMemo(() => calendarWeeks.map((week) => week.map((day) => ({
    ...day,
    jobs: day.jobs.filter((job) => scope === "National" || job.location === scope || job.location === "National")
  }))), [scope]);
  const calendarDays = filteredWeeks.flatMap((week) => week);
  const selectedDay = calendarDays.find((day) => `${day.day}-${day.date}-${day.month}` === selectedKey) || calendarDays[0]!;
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

  useEffect(() => {
    const preferredDay = calendarDays.find((day) => day.today) || calendarDays.find((day) => day.jobs.length) || calendarDays[0]!;
    setSelectedKey(`${preferredDay.day}-${preferredDay.date}-${preferredDay.month}`);
  }, [scope]);

  return (
    <TocShell>
      <PageIntro title="Calendar" detail="Scheduled jobs by Thor operating week, starting Thursday and ending Wednesday." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Schedule view" title={`${scope} job calendar`} pill={`${totalVisibleJobs} visible jobs`}>
          <div className="wall-calendar" aria-label="Scheduled jobs calendar">
            <div className="calendar-weekdays">
              {weekdays.map((day) => <strong key={day}>{day}</strong>)}
            </div>
            <div className="calendar-month-grid">
              {calendarDays.map((day) => {
                const dayKey = `${day.day}-${day.date}-${day.month}`;
                return (
                <button className={`calendar-date ${selectedKey === dayKey ? "selected" : ""} ${day.today ? "today" : ""}`} key={dayKey} type="button" onClick={() => setSelectedKey(dayKey)}>
                  <div className="calendar-date-head">
                    <span><strong>{day.date}</strong><em>{day.month}</em></span>
                    <small>{day.jobs.length ? `${day.jobs.length} jobs` : "No jobs"}</small>
                  </div>
                  <span className="calendar-week-label">{day.week}</span>
                  <div className="calendar-date-jobs">
                    {day.jobs.slice(0, 5).map((job) => (
                      <div className={`calendar-job-pill ${job.severity}`} key={`${day.date}-${job.time}-${job.site}`}>
                        <span>{job.time}</span>
                        <strong>{job.location}</strong>
                        <small>{job.site}</small>
                      </div>
                    ))}
                    {day.jobs.length > 5 ? <small className="calendar-more-count">+{day.jobs.length - 5} more shifts</small> : null}
                  </div>
                </button>
              );})}
            </div>
          </div>
        </Panel>
        <Panel wide eyebrow="Expanded day view" title={`${selectedDay.day} ${selectedDay.date} ${selectedDay.month} - ${selectedDay.week}`} pill={scope}>
          <div className="calendar-expanded-view">
            {selectedDay.jobs.length ? selectedDay.jobs.map((job) => (
              <article className={`calendar-expanded-job ${job.severity}`} key={`${selectedDay.date}-${job.time}-${job.site}`}>
                <div className="calendar-expanded-time">
                  <strong>{job.time}</strong>
                  <Tag tone={job.severity}>{job.status}</Tag>
                </div>
                <div>
                  <h3>{job.job}</h3>
                  <p>{job.site}</p>
                  <small>{job.location} - {job.crew}</small>
                </div>
                <p>{job.notes}</p>
              </article>
            )) : (
              <div className="empty-state">No jobs are currently visible for {scope} on this day.</div>
            )}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
