"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { AskOdinButton } from "@/components/AskOdinButton";
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
};

export default function ActionDetailPage() {
  const params = useParams<{ id: string }>();
  const [action, setAction] = useState<ActionDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [managerResponse, setManagerResponse] = useState("");
  const [evidence, setEvidence] = useState("");
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

  function saveDraft() {
    localStorage.setItem(`toc.actionDraft.${currentAction.id}`, JSON.stringify({ managerResponse, evidence, updatedAt: new Date().toISOString() }));
    setMessage("Draft saved on this device.");
  }

  async function submitForNationalApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    setIsUpdatingLifecycle(true);
    setMessage("");
    try {
      const response = await tocFetch("/api/actions", {
        method: "POST",
        body: JSON.stringify({ action: "lifecycle", id: currentAction.id, status })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Action lifecycle could not be updated.");
      const nextAction = (payload.actions || []).find((item: ActionDetailItem) => item.id === currentAction.id) || null;
      if (nextAction) setAction(nextAction);
      window.dispatchEvent(new Event("toc.actionState.updated"));
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
              <AskOdinButton
                sourceType="action_item"
                sourceId={currentAction.id}
                title={currentAction.title}
                region={currentAction.region}
                severity={currentAction.severity}
                summary={`${currentAction.source} action item requires review: ${currentAction.detail}`}
                noticed={`${currentAction.directive} is open for ${currentAction.region} with due date ${currentAction.dueDate}.`}
                whyItMatters="Open action items affect Region Health and may require national escalation if not resolved."
                recommendedAction="Summarise the blocker, identify missing evidence, and recommend the safest close-out path for the manager."
              />
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
              <form className="action-closeout-form" onSubmit={(event) => void submitForNationalApproval(event)}>
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
                  <button type="submit" disabled={isAwaitingNational}>{isAwaitingNational ? "Awaiting National Review" : "Submit For National Approval"}</button>
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
