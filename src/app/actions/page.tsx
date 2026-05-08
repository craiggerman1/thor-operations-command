"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import type { EnhancedActionItem } from "@/lib/action-state";
import type { AccessRole } from "@/lib/access";
import { getScopedActionItems } from "@/lib/scope-utils";
import { tocFetch } from "@/lib/toc-client-auth";

const directivePriority = {
  "National Ops Directive": 1,
  "Scheduled Directive": 2,
  "To Do": 3
};

export default function ActionsPage() {
  const router = useRouter();
  const [openActions, setOpenActions] = useState<EnhancedActionItem[]>([]);
  const [message, setMessage] = useState("");
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [scope, setScope] = useState("National");
  const [role, setRole] = useState<AccessRole>("manager");
  const scopedActions = getScopedActionItems(openActions, scope, role);
  const sortedActions = [...scopedActions].sort((a, b) => (directivePriority[a.directive as keyof typeof directivePriority] || 9) - (directivePriority[b.directive as keyof typeof directivePriority] || 9));
  const canQuickManage = role === "admin" || (role === "manager" && scope === "National");
  const canQuickProgress = role === "admin" || role === "manager";
  const closureSummary = buildClosureSummary(sortedActions);
  const managerWorkload = buildManagerWorkload(sortedActions);
  const repeatGroups = buildRepeatGroups(sortedActions);

  useEffect(() => {
    function syncSession(event?: Event) {
      try {
        const storedSession = JSON.parse(localStorage.getItem("toc.session") || "null");
        setRole(storedSession?.role || "manager");
        setScope(event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : storedSession?.scope || "National");
      } catch {
        setRole("manager");
        setScope("National");
      }
    }

    async function syncActions() {
      try {
        const storedSession = JSON.parse(localStorage.getItem("toc.session") || "null");
        const nextScope = storedSession?.scope || "National";
        const response = await tocFetch(`/api/actions?scope=${encodeURIComponent(nextScope)}`, { cache: "no-store" });
        const payload = await response.json();
        const actions = (payload.actions || []) as EnhancedActionItem[];
        setOpenActions(actions.filter((item) => item.status !== "Closed"));
      } catch {
        setOpenActions([]);
      }
    }

    syncSession();
    void syncActions();
    window.addEventListener("storage", syncSession);
    window.addEventListener("toc.scopechange", syncSession);
    window.addEventListener("toc.sessionchange", syncSession);
    window.addEventListener("storage", syncActions);
    window.addEventListener("toc.actionState.updated", syncActions);
    const refreshInterval = window.setInterval(syncActions, 30000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("toc.scopechange", syncSession);
      window.removeEventListener("toc.sessionchange", syncSession);
      window.removeEventListener("storage", syncActions);
      window.removeEventListener("toc.actionState.updated", syncActions);
    };
  }, []);

  async function mutateActionItem(id: string, action: "clear" | "delete") {
    const target = openActions.find((item) => item.id === id);
    if (!target) return;

    if (action === "delete" && !window.confirm("Are you sure you want to delete this action item?")) return;
    if (action === "clear" && !window.confirm("Clear this action item from the active queue?")) return;

    setBusyActionId(id);
    setMessage("");
    try {
      const body = action === "delete"
        ? { action: "delete", id }
        : { action: "update", id, updates: { status: "closed" } };
      const response = await tocFetch("/api/actions", {
        method: "POST",
        body: JSON.stringify(body)
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Action item could not be updated.");

      setOpenActions((items) => items.filter((item) => item.id !== id));
      setMessage(action === "delete" ? "Action item deleted." : "Action item cleared.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action item could not be updated.");
    } finally {
      setBusyActionId(null);
    }
  }

  async function updateActionLifecycle(id: string, status: "acknowledged" | "in_progress" | "blocked") {
    const target = openActions.find((item) => item.id === id);
    if (!target || busyActionId === id) return;

    setBusyActionId(id);
    setMessage("");
    try {
      const response = await tocFetch("/api/actions", {
        method: "POST",
        body: JSON.stringify({ action: "lifecycle", id, status })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Action lifecycle could not be updated.");

      const updatedAction = ((payload.actions || []) as EnhancedActionItem[]).find((item) => item.id === id);
      if (updatedAction) {
        setOpenActions((items) => items.map((item) => item.id === id ? updatedAction : item));
      }
      setMessage("Action status updated.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action lifecycle could not be updated.");
    } finally {
      setBusyActionId(null);
    }
  }

  function openAction(href: string) {
    router.push(href);
  }

  function openActionWithKeyboard(event: KeyboardEvent<HTMLElement>, href: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openAction(href);
  }

  function stopCardOpen(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  return (
    <TocShell>
      <PageIntro title="Action Centre" detail="Ensure all items are actioned and then cleared." />
      <FlowHeading eyebrow="Action Centre" title="Ensure all items are actioned, owned, escalated where needed, and then cleared from the queue." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Odin closure control" title="Action ageing and escalation" pill={`${closureSummary.carryover} carryover`}>
          <div className="closure-control-grid">
            <ClosureMetric label="Open actions" value={sortedActions.length} tone={sortedActions.length ? "amber" : "green"} />
            <ClosureMetric label="Overdue" value={closureSummary.overdue} tone={closureSummary.overdue ? "red" : "green"} />
            <ClosureMetric label="Stale >24h" value={closureSummary.stale} tone={closureSummary.stale ? "amber" : "green"} />
            <ClosureMetric label="Craig escalation" value={closureSummary.craigEscalations} tone={closureSummary.craigEscalations ? "red" : "green"} />
          </div>
          <div className="manager-workload-grid">
            {managerWorkload.map((item) => (
              <article className={`manager-workload-card ${item.tone}`} key={item.region}>
                <span>{item.region}</span>
                <strong>{item.total}</strong>
                <small>{item.overdue} overdue / {item.carryover} carryover</small>
              </article>
            ))}
            {managerWorkload.length ? null : <div className="empty-state">No manager workload pressure currently open.</div>}
          </div>
          {repeatGroups.length ? (
            <div className="repeat-issue-strip">
              <span className="eyebrow">Repeated issue watch</span>
              {repeatGroups.map((group) => <Tag tone="amber" key={group.key}>{group.count} x {group.label}</Tag>)}
            </div>
          ) : null}
        </Panel>
        <Panel wide eyebrow="Priority command queue" title="Action Centre command queue" pill={`${sortedActions.length} open actions`}>
          {message ? <div className="admin-hint-message">{message}</div> : null}
          <div className="signal-action-list">
            {sortedActions.map((signal) => (
              <article
                id={signal.id}
                className={`signal-action-card action-card-clickable ${signal.severity}`}
                key={signal.id}
                role="button"
                tabIndex={0}
                title="Open action close-out"
                onClick={() => openAction(signal.href)}
                onKeyDown={(event) => openActionWithKeyboard(event, signal.href)}
              >
                <div>
                  <span className="eyebrow">{signal.source} - {signal.region}</span>
                  <strong>{signal.title}</strong>
                  <small>{signal.detail}</small>
                  <span className="action-due-date">Due: {signal.dueDate}</span>
                  <div className="action-closure-meta">
                    <Tag tone={signal.lifecycleTone || "blue"}>{signal.lifecycleLabel || signal.status}</Tag>
                    <Tag tone={signal.isOverdue ? "red" : signal.isStale || signal.isDueSoon ? "amber" : "green"}>{signal.ageLabel || "New"}</Tag>
                    <Tag tone={signal.escalationLevel === "craig" ? "red" : signal.escalationLevel === "national" ? "amber" : "blue"}>{signal.escalationLabel || "On track"}</Tag>
                  </div>
                </div>
                <div className="signal-action-controls">
                  <Tag tone={signal.severity}>{signal.directive}</Tag>
                  <Link className="node-action" href={signal.href} onClick={stopCardOpen}>Open</Link>
                  {canQuickProgress ? (
                    <div className="quick-action-controls" onClick={stopCardOpen}>
                      <button type="button" onClick={(event) => { event.stopPropagation(); void updateActionLifecycle(signal.id, "acknowledged"); }} disabled={busyActionId === signal.id || signal.lifecycleStatus === "acknowledged"}>Acknowledge</button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); void updateActionLifecycle(signal.id, "in_progress"); }} disabled={busyActionId === signal.id || signal.lifecycleStatus === "in_progress"}>Start</button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); void updateActionLifecycle(signal.id, "blocked"); }} disabled={busyActionId === signal.id || signal.lifecycleStatus === "blocked"}>Blocked</button>
                    </div>
                  ) : null}
                  {canQuickManage ? (
                    <div className="quick-action-controls" onClick={stopCardOpen}>
                      <button type="button" onClick={(event) => { event.stopPropagation(); void mutateActionItem(signal.id, "clear"); }} disabled={busyActionId === signal.id}>Clear</button>
                      <button className="danger-button" type="button" onClick={(event) => { event.stopPropagation(); void mutateActionItem(signal.id, "delete"); }} disabled={busyActionId === signal.id}>Delete</button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            {sortedActions.length ? null : <div className="empty-state">No open action items currently require manager close-out.</div>}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}

function buildClosureSummary(actions: EnhancedActionItem[]) {
  return actions.reduce((summary, action) => ({
    overdue: summary.overdue + (action.isOverdue ? 1 : 0),
    stale: summary.stale + (action.isStale ? 1 : 0),
    carryover: summary.carryover + (action.isCarryover ? 1 : 0),
    craigEscalations: summary.craigEscalations + (action.escalationLevel === "craig" ? 1 : 0)
  }), { overdue: 0, stale: 0, carryover: 0, craigEscalations: 0 });
}

function buildManagerWorkload(actions: EnhancedActionItem[]) {
  const workload = actions.reduce<Record<string, { region: string; total: number; overdue: number; carryover: number }>>((lookup, action) => {
    const region = action.region || "National";
    const current = lookup[region] || { region, total: 0, overdue: 0, carryover: 0 };
    lookup[region] = {
      ...current,
      total: current.total + 1,
      overdue: current.overdue + (action.isOverdue ? 1 : 0),
      carryover: current.carryover + (action.isCarryover ? 1 : 0)
    };
    return lookup;
  }, {});

  return Object.values(workload)
    .sort((a, b) => b.overdue - a.overdue || b.carryover - a.carryover || b.total - a.total)
    .map((item) => ({
      ...item,
      tone: item.overdue ? "red" : item.carryover ? "amber" : "green" as "red" | "amber" | "green"
    }));
}

function normaliseRepeatKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildRepeatGroups(actions: EnhancedActionItem[]) {
  const groups = actions.reduce<Record<string, { key: string; label: string; count: number }>>((lookup, action) => {
    const label = `${action.region} ${action.source} ${normaliseRepeatKey(action.title)}`;
    const key = normaliseRepeatKey(label);
    const current = lookup[key] || { key, label: action.title, count: 0 };
    lookup[key] = { ...current, count: current.count + 1 };
    return lookup;
  }, {});

  return Object.values(groups)
    .filter((group) => group.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

function ClosureMetric({ label, value, tone }: { label: string; value: number; tone: "red" | "amber" | "green" }) {
  return (
    <article className={`closure-metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
