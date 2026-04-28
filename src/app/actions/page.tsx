import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { approvals, nationalTasks, tasks } from "@/lib/toc-data";

export default function ActionsPage() {
  return (
    <TocShell>
      <PageIntro eyebrow="TOC workspace" title="Action Centre" detail="Clear the items that can block the day." />
      <section className="command-grid route-grid">
        <FlowHeading step="2" eyebrow="Action centre" title="Jobsheets, manager actions and national directives" />
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
