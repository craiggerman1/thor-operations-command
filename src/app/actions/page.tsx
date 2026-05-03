import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { actionItems } from "@/lib/toc-data";

const directivePriority = {
  "National Ops Directive": 1,
  "Scheduled Directive": 2,
  "To Do": 3
};

export default function ActionsPage() {
  const sortedActions = [...actionItems].sort((a, b) => (directivePriority[a.directive as keyof typeof directivePriority] || 9) - (directivePriority[b.directive as keyof typeof directivePriority] || 9));

  return (
    <TocShell>
      <PageIntro title="Action Centre" detail="Ensure all items are actioned and then cleared." />
      <FlowHeading eyebrow="Action Centre" title="Ensure all items are actioned, owned, escalated where needed, and then cleared from the queue." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Priority command queue" title="Action Centre command queue" pill={`${sortedActions.length} open actions`}>
          <div className="action-centre-brief">
            <strong>All actionable items land here.</strong>
            <small>Admin and national users issue actions to managers. Region Health, Compliance, Productivity, Equipment Servicing and To Do feed their actionable items into this queue for close-out.</small>
          </div>
          <div className="signal-action-list">
            {sortedActions.map((signal) => (
              <Link id={signal.id} className={`signal-action-card ${signal.severity}`} href={signal.href} key={signal.id}>
                <div>
                  <span className="eyebrow">{signal.source} - {signal.region}</span>
                  <strong>{signal.title}</strong>
                  <small>{signal.detail}</small>
                  <span className="action-due-date">Due: {signal.dueDate}</span>
                </div>
                <div className="signal-action-controls">
                  <Tag tone={signal.severity}>{signal.directive}</Tag>
                  <span className="node-action">Open action</span>
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
