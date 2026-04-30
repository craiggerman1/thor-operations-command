import { TocShell, PageIntro } from "@/components/TocShell";
import { TodoManager } from "@/components/TodoManager";

export default function TodoPage() {
  return (
    <TocShell>
      <PageIntro title="To Do" detail="Personal manager notes and quick tasks captured during the day." />
      <section className="command-grid route-grid">
        <TodoManager mode="page" />
      </section>
    </TocShell>
  );
}
