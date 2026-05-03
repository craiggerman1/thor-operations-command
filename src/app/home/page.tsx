"use client";

import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { DirectorBroadcastControls } from "@/components/UrgentBroadcast";
import { getThorOperatingWeek } from "@/lib/operating-week";
import { actionItems, goLivePathway, productivitySites } from "@/lib/toc-data";
import { metrics } from "@/lib/toc-data";
import { useEffect, useState } from "react";
import type { AccessRole } from "@/lib/access";

function getStoredSession() {
  const fallback = { role: "admin" as AccessRole, scope: "National" };
  if (typeof window === "undefined") return fallback;

  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return {
      role: session?.role || fallback.role,
      scope: session?.scope || fallback.scope
    };
  } catch {
    return fallback;
  }
}

export default function HomePage() {
  const [scope, setScope] = useState("National");
  const [activeRole, setActiveRole] = useState<AccessRole>("admin");
  const [openTodoCount, setOpenTodoCount] = useState(0);
  const operatingWeek = getThorOperatingWeek();
  const visibleActionItems = actionItems.filter((item) => scope === "National" || item.region === scope || item.region === "National");
  const openActionItems = actionItems.filter((item) => item.status !== "Closed");
  const productivityScore = Math.round(productivitySites.reduce((total, site) => total + site.productivityScore, 0) / productivitySites.length);
  const complianceOpenItems = openActionItems.filter((item) => item.source === "Compliance").length;
  const actionScore = getScoreFromOpenItems(openActionItems.length, 8);
  const complianceScore = getScoreFromOpenItems(complianceOpenItems, 18);
  const todoScore = getScoreFromOpenItems(openTodoCount, 7);
  const overallScore = Math.round(productivityScore * 0.34 + complianceScore * 0.24 + actionScore * 0.25 + todoScore * 0.17);
  const overallTone = getTone(overallScore);
  const isDirector = activeRole === "director";
  const riskMetric = metrics.find((metric) => metric.label === "Risk flags");
  const commandMetrics = [
    {
      label: "Operating week",
      value: operatingWeek.name,
      detail: operatingWeek.detail,
      status: "green",
      href: "/overview"
    },
    ...(riskMetric ? [riskMetric] : []),
    ...metrics.filter((metric) => metric.label !== "Risk flags")
  ];

  useEffect(() => {
    function syncSession(event?: Event) {
      const storedSession = getStoredSession();
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : storedSession.scope;
      setScope(nextScope);
      setActiveRole(storedSession.role);
    }

    function syncTodos() {
      setOpenTodoCount(getOpenTodoCount());
    }

    syncSession();
    syncTodos();
    window.addEventListener("storage", syncSession);
    window.addEventListener("toc.scopechange", syncSession);
    window.addEventListener("storage", syncTodos);
    window.addEventListener("toc.todos.updated", syncTodos);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("toc.scopechange", syncSession);
      window.removeEventListener("storage", syncTodos);
      window.removeEventListener("toc.todos.updated", syncTodos);
    };
  }, []);

  return (
    <TocShell>
      <PageIntro title="Home" detail="Command entry point." />
      <FlowHeading eyebrow="Home" title="Start with the business signal, then move to the page that owns the action." />
      <section className="status-strip" aria-label="Business overview">
        {commandMetrics.map((metric) => (
          <Link className={`metric-card signal-${metric.status}`} href={metric.href} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </Link>
        ))}
      </section>
      {isDirector ? (
        <section className="command-grid route-grid">
          <Panel wide eyebrow="Director access" title="Owner health view" pill={`${overallScore}% overall`}>
            <div className="director-layout">
              <Link className={`director-scorecard actionable-card ${overallTone}`} href="/actions">
                <span>Overall position</span>
                <strong>{overallScore}%</strong>
                <small>Total nationwide position from open actions, site productivity and open manager To Do items.</small>
              </Link>
              <div className="director-signals">
                <DirectorSignal label="Productivity" value={`${productivityScore}%`} tone={getTone(productivityScore)} />
                <DirectorSignal label="Compliance" value={`${complianceScore}%`} tone={getTone(complianceScore)} />
                <DirectorSignal label="Manager To Do Items" value={openTodoCount.toString()} tone={openTodoCount ? "amber" : "green"} />
                <DirectorSignal label="Open Action Items" value={openActionItems.length.toString()} tone={openActionItems.length ? "amber" : "green"} />
              </div>
              <div className="director-brief">
                <div className="director-brief-item"><span className="brief-dot" /><strong>{openActionItems.length} national open action items currently influence the owner position.</strong></div>
                <div className="director-brief-item"><span className="brief-dot" /><strong><Tag tone={complianceScore >= 90 ? "green" : "amber"}>{complianceScore >= 90 ? "Stable" : "Watch"}</Tag> Compliance score is driven by open compliance action load.</strong></div>
              </div>
            </div>
          </Panel>
          <Panel wide eyebrow="Director message" title="A Message From The Director" pill="All users">
            <DirectorBroadcastControls />
          </Panel>
        </section>
      ) : (
        <section className="command-grid route-grid">
        <Panel wide eyebrow="Command signal" title="Take action on command signals" pill={`${visibleActionItems.length} action-linked`}>
          <div className="signal-command-grid">
            {visibleActionItems.map((signal) => (
              <Link className={`signal-command-card ${signal.severity}`} href={signal.href} key={signal.id}>
                <div>
                  <span className="eyebrow">{signal.source} - {signal.region}</span>
                  <h3>{signal.title}</h3>
                  <p>{signal.detail}</p>
                </div>
                <div className="signal-command-footer">
                  <div className="meta-row"><Tag tone={signal.severity}>{signal.status}</Tag><Tag>{signal.directive}</Tag></div>
                  <span className="node-action">Open issue</span>
                </div>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel wide className="admin-only-panel" eyebrow="Admin roadmap" title="Go Live Pathway" pill="Field-use readiness">
          <div className="go-live-pathway">
            {goLivePathway.map((item) => (
              <article className={`go-live-item ${item.severity}`} key={item.step}>
                <span>{item.step}</span>
                <strong>{item.title}</strong>
                <Tag tone={item.severity}>{item.status}</Tag>
              </article>
            ))}
          </div>
        </Panel>
        </section>
      )}
    </TocShell>
  );
}

function getOpenTodoCount() {
  if (typeof window === "undefined") return 0;

  let count = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith("toc.todos.")) continue;

    try {
      const items = JSON.parse(localStorage.getItem(key) || "[]") as { done?: boolean }[];
      count += items.filter((item) => !item.done).length;
    } catch {
      count += 0;
    }
  }
  return count;
}

function getScoreFromOpenItems(openItems: number, penalty: number) {
  return Math.max(0, 100 - openItems * penalty);
}

function getTone(score: number) {
  if (score >= 90) return "green";
  if (score >= 75) return "amber";
  return "red";
}

function DirectorSignal({ label, value, tone = "green" }: { label: string; value: string; tone?: "green" | "amber" | "red" }) {
  return <Link className={`director-signal actionable-card ${tone}`} href="/actions"><span>{label}</span><strong>{value}</strong><small>Open national action view</small></Link>;
}
