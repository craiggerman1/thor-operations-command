import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { approvals, nationalTasks, outlookReminders, rosterWindows, staffAvailability, tasks } from "@/lib/toc-data";

export default function ActionsPage() {
  return (
    <TocShell>
      <PageIntro eyebrow="TOC workspace" title="Action Centre" detail="Ensure all items are actioned and then cleared." />
      <section className="command-grid route-grid">
        <FlowHeading step="1" eyebrow="Action centre" title="Ensure all items are actioned and then cleared" />
        <Panel eyebrow="Thor Portal" title="Jobsheets needing review">
          <div className="queue-list">
            {approvals.map((item) => (
              <article className="queue-card" key={item.id}>
                <strong>{item.id} {item.site}</strong>
                <small>{item.region} - {item.count} vehicles - waiting {item.age}</small>
                <div className="meta-row"><Tag tone={item.risk === "Ready" ? "green" : "amber"}>{item.risk}</Tag><Tag>Portal</Tag></div>
              </article>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Local manager" title="Action tiles">
          <TaskList tasks={tasks} />
        </Panel>
        <Panel eyebrow="National ops" title="National admin directives">
          <TaskList tasks={nationalTasks.map((task) => ({ ...task, region: "National" }))} />
        </Panel>
        <Panel wide eyebrow="Live roster tracking" title="Next shifts and coverage" pill="Roster feed planned">
          <div className="ops-list">
            {rosterWindows.map((item) => (
              <article className="ops-card" key={`${item.region}-${item.shift}`}>
                <strong>{item.region} - {item.shift}</strong>
                <small>{item.gap}</small>
                <div className="meta-row"><Tag tone={item.severity}>{item.coverage}</Tag><Tag>{item.staff} staff</Tag></div>
              </article>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Staff availability" title="Available staff by window">
          <div className="availability-grid">
            {staffAvailability.map((item) => (
              <article className={`availability-card ${item.severity}`} key={`${item.region}-${item.window}`}>
                <span>{item.region}</span>
                <strong>{item.available} available</strong>
                <small>{item.window} - {item.unavailable} unavailable</small>
                <em>{item.status}</em>
              </article>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Outlook calendar" title="Reminders and follow-ups" pill="Calendar planned">
          <div className="ops-list">
            {outlookReminders.map((item) => (
              <article className="ops-card" key={`${item.region}-${item.time}`}>
                <strong>{item.title}</strong>
                <small>{item.region} - {item.time}</small>
                <div className="meta-row"><Tag tone={item.severity}>{item.source}</Tag></div>
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}

function TaskList({ tasks }: { tasks: Array<{ title: string; owner: string; region: string; priority: string }> }) {
  return (
    <div className="task-stack">
      {tasks.map((task) => (
        <article className="task-card" key={task.title}>
          <strong>{task.title}</strong>
          <small>{task.owner} - {task.region}</small>
          <div className="meta-row"><Tag tone={task.priority === "High" ? "red" : "amber"}>{task.priority}</Tag><Tag>Action</Tag></div>
        </article>
      ))}
    </div>
  );
}
