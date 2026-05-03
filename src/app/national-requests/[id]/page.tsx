"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { nationalActionRequestsKey, type NationalActionRequest } from "@/components/NationalActionRequests";
import { stockOrders } from "@/lib/toc-data";

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

const stockOrderStorageKey = "toc.stockOrders";

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

function readStockOrders() {
  try {
    const storedOrders = localStorage.getItem(stockOrderStorageKey);
    return storedOrders ? JSON.parse(storedOrders) as StockOrderRequest[] : stockOrders;
  } catch {
    return stockOrders;
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
      setOrders(readStockOrders());
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
    const nextRequests = actionRequests.map((request) => request.id === requestId ? { ...request, status } : request);
    setActionRequests(nextRequests);
    localStorage.setItem(nationalActionRequestsKey, JSON.stringify(nextRequests));
    window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    setMessage(status === "Approved by national" ? "Close-out approved and removed from the pending review count." : "Returned to manager for further action.");
  }

  function saveStockOrder(updates: Partial<StockOrderRequest>) {
    const nextOrders = orders.map((order) => getOrderId(order) === requestId ? { ...order, ...updates, updateRequested: updates.update ? false : order.updateRequested } : order);
    setOrders(nextOrders);
    localStorage.setItem(stockOrderStorageKey, JSON.stringify(nextOrders));
    window.dispatchEvent(new Event("toc.stockOrders.updated"));
    setMessage("Stock request updated for the manager.");
  }

  function deleteStockOrder() {
    if (!window.confirm("Are you sure you want to delete this order?")) return;
    const nextOrders = orders.filter((order) => getOrderId(order) !== requestId);
    setOrders(nextOrders);
    localStorage.setItem(stockOrderStorageKey, JSON.stringify(nextOrders));
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
                <button type="button" onClick={() => saveActionRequest("Approved by national")}>Approve Close-Out</button>
                <button type="button" onClick={() => saveActionRequest("Returned to manager")}>Return To Manager</button>
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
              <label className="admin-tracking-field"><span>National update</span><input value={stockOrder.update} onChange={(event) => saveStockOrder({ update: event.target.value, status: "Updated by national" })} /></label>
              <label className="admin-tracking-field"><span>Tracking number</span><input value={stockOrder.trackingNumber || ""} onChange={(event) => saveStockOrder({ trackingNumber: event.target.value || "Pending" })} placeholder="Add tracking number" /></label>
              <div className="stock-actions">
                <button type="button" onClick={() => saveStockOrder({ status: "Approved by national", update: stockOrder.update || "Approved by national." })}>Approve Request</button>
                <button type="button" onClick={() => saveStockOrder({ status: "Returned to manager", update: "Returned to manager for clarification." })}>Return To Manager</button>
                <button type="button" className="danger-button" onClick={deleteStockOrder}>Delete Order</button>
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
