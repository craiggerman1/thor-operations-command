import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel, Tag } from "@/components/TocCards";
import { calendarDays, locationJobs } from "@/lib/toc-data";

export default function CalendarPage() {
  return (
    <TocShell>
      <PageIntro title="Calendar" detail="Scheduled jobs by day and location, giving managers a clear view of upcoming work." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Schedule view" title="National job calendar" pill="Calendar feed planned">
          <div className="calendar-grid">
            {calendarDays.map((day) => (
              <article className={`calendar-day ${day.severity}`} key={`${day.day}-${day.date}`}>
                <span>{day.day}</span>
                <strong>{day.date}</strong>
                <small>{day.count} scheduled jobs</small>
                <Tag tone={day.severity}>{day.location}</Tag>
              </article>
            ))}
          </div>
        </Panel>
        <Panel wide eyebrow="Scheduled work" title="Jobs by location">
          <div className="calendar-job-list">
            {locationJobs.map((job) => (
              <article className="calendar-job" key={`${job.date}-${job.location}-${job.time}`}>
                <div>
                  <strong>{job.site}</strong>
                  <small>{job.date} - {job.time} - {job.job}</small>
                </div>
                <div className="meta-row"><Tag tone={job.severity}>{job.status}</Tag><Tag>{job.location}</Tag><Tag>{job.crew}</Tag></div>
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
