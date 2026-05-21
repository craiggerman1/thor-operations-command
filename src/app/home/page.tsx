"use client";

import Link from "next/link";
import { TocShell } from "@/components/TocShell";
import { DirectorBroadcastControls } from "@/components/UrgentBroadcast";
import { getThorOperatingWeek } from "@/lib/operating-week";
import { productivitySites } from "@/lib/toc-data";
import { metrics } from "@/lib/toc-data";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
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
  const urgentActions = visibleActionItems.filter((item) => item.severity === "red").length;
  const pendingActions = visibleActionItems.filter((item) => item.severity === "amber").length;
  const completedJobs = Math.max(0, Number(metrics.find((metric) => metric.label === "Jobsheets")?.value || "0"));
  const activeSites = productivityBasis.length || visibleProductivitySites.length || 0;
  const jobTotal = Math.max(visibleActionItems.length + completedJobs, activeSites * 12, 1);
  const completedPercent = Math.min(96, Math.max(58, Math.round(overallScore * 0.84 + 10)));
  const insightTone = urgentActions ? "red" : pendingActions ? "amber" : "green";
  const recentActivity = visibleActionItems.slice(0, 4);
  const priorityActions = visibleActionItems.slice(0, 3);
  const roadmapItems = homeSettings.roadmap.slice(0, 4);
  const siteRows = productivityBasis.slice(0, 5);
  const pathwayCards = [
    { title: "Plan jobs", detail: "Build recurring work and ABCD schedule coverage.", href: "/jobs", label: "Jobs" },
    { title: "Check people", detail: "Confirm availability, induction and roster gaps.", href: "/staff-availability", label: "People" },
    { title: "Close actions", detail: "Clear manager-owned risks and evidence.", href: "/actions", label: "Actions" },
    { title: "Watch Odin", detail: "Review automation health and escalation controls.", href: "/odin-control", label: "Odin" }
  ];

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
    }, 60000);
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
      <section className="ops-command-home" aria-label="Thor command overview">
        <div className="ops-command-hero">
          <div>
            <span className="eyebrow">Operations snapshot</span>
            <h2>{scope === "National" ? "Thor Operating Command" : `${scope} Operating Command`}</h2>
            <p>A live operating environment for jobs, people, assets, compliance, manager close-out and Odin oversight.</p>
          </div>
          <div className={`ops-readiness ${overallTone}`}>
            <span>Overall readiness</span>
            <strong>{overallScore}%</strong>
            <small>{operatingWeek.name} - {operatingWeek.detail}</small>
          </div>
        </div>

        <section className="toc-kpi-deck" aria-label="Command metrics">
          {commandMetrics.map((metric) => (
            <Link className={`toc-kpi-card signal-${metric.status}`} href={metric.href} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </Link>
          ))}
          <Link className={`toc-kpi-card signal-${urgentActions ? "red" : pendingActions ? "amber" : "green"}`} href="/actions">
            <span>At risk</span>
            <strong>{urgentActions || pendingActions}</strong>
            <small>{urgentActions ? "Urgent items need action" : pendingActions ? "Amber issues need follow-up" : "No immediate red risks"}</small>
          </Link>
        </section>

        <section className="ops-command-grid" aria-label="Command centre modules">
          <article className="ops-map-panel">
            <div className="ops-panel-head">
              <div>
                <span className="eyebrow">Operations map</span>
                <h3>{scope === "National" ? "National operating spread" : `${scope} field position`}</h3>
              </div>
              <Link href="/asset-tracking">Open assets</Link>
            </div>
            <div className="ops-map-canvas" aria-hidden="true">
              {["Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth"].map((region, index) => (
                <span className={`ops-map-pin pin-${index + 1}`} key={region}>{index + 1}</span>
              ))}
              <div className="ops-map-pulse" />
            </div>
          </article>

          <article className="ops-status-panel">
            <div className="ops-panel-head">
              <div>
                <span className="eyebrow">Job status</span>
                <h3>Today and this week</h3>
              </div>
              <Link href="/calendar">Calendar</Link>
            </div>
            <div className="ops-donut-row">
              <div className="ops-donut" style={{ "--complete": `${completedPercent}%` } as CSSProperties}>
                <span>{jobTotal}</span>
                <small>jobs</small>
              </div>
              <div className="ops-status-list">
                <span><i className="green-dot" />Completed <strong>{completedPercent}%</strong></span>
                <span><i className="blue-dot" />In progress <strong>{Math.max(4, Math.round((100 - completedPercent) * 0.48))}%</strong></span>
                <span><i className="amber-dot" />Pending <strong>{pendingActions}</strong></span>
                <span><i className="red-dot" />Overdue <strong>{urgentActions}</strong></span>
              </div>
            </div>
          </article>

          <article className={`ops-insight-panel ${insightTone}`}>
            <span className="eyebrow">Odin insight</span>
            <h3>{urgentActions ? "Urgent manager action required" : pendingActions ? "Amber workload needs follow-up" : "Operating rhythm is stable"}</h3>
            <p>{urgentActions ? `${urgentActions} red issue${urgentActions === 1 ? "" : "s"} should be closed or escalated today.` : pendingActions ? `${pendingActions} amber item${pendingActions === 1 ? "" : "s"} are waiting for manager movement.` : "No urgent command signals are open in the current scope."}</p>
            <Link href="/odin-control">View Odin control</Link>
          </article>

          <article className="ops-activity-panel">
            <div className="ops-panel-head">
              <div>
                <span className="eyebrow">Recent activity</span>
                <h3>Manager follow-up stream</h3>
              </div>
              <Link href="/actions">View all</Link>
            </div>
            <div className="ops-activity-list">
              {recentActivity.length ? recentActivity.map((item) => (
                <Link href={item.href} key={item.id}>
                  <span className={`activity-dot ${item.severity}`} />
                  <strong>{item.title}</strong>
                  <small>{item.region} - {item.status}</small>
                </Link>
              )) : <div className="empty-state">No recent command activity is open.</div>}
            </div>
          </article>

          <article className="ops-performance-panel">
            <div className="ops-panel-head">
              <div>
                <span className="eyebrow">Site performance</span>
                <h3>This week</h3>
              </div>
              <Link href="/operations">Productivity</Link>
            </div>
            <div className="ops-site-bars">
              {siteRows.length ? siteRows.map((site) => (
                <Link href="/operations" key={`${site.region}-${site.site}`}>
                  <span>{site.site}</span>
                  <div><i style={{ width: `${Math.max(8, Math.min(100, site.productivityScore))}%` }} /></div>
                  <strong>{site.productivityScore}%</strong>
                </Link>
              )) : <div className="empty-state">No site performance data is connected.</div>}
            </div>
          </article>

          <article className="ops-compliance-panel">
            <span className="eyebrow">Compliance</span>
            <div className="ops-gauge" style={{ "--score": `${complianceScore}%` } as CSSProperties}>
              <strong>{complianceScore}%</strong>
              <small>clear</small>
            </div>
            <p>{complianceOpenItems ? `${complianceOpenItems} compliance action${complianceOpenItems === 1 ? "" : "s"} open.` : "No open compliance actions in this scope."}</p>
            <Link href="/compliance">Open compliance</Link>
          </article>
        </section>

        <section className="ops-pathway-grid" aria-label="Operational pathways">
          {pathwayCards.map((card) => (
            <Link href={card.href} key={card.title}>
              <span>{card.label}</span>
              <strong>{card.title}</strong>
              <small>{card.detail}</small>
            </Link>
          ))}
        </section>

        <section className="ops-command-lower" aria-label="Command workflows">
          <article className="ops-workflow-panel">
            <div className="ops-panel-head">
              <div>
                <span className="eyebrow">Workflow control</span>
                <h3>What needs to move next</h3>
              </div>
              <Link href="/actions">Open Action Centre</Link>
            </div>
            <div className="ops-workflow-stack">
              {priorityActions.length ? priorityActions.map((item, index) => (
                <Link className={`ops-workflow-step ${item.severity}`} href={item.href} key={item.id}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.directive} - {item.region}</small>
                  </div>
                  <em>{item.status}</em>
                </Link>
              )) : (
                <div className="ops-workflow-empty">
                  <strong>No manager close-out items are open.</strong>
                  <small>The command queue is clear for this scope.</small>
                </div>
              )}
            </div>
          </article>

          <article className="ops-system-panel">
            <span className="eyebrow">Connected operating system</span>
            <h3>Jobs, people, compliance and Odin in one flow</h3>
            <div className="ops-system-orbit" aria-hidden="true">
              <span className="orbit-core">TOC</span>
              <span className="orbit-node node-jobs">Jobs</span>
              <span className="orbit-node node-staff">Staff</span>
              <span className="orbit-node node-odin">Odin</span>
              <span className="orbit-node node-compliance">Compliance</span>
              <span className="orbit-node node-assets">Assets</span>
            </div>
          </article>

          <article className="ops-readiness-panel">
            <div className="ops-panel-head">
              <div>
                <span className="eyebrow">Go-live readiness</span>
                <h3>Build pathway</h3>
              </div>
              <Link href="/operations-setup">Setup</Link>
            </div>
            <div className="ops-roadmap-list">
              {roadmapItems.map((item) => (
                <div className={`ops-roadmap-item ${item.severity}`} key={item.step}>
                  <span>{item.step}</span>
                  <strong>{item.title}</strong>
                  <small>{item.status}</small>
                </div>
              ))}
            </div>
          </article>
        </section>

        {isDirector ? (
          <section className="ops-director-panel" aria-label="Director broadcast">
            <div>
              <span className="eyebrow">Director broadcast</span>
              <h3>A Message From The Director</h3>
              <p>Set the business-wide message managers see inside TOC.</p>
            </div>
            <DirectorBroadcastControls />
          </section>
        ) : null}
      </section>
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
