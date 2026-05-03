"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { actionItems } from "@/lib/toc-data";
import { nationalActionRequestsKey, type NationalActionRequest } from "@/components/NationalActionRequests";

const sourceLinks: Record<string, string> = {
  Compliance: "/compliance",
  Roster: "/staff-availability",
  "Thor Portal": "/jobsheets",
  "Equipment Servicing": "/equipment-servicing",
  "Stock Orders": "/stock-orders",
  Workshop: "/equipment-servicing",
  "National ops": "/home"
};

export default function ActionDetailPage() {
  const params = useParams<{ id: string }>();
  const action = actionItems.find((item) => item.id === params.id);
  const [managerResponse, setManagerResponse] = useState("");
  const [evidence, setEvidence] = useState("");
  const [message, setMessage] = useState("");

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

  const sourceHref = sourceLinks[action.source] || "/actions";

  function readNationalRequests() {
    try {
      return JSON.parse(localStorage.getItem(nationalActionRequestsKey) || "[]") as NationalActionRequest[];
    } catch {
      return [];
    }
  }

  function saveDraft() {
    localStorage.setItem(`toc.actionDraft.${action.id}`, JSON.stringify({ managerResponse, evidence, updatedAt: new Date().toISOString() }));
    setMessage("Draft saved on this device.");
  }

  function submitForNationalApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRequest: NationalActionRequest = {
      id: `NAR-${Date.now()}`,
      actionId: action.id,
      title: action.title,
      region: action.region,
      source: action.source,
      directive: action.directive,
      submittedAt: new Date().toISOString(),
      managerResponse: managerResponse.trim() || "Manager submitted close-out with no additional response.",
      evidence: evidence.trim() || "No evidence or reference supplied.",
      status: "Awaiting national review"
    };

    localStorage.setItem(nationalActionRequestsKey, JSON.stringify([nextRequest, ...readNationalRequests()]));
    window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    setMessage("Submitted to National Requests for approval.");
  }

  return (
    <TocShell>
      <PageIntro title="Action Centre" detail={`${action.id} close-out workflow.`} />
      <FlowHeading eyebrow="Action Centre" title="Complete the required action, record the manager response, then submit for national approval." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow={action.directive} title={action.title} pill={`Due ${action.dueDate}`}>
          <div className={`action-detail-shell ${action.severity}`}>
            <aside className="action-detail-summary">
              <span className="eyebrow">{action.source} - {action.region}</span>
              <strong>{action.title}</strong>
              <p>{action.detail}</p>
              <div className="meta-row">
                <Tag tone={action.severity}>{action.directive}</Tag>
                <Tag>{action.status}</Tag>
                <Tag>{action.region}</Tag>
              </div>
              <div className="action-due-panel">
                <span>Due date</span>
                <strong>{action.dueDate}</strong>
                <small>{action.closeFlow}</small>
              </div>
              <Link className="node-action" href={sourceHref}>Open source page</Link>
            </aside>
            <div className="action-closeout-panel">
              <div>
                <span className="eyebrow">Manager close-out steps</span>
                <strong>Actions required to clear this item</strong>
              </div>
              <ol className="action-closeout-steps">
                {action.closeActions.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <form className="action-closeout-form" onSubmit={submitForNationalApproval}>
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
                  <button type="submit">Submit For National Approval</button>
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
