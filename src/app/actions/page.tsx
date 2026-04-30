import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { actionItems } from "@/lib/toc-data";

const directivePriority = {
  "National ops directive": 1,
  "Scheduled directive": 2,
  "Action required": 3
};

export default function ActionsPage() {
  const sortedActions = [...actionItems].sort((a, b) => (directivePriority[a.directive as keyof typeof directivePriority] || 9) - (directivePriority[b.directive as keyof typeof directivePriority] || 9));

  return (
    <TocShell>
      <PageIntro title="Action Centre" detail="Ensure all items are actioned and then cleared." />
      <FlowHeading eyebrow="Action Centre" title="Ensure all items are actioned, owned, escalated where needed, and then cleared from the queue." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Priority command queue" title="Highest value actions first" pill={`${sortedActions.length} open actions`}>
          <div className="signal-action-list">
            {sortedActions.map((signal) => (
              <Link id={signal.id} className={`signal-action-card ${signal.severity}`} href={signal.href} key={signal.id}>
                <div>
                  <span className="eyebrow">{signal.source} - {signal.region}</span>
                  <strong>{signal.title}</strong>
                  <small>{signal.detail}</small>
                  <small>{signal.closeFlow}</small>
                </div>
                <div className="signal-action-controls">
                  <Tag tone={signal.severity}>{signal.directive}</Tag>
                  <Tag>{signal.status}</Tag>
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
