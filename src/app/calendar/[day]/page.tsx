"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { CalendarJobEditor } from "@/components/CalendarJobEditor";
import type { CalendarEditTarget } from "@/components/CalendarJobEditor";
import {
  getCalendarDayBySlug,
  getCalendarDayFromWeeks,
  getCalendarDaySlug,
  generateCalendarWeeks,
  updateCalendarJob
} from "@/lib/calendar-utils";
import type { CalendarDay, CalendarJob } from "@/lib/toc-data";

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

export default function CalendarDayPage() {
  const params = useParams<{ day: string }>();
  const templateDay = useMemo(() => {
    const templateDay = getCalendarDayBySlug(params.day);
    return templateDay ? { ...templateDay, jobs: [] } : undefined;
  }, [params.day]);
  const [day, setDay] = useState<CalendarDay | undefined>();
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("National");
  const [calendarData, setCalendarData] = useState<CalendarDay[][]>(generateCalendarWeeks());
  const [editTarget, setEditTarget] = useState<CalendarEditTarget | null>(null);
  const [saveMessage, setSaveMessage] = useState("");

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
    async function syncCalendar() {
      setLoading(true);
      try {
        const response = await fetch(`/api/calendar?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
        const payload = await response.json();
        const weeks = payload.weeks || [];
        setCalendarData(weeks);
        setDay(getCalendarDayFromWeeks(weeks, params.day) || templateDay);
      } catch {
        const emptyWeeks = generateCalendarWeeks();
        setCalendarData(emptyWeeks);
        setDay(getCalendarDayFromWeeks(emptyWeeks, params.day) || templateDay);
      } finally {
        setLoading(false);
      }
    }

    void syncCalendar();
    window.addEventListener("toc.calendar.updated", syncCalendar);
    return () => window.removeEventListener("toc.calendar.updated", syncCalendar);
  }, [templateDay, params.day, scope]);

  if (loading) {
    return (
      <TocShell>
        <PageIntro title="Calendar" detail="Loading selected schedule day." />
        <section className="command-grid route-grid">
          <Panel wide eyebrow="Day schedule" title="Loading schedule">
            <div className="empty-state">Loading the selected day from the database.</div>
          </Panel>
        </section>
      </TocShell>
    );
  }

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

  const currentDay = day;
  const currentDaySlug = getCalendarDaySlug(currentDay);
  const currentDayLabel = `${currentDay.day} ${currentDay.date} ${currentDay.month}`;
  const visibleJobs = currentDay.jobs
    .map((job, originalIndex) => ({ ...job, originalIndex }))
    .filter((job) => scope === "National" || job.location === scope || job.location === "National");

  function openEditor(jobIndex: number, job: CalendarJob) {
    setEditTarget({
      daySlug: currentDaySlug,
      dayLabel: currentDayLabel,
      jobIndex,
      job: { ...job, recurrence: job.recurrence || "None", recurrenceIntervalWeeks: job.recurrenceIntervalWeeks || 3 }
    });
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

    const nextData = updateCalendarJob(calendarData, editTarget.daySlug, editTarget.jobIndex, cleanEditableJob(editTarget.job));
    setCalendarData(nextData);
    setDay(getCalendarDayFromWeeks(nextData, params.day) || currentDay);
    setEditTarget(null);
    setSaveMessage("Calendar job updated.");

    if (editTarget.job.id) {
      fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: editTarget.job.id, job: cleanEditableJob(editTarget.job), scope })
      })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Calendar update failed")))
        .then((payload) => {
          const weeks = payload.weeks || nextData;
          setCalendarData(weeks);
          setDay(getCalendarDayFromWeeks(weeks, params.day) || currentDay);
          setSaveMessage("Calendar job saved to the database.");
          window.dispatchEvent(new Event("toc.calendar.updated"));
        })
        .catch(() => setSaveMessage("Calendar job updated on screen, but database save failed."));
    }
  }

  return (
    <TocShell>
      <PageIntro title="Calendar" detail={`${currentDayLabel} job schedule for ${scope}`} />
      <FlowHeading eyebrow="Calendar Day" title="Review each job in order, edit the detail if needed, then return to the main calendar view." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Day schedule" title={`${scope} jobs`} pill={`${visibleJobs.length} visible jobs`}>
          <div className="calendar-day-actions">
            <Link className="calendar-back-link" href="/calendar">Back to calendar</Link>
            <span>{currentDay.week} runs Thursday to Wednesday.</span>
          </div>
          {saveMessage ? <div className="calendar-save-message">{saveMessage}</div> : null}
          {editTarget ? <CalendarJobEditor editTarget={editTarget} onCancel={() => setEditTarget(null)} onSave={saveDraft} onUpdate={updateDraft} /> : null}
          <div className="calendar-detail-list">
            {visibleJobs.length ? visibleJobs.map((job, index) => (
              <article className={`calendar-detail-job ${job.severity}`} key={`${job.time}-${job.site}`}>
                <div className="calendar-detail-index">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{job.time}</strong>
                  <button type="button" onClick={() => openEditor(job.originalIndex, job)}>Edit</button>
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
                    <div><dt>Source</dt><dd>TOC schedule</dd></div>
                    <div><dt>Recurring</dt><dd>{job.recurrence === "Custom" ? `Every ${job.recurrenceIntervalWeeks || 3} weeks` : job.recurrence && job.recurrence !== "None" ? job.recurrence : "None"}</dd></div>
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
