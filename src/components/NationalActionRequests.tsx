"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  const [requests, setRequests] = useState<NationalActionRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("all");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

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

    const previousRequests = requests;
    setBusyId(requestId);
    setMessage("");
    setRequests((current) => current.filter((request) => request.id !== requestId));
    const response = await tocFetch("/api/national-requests", {
      method: "POST",
      body: JSON.stringify({ action: "update", id: requestId, status, nationalResponse })
    }, true);
    const payload = await response.json();
    if (response.ok) {
      setRequests(payload.requests || []);
      setMessage(status === "Approved by national" ? "Approved." : "Returned to manager.");
    } else {
      setRequests(previousRequests);
      setMessage(payload.error || "National request could not be updated.");
    }
    setBusyId("");
    window.dispatchEvent(new Event("toc.actionState.updated"));
    window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
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
    <div className="national-request-stack lean-action-flow">
      <div className="lean-flow-head">
        <strong>{pendingRequests.length} waiting for National</strong>
        <small>{managerUpdates.length} manager update{managerUpdates.length === 1 ? "" : "s"} / {closeOuts.length} close-out{closeOuts.length === 1 ? "" : "s"}</small>
      </div>
      {message ? <small className="admin-hint-message">{message}</small> : null}
      {requests.length > 5 ? <div className="action-filter-strip" aria-label="National request filters">
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
      </div> : null}
      <div className="national-request-list lean-review-list">
        {filteredRequests.length ? filteredRequests.map((request) => (
          <article className="national-request-card lean-review-card" key={request.id}>
            <div className="national-request-head lean-review-head">
              <div>
                <span className="eyebrow">{request.region} / {request.requestType === "manager_update" ? "Manager update" : request.source}</span>
                <strong>{request.title}</strong>
                <small>{request.ageLabel || "Review waiting"}</small>
              </div>
            </div>
            <div className="national-request-body">
              <div><span>Response</span><p>{request.managerResponse}</p></div>
              <div>
                <span>Evidence</span>
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
            <div className="stock-actions lean-review-actions">
              <button className="review-decision-button approve" type="button" disabled={busyId === request.id} onClick={() => void updateRequest(request.id, "Approved by national")}>{request.requestType === "manager_update" ? "Acknowledge" : "Approve"}</button>
              <button className="review-decision-button return" type="button" disabled={busyId === request.id} onClick={() => void updateRequest(request.id, "Returned to manager")}>Return</button>
              <Link className="node-action" href={`/actions/${request.actionId}`}>Source</Link>
              <Link className="node-action" href={`/national-requests/${encodeURIComponent(request.id)}`}>Detail</Link>
            </div>
          </article>
        )) : (
          <div className="empty-state">No national request items match this filter.</div>
        )}
      </div>
    </div>
  );
}
