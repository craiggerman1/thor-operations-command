import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading } from "@/components/TocCards";
import { TodoManager } from "@/components/TodoManager";

export default function TodoPage() {
  return (
    <TocShell>
      <PageIntro title="To Do" detail="Personal manager notes and quick tasks captured during the day." />
      <FlowHeading eyebrow="To Do" title="Capture quick tasks as they arrive, mark important items clearly, and share when another manager needs visibility." />
      <section className="command-grid route-grid">
        <TodoManager mode="page" />
      </section>
    </TocShell>
  );
}
