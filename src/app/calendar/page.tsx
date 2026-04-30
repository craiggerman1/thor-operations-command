import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel } from "@/components/TocCards";
import { calendarWeeks } from "@/lib/toc-data";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage() {
  return (
    <TocShell>
      <PageIntro title="Calendar" detail="Scheduled jobs by day and location, giving managers a clear view of upcoming work." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Schedule view" title="National job calendar" pill="Calendar feed planned">
          <div className="wall-calendar" aria-label="Scheduled jobs calendar">
            <div className="calendar-weekdays">
              {weekdays.map((day) => <strong key={day}>{day}</strong>)}
            </div>
            <div className="calendar-month-grid">
              {calendarWeeks.flatMap((week) => week).map((day) => (
                <article className={`calendar-date ${day.today ? "today" : ""} ${day.muted ? "muted" : ""}`} key={`${day.date}-${day.jobs.map((job) => job.site).join("-")}`}>
                  <div className="calendar-date-head">
                    <strong>{day.date}</strong>
                    <small>{day.jobs.length ? `${day.jobs.length} jobs` : "No jobs"}</small>
                  </div>
                  <div className="calendar-date-jobs">
                    {day.jobs.map((job) => (
                      <div className={`calendar-job-pill ${job.severity}`} key={`${day.date}-${job.time}-${job.site}`}>
                        <span>{job.time}</span>
                        <strong>{job.location}</strong>
                        <small>{job.site}</small>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
