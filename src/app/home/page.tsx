"use client";

import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { DirectorBroadcastControls } from "@/components/UrgentBroadcast";
import { getThorOperatingWeek } from "@/lib/operating-week";
import { productivitySites } from "@/lib/toc-data";
import { metrics } from "@/lib/toc-data";
import { useEffect, useState } from "react";
import type { AccessRole } from "@/lib/access";
import type { ActionItem } from "@/lib/action-state";
import { getScopedActionItems, isNationalScope } from "@/lib/scope-utils";
import { defaultHomeSettings } from "@/lib/home-settings";
import type { HomeSettingsConfig, HomeSignalKey } from "@/lib/home-settings";
import { tocFetch } from "@/lib/toc-client-auth";

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
  const [openActionItems, setOpenActionItems] = useState<ActionItem[]>([]);
  const [homeSettings, setHomeSettings] = useState<HomeSettingsConfig>(defaultHomeSettings);
  const operatingWeek = getThorOperatingWeek();
  const visibleActionItems = getScopedActionItems(openActionItems, scope, activeRole);
  const visibleProductivitySites = isNationalScope(scope) ? productivitySites : productivitySites.filter((site) => site.region === scope);
  const productivityBasis = visibleProductivitySites.length ? visibleProductivitySites : productivitySites;
  const productivityScore = productivityBasis.length ? Math.round(productivityBasis.reduce((total, site) => total + site.productivityScore, 0) / productivityBasis.length) : 100;
  const complianceOpenItems = visibleActionItems.filter((item) => item.source === "Compliance").length;
  const actionScore = getScoreFromOpenItems(visibleActionItems.length, 8);
  const complianceScore = getScoreFromOpenItems(complianceOpenItems, 18);
  const todoScore = getScoreFromOpenItems(openTodoCount, 7);
  const overallScore = Math.round(productivityScore * 0.34 + complianceScore * 0.24 + actionScore * 0.25 + todoScore * 0.17);
  const overallTone = getTone(overallScore);
  const isDirector = activeRole === "director";
  const isScopedRegion = !isNationalScope(scope);
  const jobsheetActions = visibleActionItems.filter((item) => item.source === "Thor Portal").length;
  const signalLabels = homeSettings.signals.reduce((labels, signal) => ({ ...labels, [signal.key]: signal.label }), {} as Record<HomeSignalKey, string>);
  const enabledSignals = new Set(homeSettings.signals.filter((signal) => signal.enabled).map((signal) => signal.key));
  const commandMetrics = [
    {
      key: "operatingWeek" as HomeSignalKey,
      label: signalLabels.operatingWeek || "Operating week",
      value: operatingWeek.name,
      detail: operatingWeek.detail,
      status: "green",
      href: "/calendar"
    },
    {
      key: "riskFlags" as HomeSignalKey,
      label: signalLabels.riskFlags || "Risk flags",
      value: visibleActionItems.length.toString(),
      detail: isScopedRegion ? `${scope} action pressure` : "Compliance, staffing, data",
      status: visibleActionItems.some((item) => item.severity === "red") ? "red" : visibleActionItems.length ? "amber" : "green",
      href: "/actions"
    },
    {
      key: "jobsheets" as HomeSignalKey,
      label: signalLabels.jobsheets || "Jobsheets",
      value: isScopedRegion ? jobsheetActions.toString() : metrics.find((metric) => metric.label === "Jobsheets")?.value || "0",
      detail: isScopedRegion ? `${scope} jobsheet actions` : "Waiting on manager action",
      status: jobsheetActions ? "amber" : "green",
      href: "/jobsheets"
    },
    {
      key: "assetsOnline" as HomeSignalKey,
      label: signalLabels.assetsOnline || "Assets online",
      value: isScopedRegion ? "Region" : metrics.find((metric) => metric.label === "Assets online")?.value || "0",
      detail: isScopedRegion ? `${scope} asset view` : "Unity and GPS ready",
      status: "blue",
      href: "/asset-tracking"
    }
  ].filter((metric) => enabledSignals.has(metric.key));

  useEffect(() => {
    function syncSession(event?: Event) {
      const storedSession = getStoredSession();
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : storedSession.scope;
      setScope(nextScope);
      setActiveRole(storedSession.role);
    }

    function syncTodos() {
      const storedSession = getStoredSession();
      const all = storedSession.role === "director" || storedSession.scope === "National";
      tocFetch(`/api/todos?role=${encodeURIComponent(storedSession.role)}&scope=${encodeURIComponent(storedSession.scope)}${all ? "&all=true" : ""}`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("To Do unavailable")))
        .then((payload) => setOpenTodoCount(((payload.todos || []) as { done?: boolean }[]).filter((item) => !item.done).length))
        .catch(() => setOpenTodoCount(getOpenTodoCount()));
    }

    function syncActions() {
      tocFetch(`/api/actions?scope=${encodeURIComponent(getStoredSession().scope)}`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Action Centre unavailable")))
        .then((payload) => setOpenActionItems(((payload.actions || []) as ActionItem[]).filter((item) => item.status !== "Closed")))
        .catch(() => setOpenActionItems([]));
    }

    function syncHomeSettings() {
      tocFetch("/api/home-settings", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Home settings unavailable")))
        .then((payload) => setHomeSettings((payload.config || defaultHomeSettings) as HomeSettingsConfig))
        .catch(() => setHomeSettings(defaultHomeSettings));
    }

    syncSession();
    syncTodos();
    syncActions();
    syncHomeSettings();
    window.addEventListener("storage", syncSession);
    window.addEventListener("toc.scopechange", syncSession);
    window.addEventListener("storage", syncTodos);
    window.addEventListener("toc.todos.updated", syncTodos);
    window.addEventListener("toc.actionState.updated", syncActions);
    window.addEventListener("toc.homeSettings.updated", syncHomeSettings);
    const refreshInterval = window.setInterval(() => {
      syncTodos();
      syncActions();
      syncHomeSettings();
    }, 15000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("toc.scopechange", syncSession);
      window.removeEventListener("storage", syncTodos);
      window.removeEventListener("toc.todos.updated", syncTodos);
      window.removeEventListener("toc.actionState.updated", syncActions);
      window.removeEventListener("toc.homeSettings.updated", syncHomeSettings);
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
          <Panel wide eyebrow="Director access" title="Business overall position" pill={`${overallScore}% overall`}>
            <div className="director-layout">
              <Link className={`director-scorecard actionable-card ${overallTone}`} href="/actions">
                <span>Overall position</span>
                <strong>{overallScore}%</strong>
                <small>Total nationwide position from open actions, site productivity and open manager To Do items.</small>
              </Link>
              <div className="director-signals">
                <DirectorSignal label="Productivity" value={`${productivityScore}%`} tone={getTone(productivityScore)} href="/operations" />
                <DirectorSignal label="Compliance" value={`${complianceScore}%`} tone={getTone(complianceScore)} href="/compliance" />
                <DirectorSignal label="Manager To Do Items" value={openTodoCount.toString()} tone={openTodoCount ? "amber" : "green"} href="/actions" />
                <DirectorSignal label="Manager Action Items" value={visibleActionItems.length.toString()} tone={visibleActionItems.length ? "amber" : "green"} href="/actions" />
              </div>
              <div className="director-brief">
                <div className="director-brief-item"><span className="brief-dot" /><strong>{visibleActionItems.length} national open action items currently influence the business overall position score.</strong></div>
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
            {visibleActionItems.length ? null : <div className="empty-state">No command signals are currently open.</div>}
          </div>
        </Panel>
        <Panel wide className="admin-only-panel" eyebrow="Admin roadmap" title="Go Live Pathway" pill="Field-use readiness">
          <div className="go-live-pathway">
            {homeSettings.roadmap.map((item) => (
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

function DirectorSignal({ label, value, href, tone = "green" }: { label: string; value: string; href: string; tone?: "green" | "amber" | "red" }) {
  return <Link className={`director-signal actionable-card ${tone}`} href={href}><span>{label}</span><strong>{value}</strong><small>Open relevant view</small></Link>;
}
