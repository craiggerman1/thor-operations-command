"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { actionItems } from "@/lib/toc-data";
import { Tag } from "@/components/TocCards";

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

export const nationalActionRequestsKey = "toc.nationalActionRequests";

function readRequests() {
  if (typeof window === "undefined") return [] as NationalActionRequest[];

  try {
    return JSON.parse(localStorage.getItem(nationalActionRequestsKey) || "[]") as NationalActionRequest[];
  } catch {
    return [];
  }
}

export function NationalActionRequests() {
  const router = useRouter();
  const [requests, setRequests] = useState<NationalActionRequest[]>([]);

  useEffect(() => {
    function syncRequests() {
      setRequests(readRequests());
    }

    syncRequests();
    window.addEventListener("storage", syncRequests);
    window.addEventListener("toc.nationalActionRequests.updated", syncRequests);
    return () => {
      window.removeEventListener("storage", syncRequests);
      window.removeEventListener("toc.nationalActionRequests.updated", syncRequests);
    };
  }, []);

  function updateRequest(requestId: string, status: NationalActionRequest["status"]) {
    const nextRequests = requests.map((request) => request.id === requestId ? { ...request, status } : request);
    setRequests(nextRequests);
    localStorage.setItem(nationalActionRequestsKey, JSON.stringify(nextRequests));
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
  const openActionItems = actionItems.filter((item) => item.status !== "Closed");

  return (
    <div className="national-request-stack">
      <div className="national-request-summary">
        <article><span>Manager close-outs</span><strong>{requests.length}</strong></article>
        <article><span>Awaiting review</span><strong>{pendingRequests.length}</strong></article>
        <article><span>Open actions</span><strong>{openActionItems.length}</strong></article>
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
              <button type="button" onClick={(event) => { event.stopPropagation(); updateRequest(request.id, "Approved by national"); }}>Approve Close-Out</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); updateRequest(request.id, "Returned to manager"); }}>Return To Manager</button>
            </div>
          </article>
        )) : (
          <div className="empty-state">No manager-submitted action close-outs are awaiting national review.</div>
        )}
      </div>
    </div>
  );
}
