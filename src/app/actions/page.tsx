"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { actionItems } from "@/lib/toc-data";
import { getOpenActionItems, type ActionItem } from "@/lib/action-state";

const directivePriority = {
  "National Ops Directive": 1,
  "Scheduled Directive": 2,
  "To Do": 3
};

export default function ActionsPage() {
  const [openActions, setOpenActions] = useState<ActionItem[]>(() => getOpenActionItems(actionItems));
  const sortedActions = [...openActions].sort((a, b) => (directivePriority[a.directive as keyof typeof directivePriority] || 9) - (directivePriority[b.directive as keyof typeof directivePriority] || 9));

  useEffect(() => {
    function syncActions() {
      setOpenActions(getOpenActionItems(actionItems));
    }

    syncActions();
    window.addEventListener("storage", syncActions);
    window.addEventListener("toc.actionState.updated", syncActions);
    return () => {
      window.removeEventListener("storage", syncActions);
      window.removeEventListener("toc.actionState.updated", syncActions);
    };
  }, []);

  return (
    <TocShell>
      <PageIntro title="Action Centre" detail="Ensure all items are actioned and then cleared." />
      <FlowHeading eyebrow="Action Centre" title="Ensure all items are actioned, owned, escalated where needed, and then cleared from the queue." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Priority command queue" title="Action Centre command queue" pill={`${sortedActions.length} open actions`}>
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
            {sortedActions.length ? null : <div className="empty-state">No open action items currently require manager close-out.</div>}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
