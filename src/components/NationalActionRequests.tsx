"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";

export type NationalActionRequest = {
  id: string;
  requestType: string;
  actionId: string;
  title: string;
  region: string;
  source: string;
  directive: string;
  submittedAt: string;
  ageHours?: number;
  ageLabel?: string;
  stale?: boolean;
  managerResponse: string;
  evidence: string;
  attachments?: {
    id: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    url: string;
    purpose: string;
  }[];
  status: "Awaiting national review" | "Approved by national" | "Returned to manager";
};

export const nationalActionRequestsKey = "toc.nationalActionRequests.databaseReady";

type RequestFilter = "all" | "closeout" | "updates" | "urgent" | "stale";

function readRequests() {
  return tocFetch("/api/national-requests", { cache: "no-store" })
    .then((response) => response.json())
    .then((payload) => (payload.requests || []) as NationalActionRequest[])
    .catch(() => [] as NationalActionRequest[]);
}

export function NationalActionRequests() {
  const router = useRouter();
  const [requests, setRequests] = useState<NationalActionRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("all");

  useEffect(() => {
    function syncRequests() {
      void readRequests().then(setRequests);
    }

    syncRequests();
    window.addEventListener("storage", syncRequests);
    window.addEventListener("toc.nationalActionRequests.updated", syncRequests);
    const refreshInterval = window.setInterval(syncRequests, 30000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", syncRequests);
      window.removeEventListener("toc.nationalActionRequests.updated", syncRequests);
    };
  }, []);

  async function updateRequest(requestId: string, status: NationalActionRequest["status"]) {
    const nationalResponse = status === "Returned to manager"
      ? window.prompt("Why is this being returned to the manager?")?.trim() || ""
      : "";
    if (status === "Returned to manager" && nationalResponse.length < 5) return;

    const response = await tocFetch("/api/national-requests", {
      method: "POST",
      body: JSON.stringify({ action: "update", id: requestId, status, nationalResponse })
    }, true);
    const payload = await response.json();
    if (response.ok) setRequests(payload.requests || []);
    window.dispatchEvent(new Event("toc.actionState.updated"));
    window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
  }

  function openRequest(requestId: string) {
    router.push(`/national-requests/${encodeURIComponent(requestId)}`);
  }

  function openRequestFromKeyboard(event: KeyboardEvent<HTMLElement>, requestId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openRequest(requestId);
  }

  const pendingRequests = requests.filter((request) => request.status === "Awaiting national review");
  const managerUpdates = requests.filter((request) => request.requestType === "manager_update");
  const closeOuts = requests.filter((request) => request.requestType !== "manager_update");
  const staleRequests = requests.filter((request) => request.stale);
  const urgentRequests = requests.filter((request) => request.directive === "National Ops Directive" || /urgent|critical|red|blocked|safety|compliance/i.test(`${request.title} ${request.managerResponse}`));
  const filteredRequests = requests.filter((request) => {
    if (requestFilter === "closeout") return request.requestType !== "manager_update";
    if (requestFilter === "updates") return request.requestType === "manager_update";
    if (requestFilter === "urgent") return urgentRequests.some((urgent) => urgent.id === request.id);
    if (requestFilter === "stale") return request.stale;
    return true;
  });
  const filters: { value: RequestFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: requests.length },
    { value: "closeout", label: "Close-Outs", count: closeOuts.length },
    { value: "updates", label: "Manager Updates", count: managerUpdates.length },
    { value: "urgent", label: "Urgent", count: urgentRequests.length },
    { value: "stale", label: "Stale", count: staleRequests.length }
  ];

  return (
    <div className="national-request-stack">
      <div className="national-request-summary">
        <article><span>Manager close-outs</span><strong>{requests.length}</strong></article>
        <article><span>Awaiting review</span><strong>{pendingRequests.length}</strong></article>
        <article><span>Manager updates</span><strong>{managerUpdates.length}</strong></article>
      </div>
      <div className="request-lifecycle-strip" aria-label="National request lifecycle">
        <span>Submitted</span>
        <span>Under review</span>
        <span>Approved or returned</span>
        <span>Closed</span>
      </div>
      <div className="action-filter-strip" aria-label="National request filters">
        {filters.map((filter) => (
          <button
            type="button"
            key={filter.value}
            className={requestFilter === filter.value ? "active" : ""}
            onClick={() => setRequestFilter(filter.value)}
          >
            <span>{filter.label}</span>
            <strong>{filter.count}</strong>
          </button>
        ))}
      </div>
      <div className="national-request-list">
        {filteredRequests.length ? filteredRequests.map((request) => (
          <article
            className="national-request-card clickable-request-card"
            key={request.id}
            onClick={() => openRequest(request.id)}
            onKeyDown={(event) => openRequestFromKeyboard(event, request.id)}
            role="button"
            tabIndex={0}
          >
            <div className="national-request-head">
              <div>
                <span className="eyebrow">{request.requestType === "manager_update" ? "Manager update" : request.source} - {request.region}</span>
                <strong>{request.title}</strong>
                <small>Submitted {new Date(request.submittedAt).toLocaleString()} - {request.ageLabel || "Review waiting"}</small>
              </div>
              <div className="meta-row">
                {request.stale ? <Tag tone="amber">Stale review</Tag> : null}
                <Tag tone={request.status === "Approved by national" ? "green" : request.status === "Returned to manager" ? "amber" : "blue"}>{request.status}</Tag>
              </div>
            </div>
            <div className="national-request-body">
              <div><span>Manager response</span><p>{request.managerResponse}</p></div>
              <div>
                <span>Evidence / reference</span>
                <p>{request.evidence}</p>
                {request.attachments?.length ? (
                  <div className="manager-evidence-list">
                    {request.attachments.map((attachment) => (
                      <a href={attachment.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} key={attachment.id}>{attachment.fileName}</a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="stock-actions">
              <Link className="node-action" href={`/national-requests/${encodeURIComponent(request.id)}`} onClick={(event) => event.stopPropagation()}>Open request</Link>
              <Link className="node-action" href={`/actions/${request.actionId}`} onClick={(event) => event.stopPropagation()}>Open action</Link>
              <button className="review-decision-button approve" type="button" onClick={(event) => { event.stopPropagation(); void updateRequest(request.id, "Approved by national"); }}>{request.requestType === "manager_update" ? "Acknowledge Update" : "Approve Close-Out"}</button>
              <button className="review-decision-button return" type="button" onClick={(event) => { event.stopPropagation(); void updateRequest(request.id, "Returned to manager"); }}>Return To Manager</button>
            </div>
          </article>
        )) : (
          <div className="empty-state">No national request items match this filter.</div>
        )}
      </div>
    </div>
  );
}
