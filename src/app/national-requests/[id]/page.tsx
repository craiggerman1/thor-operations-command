"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { nationalActionRequestsKey, type NationalActionRequest } from "@/components/NationalActionRequests";
import { setActionOverride } from "@/lib/action-state";

type StockOrderRequest = {
  id?: string;
  item: string;
  region: string;
  quantity: number;
  urgency: string;
  status: string;
  note: string;
  update: string;
  trackingNumber?: string;
  updateRequested?: boolean;
};

function getOrderId(order: StockOrderRequest) {
  return order.id || `${order.region}-${order.item}`;
}

function readActionRequests() {
  try {
    return JSON.parse(localStorage.getItem(nationalActionRequestsKey) || "[]") as NationalActionRequest[];
  } catch {
    return [] as NationalActionRequest[];
  }
}

async function readStockOrders() {
  try {
    const response = await fetch("/api/stock-orders", { cache: "no-store" });
    const payload = await response.json();
    return (payload.orders || []) as StockOrderRequest[];
  } catch {
    return [];
  }
}

function getStoredScope() {
  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.scope || "National";
  } catch {
    return "National";
  }
}

export default function NationalRequestDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const requestId = decodeURIComponent(params.id);
  const [scope, setScope] = useState("National");
  const [actionRequests, setActionRequests] = useState<NationalActionRequest[]>([]);
  const [orders, setOrders] = useState<StockOrderRequest[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    function syncRequests() {
      setScope(getStoredScope());
      setActionRequests(readActionRequests());
      void readStockOrders().then(setOrders);
    }

    syncRequests();
    window.addEventListener("storage", syncRequests);
    window.addEventListener("toc.nationalActionRequests.updated", syncRequests);
    window.addEventListener("toc.stockOrders.updated", syncRequests);
    return () => {
      window.removeEventListener("storage", syncRequests);
      window.removeEventListener("toc.nationalActionRequests.updated", syncRequests);
      window.removeEventListener("toc.stockOrders.updated", syncRequests);
    };
  }, []);

  const actionRequest = useMemo(() => actionRequests.find((request) => request.id === requestId), [actionRequests, requestId]);
  const stockOrder = useMemo(() => orders.find((order) => getOrderId(order) === requestId), [orders, requestId]);

  function saveActionRequest(status: NationalActionRequest["status"]) {
    if (actionRequest && status === "Approved by national") setActionOverride(actionRequest.actionId, "Closed");
    if (actionRequest && status === "Returned to manager") setActionOverride(actionRequest.actionId, "Returned to manager");
    const nextRequests = status === "Approved by national"
      ? actionRequests.filter((request) => request.id !== requestId)
      : actionRequests.map((request) => request.id === requestId ? { ...request, status } : request);
    setActionRequests(nextRequests);
    localStorage.setItem(nationalActionRequestsKey, JSON.stringify(nextRequests));
    window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    setMessage(status === "Approved by national" ? "Close-out approved and removed from the pending review count." : "Returned to manager for further action.");
    if (status === "Approved by national") window.setTimeout(() => router.push("/national-requests"), 550);
  }

  async function saveStockOrder(updates: Partial<StockOrderRequest>) {
    const response = await fetch("/api/stock-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id: requestId, updates })
    });
    const payload = await response.json();
    if (response.ok) setOrders(payload.orders || []);
    window.dispatchEvent(new Event("toc.stockOrders.updated"));
    setMessage("Stock request updated for the manager.");
  }

  async function deleteStockOrder() {
    if (!window.confirm("Are you sure you want to delete this order?")) return;
    const response = await fetch("/api/stock-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: requestId })
    });
    const payload = await response.json();
    if (response.ok) setOrders(payload.orders || []);
    window.dispatchEvent(new Event("toc.stockOrders.updated"));
    setMessage("Stock order deleted.");
  }

  return (
    <TocShell>
      <PageIntro title="National Requests" detail="Review and close out the selected national request." />
      <FlowHeading eyebrow="National Requests" title="Action the selected request, then close it out or return it to the manager." />
      <section className="command-grid route-grid">
        {scope !== "National" ? (
          <Panel wide eyebrow="Restricted scope" title="National Requests is only available in National scope">
            <div className="empty-state">Switch the header region back to National to review manager close-outs and stock order requests.</div>
            <Link className="node-action" href="/home">Return Home</Link>
          </Panel>
        ) : actionRequest ? (
          <Panel wide eyebrow={`${actionRequest.source} - ${actionRequest.region}`} title={actionRequest.title} pill={actionRequest.status}>
            <div className="national-request-detail">
              <div className="national-request-body">
                <div><span>Manager response</span><p>{actionRequest.managerResponse}</p></div>
                <div><span>Evidence / reference</span><p>{actionRequest.evidence}</p></div>
              </div>
              <div className="meta-row">
                <Tag>{actionRequest.directive}</Tag>
                <Tag tone={actionRequest.status === "Approved by national" ? "green" : actionRequest.status === "Returned to manager" ? "amber" : "blue"}>{actionRequest.status}</Tag>
              </div>
              <div className="stock-actions">
                <Link className="node-action" href={`/actions/${actionRequest.actionId}`}>Open source action</Link>
                <button className="review-decision-button approve" type="button" onClick={() => saveActionRequest("Approved by national")}>Approve Close-Out</button>
                <button className="review-decision-button return" type="button" onClick={() => saveActionRequest("Returned to manager")}>Return To Manager</button>
              </div>
            </div>
          </Panel>
        ) : stockOrder ? (
          <Panel wide eyebrow={`${stockOrder.region} stock order`} title={stockOrder.item} pill={stockOrder.status}>
            <div className="national-request-detail">
              <div className="national-request-body">
                <div><span>Quantity</span><p>{stockOrder.quantity} units requested as {stockOrder.urgency.toLowerCase()} priority.</p></div>
                <div><span>Manager note</span><p>{stockOrder.note}</p></div>
              </div>
              <label className="admin-tracking-field"><span>National update</span><input value={stockOrder.update} onChange={(event) => void saveStockOrder({ update: event.target.value, status: "Approved by national" })} /></label>
              <label className="admin-tracking-field"><span>Tracking number</span><input value={stockOrder.trackingNumber || ""} onChange={(event) => void saveStockOrder({ trackingNumber: event.target.value || "Pending" })} placeholder="Add tracking number" /></label>
              <div className="stock-actions">
                <button className="review-decision-button approve" type="button" onClick={() => void saveStockOrder({ status: "Approved by national", update: stockOrder.update || "Approved by national." })}>Approve Request</button>
                <button className="review-decision-button return" type="button" onClick={() => void saveStockOrder({ status: "Returned to manager", update: "Returned to manager for clarification." })}>Return To Manager</button>
                <button type="button" className="danger-button" onClick={() => void deleteStockOrder()}>Delete Order</button>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel wide eyebrow="Request unavailable" title="National request not found">
            <div className="empty-state">This request may have been cleared or removed.</div>
          </Panel>
        )}
        {message ? <div className="calendar-save-message">{message}</div> : null}
        <Link className="calendar-back-link" href="/national-requests">Back to National Requests</Link>
      </section>
    </TocShell>
  );
}
