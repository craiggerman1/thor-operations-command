"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel } from "@/components/TocCards";
import type { EnhancedActionItem } from "@/lib/action-state";
import { tocFetch } from "@/lib/toc-client-auth";

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
    attachments?: EvidenceAttachment[];
  }[];
};

type EvidenceAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  url: string;
  purpose: string;
};

export default function ActionDetailPage() {
  const params = useParams<{ id: string }>();
  const [action, setAction] = useState<ActionDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [managerResponse, setManagerResponse] = useState("");
  const [evidence, setEvidence] = useState("");
  const [attachments, setAttachments] = useState<EvidenceAttachment[]>([]);
  const [lifecycleNote, setLifecycleNote] = useState("");
  const [lifecycleEvidence, setLifecycleEvidence] = useState("");
  const [blockedAttachments, setBlockedAttachments] = useState<EvidenceAttachment[]>([]);
  const [message, setMessage] = useState("");
  const [isUpdatingLifecycle, setIsUpdatingLifecycle] = useState(false);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [isUploadingBlockedEvidence, setIsUploadingBlockedEvidence] = useState(false);

  useEffect(() => {
    async function loadAction() {
      try {
        const session = JSON.parse(localStorage.getItem("toc.session") || "null");
        const scope = session?.scope || "National";
        const response = await tocFetch(`/api/actions?id=${encodeURIComponent(params.id)}&scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
        const payload = await response.json();
        const loadedAction = (payload.actions || [])[0] || null;
        setAction(loadedAction);
        if (loadedAction?.id) {
          const draft = JSON.parse(localStorage.getItem(`toc.actionDraft.${loadedAction.id}`) || "null");
          if (draft?.managerResponse) setManagerResponse(draft.managerResponse);
          if (draft?.evidence) setEvidence(draft.evidence);
        }
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
  const isClosed = currentAction.status === "Closed" || lifecycleStatus === "closed";
  const needsEvidence = currentAction.directive === "National Ops Directive" ||
    currentAction.severity === "red" ||
    /compliance|equipment|stock|jobsheet|safety/i.test(`${currentAction.source} ${currentAction.title} ${currentAction.detail}`);
  const responseReady = managerResponse.trim().length >= 5;
  const evidenceReady = !needsEvidence || evidence.trim().length >= 8 || attachments.length > 0;
  const closeoutReady = responseReady && evidenceReady && !isAwaitingNational && !isClosed && !isUploadingEvidence;
  const reviewHistory = currentAction.reviewHistory || [];

  function saveDraft() {
    localStorage.setItem(`toc.actionDraft.${currentAction.id}`, JSON.stringify({ managerResponse, evidence, updatedAt: new Date().toISOString() }));
    setMessage("Draft saved on this device.");
  }

  async function submitForNationalApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (managerResponse.trim().length < 5) {
      setMessage("Add a short clear manager response before submitting for National approval.");
      return;
    }
    if (needsEvidence && evidence.trim().length < 8 && !attachments.length) {
      setMessage("Add evidence or a reference before submitting this material action for National review.");
      return;
    }
    const response = await tocFetch("/api/national-requests", {
      method: "POST",
      body: JSON.stringify({
        action: "create",
        actionId: currentAction.id,
        managerResponse: managerResponse.trim() || "Manager submitted close-out with no additional response.",
        evidence: evidence.trim() || (attachments.length ? "Photo evidence uploaded." : "No evidence or reference supplied."),
        attachmentIds: attachments.map((item) => item.id)
      })
    }, true);
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "Could not submit this action for national approval.");
      return;
    }
    localStorage.removeItem(`toc.actionDraft.${currentAction.id}`);
    setAction({ ...currentAction, status: "Awaiting national review" });
    window.dispatchEvent(new Event("toc.actionState.updated"));
    window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    setMessage("Submitted to National Requests for approval.");
  }

  async function uploadEvidenceFile(file: File, purpose: "closeout" | "blocked") {
    const setter = purpose === "blocked" ? setIsUploadingBlockedEvidence : setIsUploadingEvidence;
    setter(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.set("actionId", currentAction.id);
      formData.set("purpose", purpose);
      formData.set("file", file);
      const response = await tocFetch("/api/action-evidence", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Evidence file could not be uploaded.");
      const attachment = payload.attachment as EvidenceAttachment | null;
      if (attachment) {
        if (purpose === "blocked") {
          setBlockedAttachments((current) => [...current.filter((item) => item.id !== attachment.id), attachment]);
        } else {
          setAttachments((current) => [...current.filter((item) => item.id !== attachment.id), attachment]);
        }
      }
      setMessage("Evidence uploaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Evidence file could not be uploaded.");
    } finally {
      setter(false);
    }
  }

  async function updateLifecycle(status: "in_progress" | "blocked") {
    if (status === "blocked" && lifecycleNote.trim().length < 5) {
      setMessage("Add a short reason before marking this action blocked.");
      return;
    }
    setIsUpdatingLifecycle(true);
    setMessage("");
    try {
      const response = await tocFetch("/api/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "lifecycle",
          id: currentAction.id,
          status,
          note: lifecycleNote.trim(),
          evidence: lifecycleEvidence.trim() || (blockedAttachments.length ? "Photo evidence uploaded." : ""),
          attachmentIds: blockedAttachments.map((item) => item.id)
        })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Action lifecycle could not be updated.");
      const nextAction = (payload.actions || []).find((item: ActionDetailItem) => item.id === currentAction.id) || null;
      if (nextAction) setAction(nextAction);
      setLifecycleNote("");
      setLifecycleEvidence("");
      setBlockedAttachments([]);
      window.dispatchEvent(new Event("toc.actionState.updated"));
      window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
      setMessage(status === "blocked" ? "Blocked item submitted to National for review." : "Progress update saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action lifecycle could not be updated.");
    } finally {
      setIsUpdatingLifecycle(false);
    }
  }

  return (
    <TocShell>
      <PageIntro title="Action Centre" detail={`${currentAction.region} - ${currentAction.source}`} />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Manager close-out" title={currentAction.title}>
          <div className={`manager-action-detail ${currentAction.severity}`}>
            <div className="manager-action-hero">
              <div>
                <span className="manager-action-label">Next step for {currentAction.region}</span>
                <h2>{isAwaitingNational ? "Waiting for National review" : isClosed ? "This action is closed" : "Close this action out"}</h2>
                <p>{isAwaitingNational ? "Your close-out has been submitted. National will approve it or return it if more detail is needed." : "Read the action, complete the work, then record what was done below."}</p>
              </div>
              <div className="manager-action-status">
                <span>{currentAction.lifecycleLabel || currentAction.status}</span>
                <strong>Due {currentAction.dueDate}</strong>
              </div>
            </div>

            <div className="manager-action-layout">
              <aside className="manager-action-context" aria-label="Action context">
                <section>
                  <span className="manager-action-label">What needs doing</span>
                  <p>{currentAction.detail}</p>
                </section>
                <dl className="manager-action-facts">
                  <div>
                    <dt>Owner</dt>
                    <dd>{currentAction.region}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{currentAction.source}</dd>
                  </div>
                  <div>
                    <dt>Priority</dt>
                    <dd>{currentAction.directive}</dd>
                  </div>
                  <div>
                    <dt>Risk</dt>
                    <dd>{currentAction.severity}</dd>
                  </div>
                </dl>
                <Link className="manager-source-link" href={sourceHref}>Open related page</Link>
              </aside>

              <div className="manager-action-workflow">
                <form className="manager-closeout-form" onSubmit={(event) => void submitForNationalApproval(event)}>
                  <div>
                    <span className="manager-action-label">Close-out response</span>
                    <h3>Tell National what was done</h3>
                    <p>{needsEvidence ? "This is a material action, so add a clear result and evidence or a reference." : "A short clear close-out is enough for routine actions."}</p>
                  </div>

                  <label>
                    <span>What did you do?</span>
                    <textarea value={managerResponse} placeholder="Example: Checked the site, fixed the issue, spoke with the team, and confirmed no remaining risk." onChange={(event) => setManagerResponse(event.target.value)} />
                  </label>

                  <label>
                    <span>{needsEvidence ? "Evidence or reference required" : "Evidence or reference optional"}</span>
                    <input value={evidence} placeholder="Example: photo uploaded, stock order raised, checklist checked, manager confirmed" onChange={(event) => setEvidence(event.target.value)} />
                  </label>
                  <label>
                    <span>Upload photo or evidence</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      disabled={isUploadingEvidence || isAwaitingNational || isClosed}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadEvidenceFile(file, "closeout");
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {attachments.length ? (
                    <div className="manager-evidence-list">
                      {attachments.map((attachment) => (
                        <a href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}>{attachment.fileName}</a>
                      ))}
                    </div>
                  ) : null}

                  <div className="manager-action-buttons">
                    <button type="submit" disabled={!closeoutReady}>{isUploadingEvidence ? "Uploading..." : isAwaitingNational ? "Already Submitted" : isClosed ? "Closed" : "Submit to National review"}</button>
                    <button type="button" onClick={saveDraft}>Save draft</button>
                  </div>
                  {message ? <small className="manager-action-message">{message}</small> : null}
                </form>

                <details className="manager-blocked-panel">
                  <summary>I cannot complete this yet</summary>
                  <div>
                    <label>
                      <span>Why is it blocked?</span>
                      <textarea value={lifecycleNote} placeholder="Example: waiting on stock, client access, equipment repair, staff confirmation." onChange={(event) => setLifecycleNote(event.target.value)} />
                    </label>
                    <label>
                      <span>Reference if useful</span>
                      <input value={lifecycleEvidence} placeholder="Optional reference, photo note or order number" onChange={(event) => setLifecycleEvidence(event.target.value)} />
                    </label>
                    <label>
                      <span>Upload blocked evidence</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        disabled={isUploadingBlockedEvidence || isAwaitingNational || isClosed}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadEvidenceFile(file, "blocked");
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {blockedAttachments.length ? (
                      <div className="manager-evidence-list">
                        {blockedAttachments.map((attachment) => (
                          <a href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}>{attachment.fileName}</a>
                        ))}
                      </div>
                    ) : null}
                    <button type="button" disabled={isUpdatingLifecycle || isUploadingBlockedEvidence || isAwaitingNational || isClosed} onClick={() => void updateLifecycle("blocked")}>
                      {isUploadingBlockedEvidence ? "Uploading..." : "Submit blocked item to National"}
                    </button>
                  </div>
                </details>

                <details className="manager-history-panel">
                  <summary>National review history</summary>
                  {reviewHistory.length ? reviewHistory.map((event) => (
                    <article key={event.id}>
                      <strong>{event.status}</strong>
                      <small>{new Date(event.submittedAt).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
                      <p>{event.managerResponse}</p>
                      {event.evidence ? <small>Evidence: {event.evidence}</small> : null}
                      {event.attachments?.length ? (
                        <div className="manager-evidence-list">
                          {event.attachments.map((attachment) => (
                            <a href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}>{attachment.fileName}</a>
                          ))}
                        </div>
                      ) : null}
                      {event.nationalResponse ? <small>National: {event.nationalResponse}</small> : null}
                    </article>
                  )) : <small>No National review has been submitted yet.</small>}
                </details>
              </div>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
