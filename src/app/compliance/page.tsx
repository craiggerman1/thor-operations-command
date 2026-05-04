"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { actionItems, compliance } from "@/lib/toc-data";
import { getOpenActionItems, type ActionItem } from "@/lib/action-state";

export default function CompliancePage() {
  const [openActionItems, setOpenActionItems] = useState<ActionItem[]>(() => getOpenActionItems(actionItems));
  const complianceActions = openActionItems.filter((item) => item.source === "Compliance");
  const urgentActions = complianceActions.filter((item) => item.severity === "red").length;
  const dueSoonActions = complianceActions.filter((item) => item.severity === "amber").length;
  const readiness = Math.max(10, 100 - complianceActions.length * 12 - urgentActions * 8);

  useEffect(() => {
    function syncActions() {
      setOpenActionItems(getOpenActionItems(actionItems));
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
      <PageIntro title="Compliance" detail="Ensure compliance items are completed and green." />
      <FlowHeading eyebrow="Compliance" title="Work red and amber items first so inductions, safety and site readiness stay current." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Compliance command" title="Inductions, safety and site readiness" pill="2 urgent">
          <div className="compliance-layout">
            <div className="compliance-metrics">
              <Link className="compliance-stat actionable-card" href="/actions"><span>Readiness</span><strong>{readiness}%</strong><small>Current compliance action load</small></Link>
              <Link className="compliance-stat actionable-card" href="/actions"><span>Urgent</span><strong>{urgentActions}</strong><small>Needs manager action</small></Link>
              <Link className="compliance-stat actionable-card" href="/actions"><span>Due soon</span><strong>{dueSoonActions}</strong><small>Keep ahead this week</small></Link>
            </div>
            <div className="compliance-list">
              {complianceActions.map((item) => (
                <Link className={`compliance-card actionable-card ${item.severity}`} href={item.href} key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.region} - {item.source}</small>
                    <span className="action-due-date">Due: {item.dueDate}</span>
                  </div>
                  <div className="signal-action-controls"><Tag tone={item.severity}>{item.directive}</Tag></div>
                  <small>{item.detail}</small>
                </Link>
              ))}
              {complianceActions.length ? null : <div className="empty-state">No compliance action items are currently open.</div>}
            </div>
          </div>
        </Panel>
        <Panel wide eyebrow="Compliance register" title="Admin-set compliance register" pill={`${compliance.length} register items`}>
          <div className="admin-config-list">
            {compliance.map((item) => (
              <article className="admin-config-card" key={item.title}>
                <strong>{item.title}</strong>
                <small>{item.region} - {item.owner} - due {item.due}</small>
              </article>
            ))}
            {compliance.length ? null : <div className="empty-state">No admin-set compliance register items are loaded yet. Database-backed compliance settings will appear here once connected.</div>}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
