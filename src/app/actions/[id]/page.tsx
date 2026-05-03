"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { actionItems } from "@/lib/toc-data";

const sourceLinks: Record<string, string> = {
  Compliance: "/compliance",
  Roster: "/staff-availability",
  "Thor Portal": "/jobsheets",
  "Equipment Servicing": "/equipment-servicing",
  "Stock Orders": "/stock-orders",
  Workshop: "/equipment-servicing",
  "National ops": "/home"
};

export default function ActionDetailPage() {
  const params = useParams<{ id: string }>();
  const action = actionItems.find((item) => item.id === params.id);

  if (!action) {
    return (
      <TocShell>
        <PageIntro title="Action Centre" detail="Action item not found." />
        <section className="command-grid route-grid">
          <Panel wide eyebrow="Action close-out" title="Unavailable action">
            <Link className="calendar-back-link" href="/actions">Back to Action Centre</Link>
          </Panel>
        </section>
      </TocShell>
    );
  }

  const sourceHref = sourceLinks[action.source] || "/actions";

  return (
    <TocShell>
      <PageIntro title="Action Centre" detail={`${action.id} close-out workflow.`} />
      <FlowHeading eyebrow="Action Centre" title="Complete the required action, record the manager response, then submit for national approval." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow={action.directive} title={action.title} pill={`Due ${action.dueDate}`}>
          <div className={`action-detail-shell ${action.severity}`}>
            <aside className="action-detail-summary">
              <span className="eyebrow">{action.source} - {action.region}</span>
              <strong>{action.title}</strong>
              <p>{action.detail}</p>
              <div className="meta-row">
                <Tag tone={action.severity}>{action.directive}</Tag>
                <Tag>{action.status}</Tag>
                <Tag>{action.region}</Tag>
              </div>
              <div className="action-due-panel">
                <span>Due date</span>
                <strong>{action.dueDate}</strong>
                <small>{action.closeFlow}</small>
              </div>
              <Link className="node-action" href={sourceHref}>Open source page</Link>
            </aside>
            <div className="action-closeout-panel">
              <div>
                <span className="eyebrow">Manager close-out steps</span>
                <strong>Actions required to clear this item</strong>
              </div>
              <ol className="action-closeout-steps">
                {action.closeActions.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <form className="action-closeout-form">
                <label>
                  <span>Manager response</span>
                  <textarea placeholder="Record what was checked, what was fixed, and any remaining risk." />
                </label>
                <label>
                  <span>Evidence / reference</span>
                  <input placeholder="Example: Fleetio checked, jobsheets approved, stock order raised, photo/evidence uploaded later" />
                </label>
                <div className="action-closeout-buttons">
                  <button type="button">Save Draft</button>
                  <button type="button">Submit For National Approval</button>
                </div>
              </form>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
