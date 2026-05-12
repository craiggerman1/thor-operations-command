"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import type { EnhancedActionItem } from "@/lib/action-state";
import { tocFetch } from "@/lib/toc-client-auth";

const lifecycleButtons = [
  { status: "acknowledged", label: "Acknowledge", activeLabel: "Acknowledged" },
  { status: "in_progress", label: "Start Work", activeLabel: "In progress" },
  { status: "blocked", label: "Mark Blocked", activeLabel: "Blocked" },
  { status: "escalated", label: "Escalate", activeLabel: "Escalated" },
  { status: "reopened", label: "Reopen", activeLabel: "Reopened" }
];

type ActionDetailItem = EnhancedActionItem & {
  sourceHref?: string;
  closeFlow: string;
  closeActions: string[];
  reviewHistory?: {
    id: string;
    requestType: string;
    title: string;
    status: string;
    storageStatus: string;
    managerResponse: string;
    evidence: string;
    nationalResponse: string;
    submittedAt: string;
    reviewedAt: string | null;
    updatedAt: string | null;
    href: string;
  }[];
};

export default function ActionDetailPage() {
  const params = useParams<{ id: string }>();
  const [action, setAction] = useState<ActionDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [managerResponse, setManagerResponse] = useState("");
  const [evidence, setEvidence] = useState("");
  const [lifecycleNote, setLifecycleNote] = useState("");
  const [lifecycleEvidence, setLifecycleEvidence] = useState("");
  const [message, setMessage] = useState("");
  const [isUpdatingLifecycle, setIsUpdatingLifecycle] = useState(false);

  useEffect(() => {
    async function loadAction() {
      try {
        const session = JSON.parse(localStorage.getItem("toc.session") || "null");
        const scope = session?.scope || "National";
        const response = await tocFetch(`/api/actions?id=${encodeURIComponent(params.id)}&scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
        const payload = await response.json();
        setAction((payload.actions || [])[0] || null);
      } catch {
        setAction(null);
      } finally {
        setLoading(false);
      }
    }

    void loadAction();
  }, [params.id]);

  if (loading) {
    return (
      <TocShell>
        <PageIntro title="Action Centre" detail="Loading action item." />
        <section className="command-grid route-grid">
          <Panel wide eyebrow="Action close-out" title="Loading action">
            <div className="empty-state">Loading action detail from the database.</div>
          </Panel>
        </section>
      </TocShell>
    );
  }

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

  const currentAction = action;
  const sourceHref = currentAction.sourceHref || "/actions";
  const lifecycleStatus = String(currentAction.lifecycleStatus || currentAction.storageStatus || "").trim();
  const isAwaitingNational = currentAction.status === "Awaiting national review" || currentAction.status === "Resolved pending review" || lifecycleStatus === "submitted_for_review";
  const isClosed = currentAction.status === "Closed";
  const needsEvidence = currentAction.directive === "National Ops Directive" ||
    currentAction.severity === "red" ||
    /compliance|equipment|stock|jobsheet|safety/i.test(`${currentAction.source} ${currentAction.title} ${currentAction.detail}`);
  const responseReady = managerResponse.trim().length >= (needsEvidence ? 20 : 10);
  const evidenceReady = !needsEvidence || evidence.trim().length >= 8;
  const closeoutReady = responseReady && evidenceReady && !isAwaitingNational && !isClosed;
  const reviewHistory = currentAction.reviewHistory || [];

  function saveDraft() {
    localStorage.setItem(`toc.actionDraft.${currentAction.id}`, JSON.stringify({ managerResponse, evidence, updatedAt: new Date().toISOString() }));
    setMessage("Draft saved on this device.");
  }

  async function submitForNationalApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (managerResponse.trim().length < 10) {
      setMessage("Add a clear manager response before submitting for National approval.");
      return;
    }
    if (needsEvidence && managerResponse.trim().length < 20) {
      setMessage("Add a fuller close-out response for urgent, compliance, equipment, stock or jobsheet actions.");
      return;
    }
    if (needsEvidence && evidence.trim().length < 8) {
      setMessage("Add evidence or a reference before submitting this material action for National review.");
      return;
    }
    const response = await tocFetch("/api/national-requests", {
      method: "POST",
      body: JSON.stringify({
        action: "create",
        actionId: currentAction.id,
        managerResponse: managerResponse.trim() || "Manager submitted close-out with no additional response.",
        evidence: evidence.trim() || "No evidence or reference supplied."
      })
    }, true);
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "Could not submit this action for national approval.");
      return;
    }
    setAction({ ...currentAction, status: "Awaiting national review" });
    window.dispatchEvent(new Event("toc.actionState.updated"));
    window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    setMessage("Submitted to National Requests for approval.");
  }

  async function updateLifecycle(status: string) {
    if ((status === "blocked" || status === "escalated") && lifecycleNote.trim().length < 5) {
      setMessage("Add a short blocker or escalation note before updating this action.");
      return;
    }
    setIsUpdatingLifecycle(true);
    setMessage("");
    try {
      const response = await tocFetch("/api/actions", {
        method: "POST",
        body: JSON.stringify({ action: "lifecycle", id: currentAction.id, status, note: lifecycleNote.trim(), evidence: lifecycleEvidence.trim() })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Action lifecycle could not be updated.");
      const nextAction = (payload.actions || []).find((item: ActionDetailItem) => item.id === currentAction.id) || null;
      if (nextAction) setAction(nextAction);
      setLifecycleNote("");
      setLifecycleEvidence("");
      window.dispatchEvent(new Event("toc.actionState.updated"));
      window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
      setMessage("Action lifecycle updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action lifecycle could not be updated.");
    } finally {
      setIsUpdatingLifecycle(false);
    }
  }

  return (
    <TocShell>
      <PageIntro title="Action Centre" detail={`${currentAction.id} close-out workflow.`} />
      <FlowHeading eyebrow="Action Centre" title="Complete the required action, record the manager response, then submit for national approval." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow={currentAction.directive} title={currentAction.title} pill={`Due ${currentAction.dueDate}`}>
          <div className={`action-detail-shell ${currentAction.severity}`}>
            <aside className="action-detail-summary">
              <span className="eyebrow">{currentAction.source} - {currentAction.region}</span>
              <strong>{currentAction.title}</strong>
              <p>{currentAction.detail}</p>
              <div className="meta-row">
                <Tag tone={currentAction.severity}>{currentAction.directive}</Tag>
                <Tag tone={currentAction.lifecycleTone || "blue"}>{currentAction.lifecycleLabel || currentAction.status}</Tag>
                <Tag>{currentAction.region}</Tag>
              </div>
              <div className="action-lifecycle-panel">
                <span>Lifecycle status</span>
                <strong>{currentAction.lifecycleLabel || currentAction.status}</strong>
                <small>{currentAction.lifecycleHelp || "Use the buttons below to keep National and Odin clear on where this action sits."}</small>
                <label className="action-lifecycle-note">
                  <span>Blocker / escalation note</span>
                  <textarea value={lifecycleNote} placeholder="Required when marking blocked or escalated." onChange={(event) => setLifecycleNote(event.target.value)} />
                </label>
                <label className="action-lifecycle-note">
                  <span>Evidence / reference</span>
                  <input value={lifecycleEvidence} placeholder="Optional reference for National." onChange={(event) => setLifecycleEvidence(event.target.value)} />
                </label>
                <div className="action-lifecycle-buttons">
                  {lifecycleButtons.map((item) => (
                    <button
                      type="button"
                      key={item.status}
                      disabled={isUpdatingLifecycle || isAwaitingNational || isClosed || lifecycleStatus === item.status}
                      onClick={() => void updateLifecycle(item.status)}
                    >
                      {lifecycleStatus === item.status ? item.activeLabel : item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="action-due-panel">
                <span>Due date</span>
                <strong>{currentAction.dueDate}</strong>
                <small>{currentAction.closeFlow}</small>
              </div>
              <Link className="node-action" href={sourceHref}>Open source page</Link>
            </aside>
            <div className="action-closeout-panel">
              <div>
                <span className="eyebrow">Manager close-out steps</span>
                <strong>Actions required to clear this item</strong>
              </div>
              <ol className="action-closeout-steps">
                {currentAction.closeActions.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <div className="action-review-timeline">
                <div>
                  <span className="eyebrow">Review history</span>
                  <strong>{reviewHistory.length ? `${reviewHistory.length} National review event${reviewHistory.length === 1 ? "" : "s"}` : "No National review yet"}</strong>
                </div>
                {reviewHistory.length ? reviewHistory.map((event) => (
                  <article className="action-review-event" key={event.id}>
                    <div className="action-review-event-head">
                      <Tag tone={event.storageStatus === "approved" || event.storageStatus === "closed" ? "green" : event.storageStatus === "returned" ? "amber" : "blue"}>{event.status}</Tag>
                      <small>{new Date(event.submittedAt).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
                    </div>
                    <p>{event.managerResponse}</p>
                    <small>Evidence: {event.evidence}</small>
                    {event.nationalResponse ? <small>National: {event.nationalResponse}</small> : null}
                    <Link className="node-action" href={event.href}>Open review</Link>
                  </article>
                )) : (
                  <small className="admin-hint-message">Submit this item for National review once the manager response and evidence are ready.</small>
                )}
              </div>
              <form className="action-closeout-form" onSubmit={(event) => void submitForNationalApproval(event)}>
                <div className="closeout-quality-panel">
                  <span className="eyebrow">Close-out quality gate</span>
                  <div className="meta-row">
                    <Tag tone={responseReady ? "green" : "amber"}>{responseReady ? "Response ready" : needsEvidence ? "Response needs detail" : "Response required"}</Tag>
                    <Tag tone={evidenceReady ? "green" : "amber"}>{evidenceReady ? "Evidence ready" : "Evidence/reference required"}</Tag>
                  </div>
                  <small>{needsEvidence ? "Material actions need a clear response plus evidence or a reference before National review." : "Routine actions need a clear manager response before National review."}</small>
                </div>
                <label>
                  <span>Manager response</span>
                  <textarea value={managerResponse} placeholder="Record what was checked, what was fixed, and any remaining risk." onChange={(event) => setManagerResponse(event.target.value)} />
                </label>
                <label>
                  <span>Evidence / reference</span>
                  <input value={evidence} placeholder="Example: Fleetio checked, jobsheets approved, stock order raised, photo/evidence uploaded later" onChange={(event) => setEvidence(event.target.value)} />
                </label>
                <div className="action-closeout-buttons">
                  <button type="button" onClick={saveDraft}>Save Draft</button>
                  <button type="submit" disabled={!closeoutReady}>{isAwaitingNational ? "Awaiting National Review" : isClosed ? "Closed" : "Submit For National Approval"}</button>
                </div>
                {message ? <small className="admin-hint-message">{message}</small> : null}
              </form>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
