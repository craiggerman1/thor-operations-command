"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import type { ActionItem } from "@/lib/action-state";

type ComplianceRegisterItem = {
  id: string;
  title: string;
  detail: string;
  region: string;
  status: string;
  dueDate: string;
  actionHref: string;
};

export default function CompliancePage() {
  const [complianceActions, setComplianceActions] = useState<ActionItem[]>([]);
  const [registerItems, setRegisterItems] = useState<ComplianceRegisterItem[]>([]);
  const urgentActions = complianceActions.filter((item) => item.severity === "red").length;
  const dueSoonActions = complianceActions.filter((item) => item.severity === "amber").length;
  const readiness = Math.max(10, 100 - complianceActions.length * 12 - urgentActions * 8);

  useEffect(() => {
    async function syncCompliance() {
      try {
        const response = await fetch("/api/compliance", { cache: "no-store" });
        const payload = await response.json();
        setComplianceActions(payload.actions || []);
        setRegisterItems(payload.register || []);
      } catch {
        setComplianceActions([]);
        setRegisterItems([]);
      }
    }

    void syncCompliance();
    window.addEventListener("storage", syncCompliance);
    window.addEventListener("toc.actionState.updated", syncCompliance);
    return () => {
      window.removeEventListener("storage", syncCompliance);
      window.removeEventListener("toc.actionState.updated", syncCompliance);
    };
  }, []);

  return (
    <TocShell>
      <PageIntro title="Compliance" detail="Ensure compliance items are completed and green." />
      <FlowHeading eyebrow="Compliance" title="Work red and amber items first so inductions, safety and site readiness stay current." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Compliance command" title="Inductions, safety and site readiness" pill={`${urgentActions} urgent`}>
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
        <Panel wide eyebrow="Compliance register" title="Admin-set compliance register" pill={`${registerItems.length} register items`}>
          <div className="admin-config-list">
            {registerItems.map((item) => (
              <Link className="admin-config-card actionable-card" href={item.actionHref} key={item.id}>
                <strong>{item.title}</strong>
                <small>{item.region} - {item.status} - due {item.dueDate}</small>
              </Link>
            ))}
            {registerItems.length ? null : <div className="empty-state">No admin-set compliance register items are currently loaded.</div>}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
