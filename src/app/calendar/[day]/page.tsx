"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel, Tag } from "@/components/TocCards";
import {
  filterCalendarJobs,
  getCalendarDayBySlug,
  getCalendarDayFromWeeks,
  getStoredCalendarWeeks
} from "@/lib/calendar-utils";
import type { CalendarDay } from "@/lib/toc-data";

function getStoredScope() {
  if (typeof window === "undefined") return "National";
  const session = JSON.parse(localStorage.getItem("toc.session") || "null");
  return session?.scope || "National";
}

export default function CalendarDayPage() {
  const params = useParams<{ day: string }>();
  const fallbackDay = getCalendarDayBySlug(params.day);
  const [day, setDay] = useState<CalendarDay | undefined>(fallbackDay);
  const [scope, setScope] = useState("National");

  useEffect(() => {
    function syncScope(event?: Event) {
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : getStoredScope();
      setScope(nextScope);
    }

    setDay(getCalendarDayFromWeeks(getStoredCalendarWeeks(), params.day) || fallbackDay);
    syncScope();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    return () => {
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
    };
  }, [fallbackDay, params.day]);

  if (!day) {
    return (
      <TocShell>
        <PageIntro title="Calendar day not found" detail="The selected calendar day is not available in the current schedule data." />
        <section className="command-grid route-grid">
          <Panel wide eyebrow="Schedule view" title="Unavailable day">
            <Link className="calendar-back-link" href="/calendar">Back to calendar</Link>
          </Panel>
        </section>
      </TocShell>
    );
  }

  const visibleJobs = filterCalendarJobs(day, scope);

  return (
    <TocShell>
      <PageIntro title={`${day.day} ${day.date} ${day.month}`} detail={`${day.week} detailed job schedule for ${scope}.`} />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Day schedule" title={`${scope} jobs`} pill={`${visibleJobs.length} visible jobs`}>
          <div className="calendar-day-actions">
            <Link className="calendar-back-link" href="/calendar">Back to calendar</Link>
            <span>{day.week} runs Thursday to Wednesday.</span>
          </div>
          <div className="calendar-detail-list">
            {visibleJobs.length ? visibleJobs.map((job, index) => (
              <article className={`calendar-detail-job ${job.severity}`} key={`${job.time}-${job.site}`}>
                <div className="calendar-detail-index">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{job.time}</strong>
                </div>
                <div className="calendar-detail-main">
                  <div className="calendar-detail-title">
                    <div>
                      <h3>{job.job}</h3>
                      <p>{job.site}</p>
                    </div>
                    <div className="meta-row"><Tag tone={job.severity}>{job.status}</Tag><Tag>{job.location}</Tag></div>
                  </div>
                  <dl className="calendar-detail-grid">
                    <div><dt>Crew</dt><dd>{job.crew}</dd></div>
                    <div><dt>Location</dt><dd>{job.location}</dd></div>
                    <div><dt>Site</dt><dd>{job.site}</dd></div>
                    <div><dt>Source</dt><dd>Portal schedule feed planned</dd></div>
                    <div><dt>Recurring</dt><dd>{job.recurrence && job.recurrence !== "None" ? `${job.recurrence}${job.recurrenceDetail ? ` - ${job.recurrenceDetail}` : ""}` : "None"}</dd></div>
                  </dl>
                  <div className="calendar-detail-notes">
                    <strong>Manager notes</strong>
                    <p>{job.notes}</p>
                  </div>
                </div>
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
