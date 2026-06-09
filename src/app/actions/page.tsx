"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
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

type QueueFilter = "operational" | "all" | "overdue" | "blocked" | "review" | "carryover" | "system";

type EvidenceAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  url: string;
  purpose: string;
};

type ActionDraft = {
  response: string;
  evidence: string;
  blocker: string;
  blockerEvidence: string;
  attachments: EvidenceAttachment[];
  blockedAttachments: EvidenceAttachment[];
  message: string;
  busy: boolean;
  uploading: boolean;
};

type ActionQueueGroup = {
  id: string;
  title: string;
  detail: string;
  tone: "red" | "amber" | "blue" | "green";
  actions: EnhancedActionItem[];
};

const emptyActionDraft: ActionDraft = {
  response: "",
  evidence: "",
  blocker: "",
  blockerEvidence: "",
  attachments: [],
  blockedAttachments: [],
  message: "",
  busy: false,
  uploading: false
};

type RosterActionGroup = {
  id: string;
  title: string;
  source: string;
  detail: string;
  recommendedAction: string;
  count: number;
  affectedJobCount: number;
  regionCounts: Record<string, number>;
  severity: "red" | "amber" | "blue" | "green";
  dueDate: string;
  href: string;
  gaps: {
    id: string;
    title: string;
    region: string;
    severity: string;
    gapType: string;
    dueDate: string;
    reason: string;
    recommendedAction: string;
    requiredCrew: number;
    assignedCrewCount: number;
    staffSuggestionNames: string[];
    availabilityDetail?: {
      explanation: string;
      bufferHours: number;
      checkedWindows: { day: string; window: string; status: string | null; bufferStart: string; windowEnd: string }[];
    } | null;
    availabilityDiagnostics?: {
      id: string;
      name: string;
      sheetName: string;
      available: boolean | null;
      checkedWindows: { day: string; window: string; status: string | null; bufferStart: string; windowEnd: string }[];
      explanation: string;
    }[];
  }[];
};

