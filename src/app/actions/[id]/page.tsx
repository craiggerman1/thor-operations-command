"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { AskOdinButton } from "@/components/AskOdinButton";
import type { ActionItem } from "@/lib/action-state";
import { tocFetch } from "@/lib/toc-client-auth";

export default function ActionDetailPage() {
  const params = useParams<{ id: string }>();
  const [action, setAction] = useState<(ActionItem & { sourceHref?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [managerResponse, setManagerResponse] = useState("");
  const [evidence, setEvidence] = useState("");
  const [message, setMessage] = useState("");

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
  const isAwaitingNational = currentAction.status === "Awaiting national review";

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
                <Tag>{currentAction.status}</Tag>
                <Tag>{currentAction.region}</Tag>
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
