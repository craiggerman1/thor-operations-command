"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import type { ActionItem } from "@/lib/action-state";
import type { AccessRole } from "@/lib/access";
import { getScopedActionItems } from "@/lib/scope-utils";

const directivePriority = {
  "National Ops Directive": 1,
  "Scheduled Directive": 2,
  "To Do": 3
};

export default function ActionsPage() {
  const [openActions, setOpenActions] = useState<ActionItem[]>([]);
  const [scope, setScope] = useState("National");
  const [role, setRole] = useState<AccessRole>("admin");
  const scopedActions = getScopedActionItems(openActions, scope, role);
  const sortedActions = [...scopedActions].sort((a, b) => (directivePriority[a.directive as keyof typeof directivePriority] || 9) - (directivePriority[b.directive as keyof typeof directivePriority] || 9));

  useEffect(() => {
    function syncSession(event?: Event) {
      try {
        const storedSession = JSON.parse(localStorage.getItem("toc.session") || "null");
        setRole(storedSession?.role || "admin");
        setScope(event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : storedSession?.scope || "National");
      } catch {
        setRole("admin");
        setScope("National");
      }
    }

    async function syncActions() {
      try {
        const response = await fetch("/api/actions", { cache: "no-store" });
        const payload = await response.json();
        const actions = (payload.actions || []) as ActionItem[];
        setOpenActions(actions.filter((item) => item.status !== "Closed"));
      } catch {
        setOpenActions([]);
      }
    }

    syncSession();
    void syncActions();
    window.addEventListener("storage", syncSession);
    window.addEventListener("toc.scopechange", syncSession);
    window.addEventListener("storage", syncActions);
    window.addEventListener("toc.actionState.updated", syncActions);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("toc.scopechange", syncSession);
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
