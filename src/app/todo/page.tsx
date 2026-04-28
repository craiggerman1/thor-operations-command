import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel } from "@/components/TocCards";

export default function TodoPage() {
  return (
    <TocShell>
      <PageIntro eyebrow="TOC workspace" title="To Do" detail="Personal manager notes and quick tasks captured during the day." />
      <section className="command-grid route-grid">
        <Panel eyebrow="Manager memory" title="Personal to do list">
          <form className="todo-form"><input placeholder="Add a task as it comes in" /><button type="button">Add</button></form>
          <div className="todo-list"><div className="brief-item"><span className="brief-dot" /><div><strong>No manager notes yet.</strong><small>Add tasks as they arrive.</small></div></div></div>
        </Panel>
      </section>
    </TocShell>
  );
}
