import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel, Tag } from "@/components/TocCards";
import { nationalTasks, tasks } from "@/lib/toc-data";

export default function TasksPage() {
  return (
    <TocShell>
      <PageIntro eyebrow="TOC workspace" title="Tasks" detail="Local and national action tiles that need ownership." />
      <section className="command-grid route-grid">
        <Panel eyebrow="Local manager" title="Action tiles"><TaskList tasks={tasks} /></Panel>
        <Panel eyebrow="National ops" title="National admin directives"><TaskList tasks={nationalTasks.map((task) => ({ ...task, region: "National" }))} /></Panel>
      </section>
    </TocShell>
  );
}

function TaskList({ tasks }: { tasks: Array<{ title: string; owner: string; region: string; priority: string }> }) {
  return <div className="task-stack">{tasks.map((task) => <article className="task-card" key={task.title}><strong>{task.title}</strong><small>{task.owner} - {task.region}</small><div className="meta-row"><Tag tone={task.priority === "High" ? "red" : "amber"}>{task.priority}</Tag><Tag>Action</Tag></div></article>)}</div>;
}