export default function ActionsPage() {
  const [openActions, setOpenActions] = useState<EnhancedActionItem[]>([]);
  const [message, setMessage] = useState("");
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [scope, setScope] = useState("National");
  const [role, setRole] = useState<AccessRole>("manager");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("operational");
  const [rosterGroups, setRosterGroups] = useState<RosterActionGroup[]>([]);
  const [expandedRosterGroupId, setExpandedRosterGroupId] = useState<string | null>(null);
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [actionDrafts, setActionDrafts] = useState<Record<string, ActionDraft>>({});
  const [isSyncingGenerated, setIsSyncingGenerated] = useState(false);
  const scopedActions = getScopedActionItems(openActions, scope, role);
  const filteredActions = scopedActions.filter((action) => actionMatchesQueueFilter(action, queueFilter));
  const sortedActions = [...filteredActions].sort((a, b) => (directivePriority[a.directive as keyof typeof directivePriority] || 9) - (directivePriority[b.directive as keyof typeof directivePriority] || 9));
  const canQuickManage = role === "admin" || (role === "manager" && scope === "National");
  const canQuickProgress = role === "admin" || role === "manager";
  const closureSummary = buildClosureSummary(scopedActions);
  const systemDataActions = scopedActions.filter(isSystemDataAction);
  const operationalActions = scopedActions.filter((action) => !isSystemDataAction(action));
  const queueFilters: { value: QueueFilter; label: string; count: number }[] = [
    { value: "operational", label: "Operational", count: operationalActions.length },
    { value: "all", label: "All", count: scopedActions.length },
    { value: "overdue", label: "Overdue", count: closureSummary.overdue },
    { value: "blocked", label: "Blocked", count: closureSummary.blocked },
    { value: "review", label: "Review", count: closureSummary.review },
    { value: "carryover", label: "Carryover", count: closureSummary.carryover },
    { value: "system", label: "System/Data", count: systemDataActions.length }
  ];
  const queueGroups = useMemo(() => buildActionQueueGroups(sortedActions), [sortedActions]);

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
        const response = await tocFetch(`/api/actions?scope=${encodeURIComponent(nextScope)}&fast=true`, { cache: "no-store" });
        const payload = await response.json();
        const actions = (payload.actions || []) as EnhancedActionItem[];
        setOpenActions(actions.filter((item) => item.status !== "Closed"));
        setRosterGroups((payload.rosterGroups || []) as RosterActionGroup[]);
      } catch {
        setOpenActions([]);
        setRosterGroups([]);
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

  function draftFor(actionId: string): ActionDraft {
    return actionDrafts[actionId] || emptyActionDraft;
  }

  function patchDraft(actionId: string, patch: Partial<ActionDraft>) {
    setActionDrafts((current) => ({
      ...current,
      [actionId]: {
        ...emptyActionDraft,
        ...(current[actionId] || {}),
        ...patch
      }
    }));
  }

  function replaceAction(nextAction: EnhancedActionItem) {
    setOpenActions((items) => items.map((item) => item.id === nextAction.id ? nextAction : item));
  }

  async function refreshAction(id: string) {
    const response = await tocFetch(`/api/actions?id=${encodeURIComponent(id)}&scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Action refresh failed.");
    const nextAction = ((payload.actions || []) as EnhancedActionItem[])[0];
    if (nextAction) replaceAction(nextAction);
  }

  async function syncGeneratedItems() {
    setIsSyncingGenerated(true);
    setMessage("");
    try {
      const response = await tocFetch(`/api/actions?scope=${encodeURIComponent(scope)}&refresh=true`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Generated action sync failed.");
      setOpenActions(((payload.actions || []) as EnhancedActionItem[]).filter((item) => item.status !== "Closed"));
      setRosterGroups((payload.rosterGroups || []) as RosterActionGroup[]);
      setMessage("Generated action checks synced.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Generated action sync failed.");
    } finally {
      setIsSyncingGenerated(false);
    }
  }

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
    const note = status === "blocked"
      ? window.prompt("What is blocking this action? This will be sent to National for visibility.")?.trim()
      : "";
    if (status === "blocked" && !note) {
      setMessage("Add a blocker reason before marking the action blocked.");
      return;
    }

    setBusyActionId(id);
    setMessage("");
    try {
      const response = await tocFetch("/api/actions", {
        method: "POST",
        body: JSON.stringify({ action: "lifecycle", id, status, note })
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

  async function uploadInlineEvidence(actionId: string, file: File, purpose: "closeout" | "blocked") {
    patchDraft(actionId, { uploading: true, message: "" });
    try {
      const formData = new FormData();
      formData.set("actionId", actionId);
      formData.set("purpose", purpose);
      formData.set("file", file);
      const response = await tocFetch("/api/action-evidence", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Evidence file could not be uploaded.");
      const attachment = payload.attachment as EvidenceAttachment | null;
      if (attachment) {
        const draft = draftFor(actionId);
        patchDraft(actionId, purpose === "blocked"
          ? { blockedAttachments: [...draft.blockedAttachments.filter((item) => item.id !== attachment.id), attachment], message: "Evidence uploaded." }
          : { attachments: [...draft.attachments.filter((item) => item.id !== attachment.id), attachment], message: "Evidence uploaded." });
      }
    } catch (error) {
      patchDraft(actionId, { message: error instanceof Error ? error.message : "Evidence file could not be uploaded." });
    } finally {
      patchDraft(actionId, { uploading: false });
    }
  }

  async function submitInlineCloseout(event: FormEvent<HTMLFormElement>, action: EnhancedActionItem) {
    event.preventDefault();
    const draft = draftFor(action.id);
    const materialAction = action.directive === "National Ops Directive" ||
      action.severity === "red" ||
      /compliance|equipment|stock|jobsheet|safety/i.test(`${action.source} ${action.title} ${action.detail}`);
    if (draft.response.trim().length < 5) {
      patchDraft(action.id, { message: "Add a short clear close-out before submitting." });
      return;
    }
    if (materialAction && draft.evidence.trim().length < 8 && !draft.attachments.length) {
      patchDraft(action.id, { message: "Add a reference or photo for this material action." });
      return;
    }

    patchDraft(action.id, { busy: true, message: "" });
    try {
      const response = await tocFetch("/api/national-requests", {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          actionId: action.id,
          managerResponse: draft.response.trim(),
          evidence: draft.evidence.trim() || (draft.attachments.length ? "Photo evidence uploaded." : "No evidence or reference supplied."),
          attachmentIds: draft.attachments.map((item) => item.id)
        })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not submit close-out for National review.");
      await refreshAction(action.id);
      patchDraft(action.id, { response: "", evidence: "", attachments: [], busy: false, message: "Sent to National review." });
      window.dispatchEvent(new Event("toc.actionState.updated"));
      window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    } catch (error) {
      patchDraft(action.id, { busy: false, message: error instanceof Error ? error.message : "Could not submit close-out for National review." });
    }
  }

  async function submitInlineBlocked(action: EnhancedActionItem) {
    const draft = draftFor(action.id);
    if (draft.blocker.trim().length < 5) {
      patchDraft(action.id, { message: "Add a clear blocker reason first." });
      return;
    }

    patchDraft(action.id, { busy: true, message: "" });
    try {
      const response = await tocFetch("/api/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "lifecycle",
          id: action.id,
          status: "blocked",
          note: draft.blocker.trim(),
          evidence: draft.blockerEvidence.trim() || (draft.blockedAttachments.length ? "Photo evidence uploaded." : ""),
          attachmentIds: draft.blockedAttachments.map((item) => item.id)
        })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not submit blocked update.");
      const nextAction = ((payload.actions || []) as EnhancedActionItem[]).find((item) => item.id === action.id);
      if (nextAction) replaceAction(nextAction);
      patchDraft(action.id, { blocker: "", blockerEvidence: "", blockedAttachments: [], busy: false, message: "Blocked item sent to National." });
      window.dispatchEvent(new Event("toc.actionState.updated"));
      window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    } catch (error) {
      patchDraft(action.id, { busy: false, message: error instanceof Error ? error.message : "Could not submit blocked update." });
    }
  }

  function expandActionWithKeyboard(event: KeyboardEvent<HTMLElement>, actionId: string) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("input, textarea, select, button, a, summary, label")) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setExpandedActionId((current) => current === actionId ? null : actionId);
  }

  function stopCardOpen(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function toggleRosterGroup(groupId: string) {
    setExpandedRosterGroupId((current) => current === groupId ? null : groupId);
  }

  return (
    <TocShell>
      <PageIntro title="Action Centre" detail="Ensure all items are actioned and then cleared." />
      <FlowHeading eyebrow="Action Centre" title="Ensure all items are actioned, owned, escalated where needed, and then cleared from the queue." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Priority command queue" title="Action Centre command queue" pill={`${sortedActions.length} shown / ${scopedActions.length} open`}>
          {message ? <div className="admin-hint-message">{message}</div> : null}
          <div className="action-command-strip">
            <div>
              <strong>{closureSummary.review} waiting National review</strong>
              <small>{closureSummary.blocked} blocked, {closureSummary.overdue} overdue, {closureSummary.carryover} carryover. Normal queue reads are fast; generated checks run only when requested.</small>
            </div>
            <button type="button" onClick={() => void syncGeneratedItems()} disabled={isSyncingGenerated}>{isSyncingGenerated ? "Syncing..." : "Sync generated checks"}</button>
          </div>
          <div className="action-filter-strip" aria-label="Action queue filters">
            {queueFilters.map((filter) => (
              <button
                type="button"
                key={filter.value}
                className={queueFilter === filter.value ? "active" : ""}
                onClick={() => setQueueFilter(filter.value)}
              >
                <span>{filter.label}</span>
                <strong>{filter.count}</strong>
              </button>
            ))}
          </div>
          {rosterGroups.length ? (
            <div className="roster-action-group-list" aria-label="Grouped roster risk actions">
              {rosterGroups.map((group) => {
                const isExpanded = expandedRosterGroupId === group.id;
                const regionSummary = Object.entries(group.regionCounts).map(([regionName, count]) => `${regionName}: ${count}`).join(" | ");
                return (
                  <article
                    className={`signal-action-card roster-action-group action-card-clickable ${group.severity}`}
                    key={group.id}
                    role="button"
                    tabIndex={0}
                    title="Open grouped roster detail"
                    onClick={() => toggleRosterGroup(group.id)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      toggleRosterGroup(group.id);
                    }}
                    aria-expanded={isExpanded}
                  >
                    <div>
                      <span className="eyebrow">{group.source} - grouped roster risk</span>
                      <strong>{group.title}</strong>
                      <small>{group.detail}</small>
                      <span className="action-due-date">{group.count} findings across {group.affectedJobCount} job{group.affectedJobCount === 1 ? "" : "s"}{regionSummary ? ` - ${regionSummary}` : ""}</span>
                    </div>
                    <div className="signal-action-controls">
                      <Tag tone={group.severity}>{group.severity === "red" ? "High risk" : "Needs review"}</Tag>
                      <button className="node-action" type="button" onClick={(event) => { event.stopPropagation(); toggleRosterGroup(group.id); }}>
                        {isExpanded ? "Hide Detail" : "View Detail"}
                      </button>
                      <Link className="node-action" href={group.href} onClick={stopCardOpen}>Open Staff Availability</Link>
                    </div>
                    {isExpanded ? (
                      <div className="roster-action-group-detail" onClick={stopCardOpen}>
                        <div className="closeout-quality-panel">
                          <span className="eyebrow">Odin recommended action</span>
                          <small>{group.recommendedAction}</small>
                        </div>
                        <div className="roster-action-gap-table">
                          {group.gaps.map((gap) => (
                            <article key={gap.id}>
                              <div>
                                <strong>{gap.title}</strong>
                                <small>{gap.region} - {gap.dueDate} - {gap.gapType.replace(/-/g, " ")}</small>
                              </div>
                              <p>{gap.reason}</p>
                              <small>{gap.recommendedAction}</small>
                              {gap.availabilityDetail || gap.availabilityDiagnostics?.length ? (
                                <div className="action-closure-meta">
                                  <Tag tone="blue">2h buffer applied</Tag>
                                  {gap.availabilityDetail?.checkedWindows?.slice(0, 2).map((check) => (
                                    <Tag key={`${gap.id}-${check.day}-${check.window}`} tone={check.status === "Available" ? "green" : check.status === "Not Available" ? "red" : "amber"}>
                                      {check.day} {check.window}: {check.status || "No entry"}
                                    </Tag>
                                  ))}
                                  {!gap.availabilityDetail?.checkedWindows?.length && gap.availabilityDiagnostics?.[0]?.checkedWindows?.[0] ? (
                                    <Tag tone="amber">{gap.availabilityDiagnostics[0].checkedWindows[0].day} {gap.availabilityDiagnostics[0].checkedWindows[0].window}</Tag>
                                  ) : null}
                                </div>
                              ) : null}
                              {gap.availabilityDiagnostics?.length ? (
                                <small>
                                  Why flagged: {gap.availabilityDiagnostics.slice(0, 4).map((staff) => {
                                    const statuses = staff.checkedWindows.map((check) => `${check.day} ${check.window} ${check.status || "No entry"}`).join(", ");
                                    return `${staff.name}: ${statuses || "no sheet match"}`;
                                  }).join(" | ")}
                                </small>
                              ) : null}
                              <span>{gap.assignedCrewCount || 0}/{gap.requiredCrew || 0} crew visible</span>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
          <div className="signal-action-list action-queue-stack">
            {queueGroups.map((group) => (
              <details className={`action-queue-group ${group.tone}`} key={group.id} open={group.id !== "monitoring"}>
                <summary>
                  <span>{group.title}</span>
                  <small>{group.detail}</small>
                  <strong>{group.actions.length}</strong>
                </summary>
                <div className="action-queue-group-body">
                  {group.actions.map((signal) => renderActionRow(signal))}
                </div>
              </details>
            ))}
            {sortedActions.length ? null : <div className="empty-state">No open action items currently require manager close-out.</div>}
          </div>
        </Panel>
      </section>
    </TocShell>
  );

  function renderActionRow(signal: EnhancedActionItem) {
    const isExpanded = expandedActionId === signal.id;
    const draft = draftFor(signal.id);
    const awaitingReview = signal.lifecycleStatus === "submitted_for_review";
    const closed = signal.lifecycleStatus === "closed";
    const rowBusy = busyActionId === signal.id || draft.busy || draft.uploading;
    const materialAction = signal.directive === "National Ops Directive" ||
      signal.severity === "red" ||
      /compliance|equipment|stock|jobsheet|safety/i.test(`${signal.source} ${signal.title} ${signal.detail}`);

    return (
      <article
        id={signal.id}
        className={`signal-action-card action-card-clickable action-work-row ${signal.severity} ${isExpanded ? "is-expanded" : ""}`}
        key={signal.id}
        role="button"
        tabIndex={0}
        title="Expand action work panel"
        onClick={() => setExpandedActionId((current) => current === signal.id ? null : signal.id)}
        onKeyDown={(event) => expandActionWithKeyboard(event, signal.id)}
        aria-expanded={isExpanded}
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
          <button className="node-action" type="button" onClick={(event) => { event.stopPropagation(); setExpandedActionId((current) => current === signal.id ? null : signal.id); }}>
            {isExpanded ? "Collapse" : "Work"}
          </button>
          <Link className="node-action" href={signal.href} onClick={stopCardOpen}>History</Link>
          {canQuickProgress ? (
            <div className="quick-action-controls" onClick={stopCardOpen}>
              <button type="button" onClick={(event) => { event.stopPropagation(); void updateActionLifecycle(signal.id, "acknowledged"); }} disabled={rowBusy || signal.lifecycleStatus === "acknowledged" || awaitingReview}>Seen</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); void updateActionLifecycle(signal.id, "in_progress"); }} disabled={rowBusy || signal.lifecycleStatus === "in_progress" || awaitingReview}>Start</button>
            </div>
          ) : null}
          {canQuickManage ? (
            <div className="quick-action-controls" onClick={stopCardOpen}>
              <button type="button" onClick={(event) => { event.stopPropagation(); void mutateActionItem(signal.id, "clear"); }} disabled={rowBusy}>Clear</button>
              <button className="danger-button" type="button" onClick={(event) => { event.stopPropagation(); void mutateActionItem(signal.id, "delete"); }} disabled={rowBusy}>Delete</button>
            </div>
          ) : null}
        </div>
        {isExpanded ? (
          <div className="inline-action-workbench" onClick={stopCardOpen}>
            <form className="inline-closeout-form" onSubmit={(event) => void submitInlineCloseout(event, signal)}>
              <div>
                <strong>{awaitingReview ? "Already with National" : "Fast close-out"}</strong>
                <small>{materialAction ? "Add the result plus evidence/reference, then send it to National." : "Add a short result and send it for review."}</small>
              </div>
              <textarea value={draft.response} placeholder="What was done?" disabled={awaitingReview || closed} onChange={(event) => patchDraft(signal.id, { response: event.target.value })} />
              <div className="inline-evidence-row">
                <input value={draft.evidence} placeholder={materialAction ? "Evidence/reference required" : "Evidence/reference optional"} disabled={awaitingReview || closed} onChange={(event) => patchDraft(signal.id, { evidence: event.target.value })} />
                <label>
                  <span>Upload</span>
                  <input type="file" accept="image/*,.pdf" disabled={rowBusy || awaitingReview || closed} onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadInlineEvidence(signal.id, file, "closeout");
                    event.currentTarget.value = "";
                  }} />
                </label>
              </div>
              {draft.attachments.length ? <div className="manager-evidence-list">{draft.attachments.map((file) => <a href={file.url} target="_blank" rel="noreferrer" key={file.id}>{file.fileName}</a>)}</div> : null}
              <button type="submit" disabled={rowBusy || awaitingReview || closed}>{awaitingReview ? "Waiting for National" : "Submit to National"}</button>
            </form>
            <details className="inline-blocked-form">
              <summary>Cannot complete yet</summary>
              <div>
                <textarea value={draft.blocker} placeholder="What is blocking this?" disabled={awaitingReview || closed} onChange={(event) => patchDraft(signal.id, { blocker: event.target.value })} />
                <div className="inline-evidence-row">
                  <input value={draft.blockerEvidence} placeholder="Reference or note" disabled={awaitingReview || closed} onChange={(event) => patchDraft(signal.id, { blockerEvidence: event.target.value })} />
                  <label>
                    <span>Upload</span>
                    <input type="file" accept="image/*,.pdf" disabled={rowBusy || awaitingReview || closed} onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadInlineEvidence(signal.id, file, "blocked");
                      event.currentTarget.value = "";
                    }} />
                  </label>
                </div>
                {draft.blockedAttachments.length ? <div className="manager-evidence-list">{draft.blockedAttachments.map((file) => <a href={file.url} target="_blank" rel="noreferrer" key={file.id}>{file.fileName}</a>)}</div> : null}
                <button type="button" disabled={rowBusy || awaitingReview || closed} onClick={() => void submitInlineBlocked(signal)}>Send blocker to National</button>
              </div>
            </details>
            {draft.message ? <small className="manager-action-message">{draft.message}</small> : null}
          </div>
        ) : null}
      </article>
    );
  }
}

function buildClosureSummary(actions: EnhancedActionItem[]) {
  return actions.reduce((summary, action) => ({
    overdue: summary.overdue + (action.isOverdue ? 1 : 0),
    stale: summary.stale + (action.isStale ? 1 : 0),
    carryover: summary.carryover + (action.isCarryover ? 1 : 0),
    craigEscalations: summary.craigEscalations + (action.escalationLevel === "craig" ? 1 : 0),
    blocked: summary.blocked + (action.lifecycleStatus === "blocked" ? 1 : 0),
    inProgress: summary.inProgress + (action.lifecycleStatus === "in_progress" ? 1 : 0),
    review: summary.review + (action.lifecycleStatus === "submitted_for_review" ? 1 : 0)
  }), { overdue: 0, stale: 0, carryover: 0, craigEscalations: 0, blocked: 0, inProgress: 0, review: 0 });
}

function isSystemDataAction(action: EnhancedActionItem) {
  const text = `${action.source} ${action.title} ${action.detail}`.toLowerCase();
  return action.source === "Admin Settings" ||
    /\b(system|data|database|schema|source|feed|api|integration|sync|mapping|profile table|staff profile|visibility|rls|permission|auth|configuration|config|watcher|heartbeat|cron)\b/.test(text);
}

function actionMatchesQueueFilter(action: EnhancedActionItem, filter: QueueFilter) {
  if (filter === "operational") return !isSystemDataAction(action);
  if (filter === "all") return true;
  if (filter === "overdue") return action.isOverdue;
  if (filter === "blocked") return action.lifecycleStatus === "blocked";
  if (filter === "review") return action.lifecycleStatus === "submitted_for_review";
  if (filter === "carryover") return action.isCarryover;
  if (filter === "system") return isSystemDataAction(action);
  return true;
}

function buildActionQueueGroups(actions: EnhancedActionItem[]): ActionQueueGroup[] {
  const groups: ActionQueueGroup[] = [
    {
      id: "manager-action",
      title: "Manager action",
      detail: "Work that can be closed or blocked now.",
      tone: "red",
      actions: actions.filter((action) => !["submitted_for_review", "blocked", "returned_to_manager", "closed"].includes(String(action.lifecycleStatus || "")))
    },
    {
      id: "returned",
      title: "Returned / needs more",
      detail: "National needs a better answer or evidence.",
      tone: "red",
      actions: actions.filter((action) => action.lifecycleStatus === "returned_to_manager" || action.lifecycleStatus === "reopened")
    },
    {
      id: "blocked",
      title: "Blocked",
      detail: "Manager has flagged a blocker for National visibility.",
      tone: "amber",
      actions: actions.filter((action) => action.lifecycleStatus === "blocked")
    },
    {
      id: "review",
      title: "With National",
      detail: "Submitted close-outs waiting for approval.",
      tone: "blue",
      actions: actions.filter((action) => action.lifecycleStatus === "submitted_for_review")
    }
  ];

  return groups.filter((group) => group.actions.length);
}
