"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";

export type NationalActionRequest = {
  id: string;
  actionId: string;
  title: string;
  region: string;
  source: string;
  directive: string;
  submittedAt: string;
  managerResponse: string;
  evidence: string;
  status: "Awaiting national review" | "Approved by national" | "Returned to manager";
};

export const nationalActionRequestsKey = "toc.nationalActionRequests.databaseReady";

function readRequests() {
  return tocFetch("/api/national-requests", { cache: "no-store" })
    .then((response) => response.json())
    .then((payload) => (payload.requests || []) as NationalActionRequest[])
    .catch(() => [] as NationalActionRequest[]);
}

export function NationalActionRequests() {
  const router = useRouter();
  const [requests, setRequests] = useState<NationalActionRequest[]>([]);

  useEffect(() => {
    function syncRequests() {
      void readRequests().then(setRequests);
    }

    syncRequests();
    window.addEventListener("storage", syncRequests);
    window.addEventListener("toc.nationalActionRequests.updated", syncRequests);
    const refreshInterval = window.setInterval(syncRequests, 15000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", syncRequests);
      window.removeEventListener("toc.nationalActionRequests.updated", syncRequests);
    };
  }, []);

  async function updateRequest(requestId: string, status: NationalActionRequest["status"]) {
    const response = await tocFetch("/api/national-requests", {
      method: "POST",
      body: JSON.stringify({ action: "update", id: requestId, status })
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

  return (
    <div className="national-request-stack">
      <div className="national-request-summary">
        <article><span>Manager close-outs</span><strong>{requests.length}</strong></article>
        <article><span>Awaiting review</span><strong>{pendingRequests.length}</strong></article>
        <article><span>Queue state</span><strong>{requests.length ? "Live" : "Clear"}</strong></article>
      </div>
      <div className="request-lifecycle-strip" aria-label="National request lifecycle">
        <span>Submitted</span>
        <span>Under review</span>
        <span>Approved or returned</span>
        <span>Closed</span>
      </div>
      <div className="national-request-list">
        {requests.length ? requests.map((request) => (
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
                <span className="eyebrow">{request.source} - {request.region}</span>
                <strong>{request.title}</strong>
                <small>Submitted {new Date(request.submittedAt).toLocaleString()}</small>
              </div>
              <Tag tone={request.status === "Approved by national" ? "green" : request.status === "Returned to manager" ? "amber" : "blue"}>{request.status}</Tag>
            </div>
            <div className="national-request-body">
              <div><span>Manager response</span><p>{request.managerResponse}</p></div>
              <div><span>Evidence / reference</span><p>{request.evidence}</p></div>
            </div>
            <div className="stock-actions">
              <Link className="node-action" href={`/national-requests/${encodeURIComponent(request.id)}`} onClick={(event) => event.stopPropagation()}>Open request</Link>
              <Link className="node-action" href={`/actions/${request.actionId}`} onClick={(event) => event.stopPropagation()}>Open action</Link>
              <button className="review-decision-button approve" type="button" onClick={(event) => { event.stopPropagation(); void updateRequest(request.id, "Approved by national"); }}>Approve Close-Out</button>
              <button className="review-decision-button return" type="button" onClick={(event) => { event.stopPropagation(); void updateRequest(request.id, "Returned to manager"); }}>Return To Manager</button>
            </div>
          </article>
        )) : (
          <div className="empty-state">No manager-submitted action close-outs are awaiting national review.</div>
        )}
      </div>
    </div>
  );
}
