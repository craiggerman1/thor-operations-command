"use client";

import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { approvedStockItems, stockOrders } from "@/lib/toc-data";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

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

function getStoredSession() {
  if (typeof window === "undefined") return { role: "manager", scope: "National" };

  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return {
      role: session?.role || "manager",
      scope: session?.scope || "National"
    };
  } catch {
    return { role: "manager", scope: "National" };
  }
}

function getOrderId(order: StockOrderRequest) {
  return order.id || `${order.region}-${order.item}`;
}

export default function StockOrdersPage() {
  const [scope, setScope] = useState("National");
  const [role, setRole] = useState("manager");
  const [orders, setOrders] = useState<StockOrderRequest[]>(stockOrders);
  const [selectedItem, setSelectedItem] = useState(approvedStockItems[0]);
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState("Normal");
  const [note, setNote] = useState("");
  const visibleOrders = useMemo(() => orders.filter((order) => scope === "National" || order.region === scope), [orders, scope]);

  useEffect(() => {
    function loadOrders() {
      try {
        const storedOrders = localStorage.getItem(stockOrderStorageKey);
        setOrders(storedOrders ? JSON.parse(storedOrders) : stockOrders);
      } catch {
        setOrders(stockOrders);
      }
    }

    function syncStockState(event?: Event) {
      const session = getStoredSession();
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : session.scope;
      setScope(nextScope);
      setRole(session.role);
      loadOrders();
    }

    syncStockState();
    window.addEventListener("storage", syncStockState);
    window.addEventListener("toc.scopechange", syncStockState);
    window.addEventListener("toc.stockOrders.updated", syncStockState);
    return () => {
      window.removeEventListener("storage", syncStockState);
      window.removeEventListener("toc.scopechange", syncStockState);
      window.removeEventListener("toc.stockOrders.updated", syncStockState);
    };
  }, []);

  function saveOrders(nextOrders: StockOrderRequest[]) {
    setOrders(nextOrders);
    localStorage.setItem(stockOrderStorageKey, JSON.stringify(nextOrders));
    window.dispatchEvent(new Event("toc.stockOrders.updated"));
  }

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextOrder: StockOrderRequest = {
      id: `SO-${Date.now()}`,
      item: selectedItem,
      region: scope,
      quantity,
      urgency,
      status: "Request submitted",
      note: note || "No additional note supplied.",
      update: "Awaiting national admin review.",
      trackingNumber: "Pending"
    };
    saveOrders([nextOrder, ...orders]);
    setQuantity(1);
    setUrgency("Normal");
    setNote("");
  }

  function cancelOrder(orderId: string) {
    const nextOrders = orders.map((order) => getOrderId(order) === orderId
      ? { ...order, status: "Cancellation requested", update: "Cancellation request sent to national/admin as an action item for review." }
      : order);
    saveOrders(nextOrders);
  }

  function requestUpdate(orderId: string) {
    const nextOrders = orders.map((order) => getOrderId(order) === orderId
      ? { ...order, updateRequested: true, update: "Manager requested an update. National admin to respond." }
      : order);
    saveOrders(nextOrders);
  }

  function markDelivered(orderId: string) {
    const nextOrders = orders.map((order) => getOrderId(order) === orderId
      ? { ...order, status: "Delivered", update: "Manager marked this stock order as delivered.", updateRequested: false }
      : order);
    saveOrders(nextOrders);
  }

  return (
    <TocShell>
      <PageIntro title="Stock Orders" detail="Order stock early and ensure up to date." />
      <FlowHeading eyebrow="Stock Orders" title="Raise stock needs early so chemicals, PPE, parts and equipment do not block the work." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Stock control" title="Request stock and consumable orders" pill={`${visibleOrders.length} open`}>
          <div className="stock-layout">
            <form className="stock-form" onSubmit={submitOrder}>
              <label><span>Signed-in region</span><input value={scope} readOnly /></label>
              <label><span>Item</span><select value={selectedItem} onChange={(event) => setSelectedItem(event.target.value)}>{approvedStockItems.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>Quantity</span><input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value) || 1)} /></label>
              <label><span>Urgency</span><select value={urgency} onChange={(event) => setUrgency(event.target.value)}><option>Normal</option><option>Urgent</option></select></label>
              <label className="stock-notes"><span>Note</span><textarea placeholder="Add extra information for national admin" value={note} onChange={(event) => setNote(event.target.value)} /></label>
              <button type="submit">Send Stock Order Request</button>
            </form>
            <div className="stock-queue-wrap">
              <div className="stock-queue-head">
                <div><span className="eyebrow">Order queue</span><strong>Open stock order requests</strong></div>
              </div>
              <div className="stock-list">
                {visibleOrders.map((order) => {
                  const orderId = getOrderId(order);
                  return (
                  <article className="stock-card" key={orderId}>
                    <div className="stock-order-head"><strong>{order.item}</strong><small>{order.region} - Qty {order.quantity}</small></div>
                    <p>{order.note}</p>
                    <div className="stock-detail"><span>{order.status}</span><span>{order.update}</span></div>
                    <div className="stock-detail"><span>Tracking</span><span>{order.trackingNumber || "Pending"}</span></div>
                    <div className="meta-row"><Tag tone={order.urgency === "Urgent" ? "red" : "green"}>{order.urgency}</Tag>{order.updateRequested ? <Tag tone="amber">Update requested</Tag> : null}</div>
                    {role === "admin" && scope === "National" ? (
                      <div className="stock-actions">
                        <Link className="node-action" href="/national-requests">Review In National Requests</Link>
                      </div>
                    ) : (
                      <div className="stock-actions">
                        <button type="button" onClick={() => requestUpdate(orderId)}>Request Update</button>
                        <button type="button" onClick={() => markDelivered(orderId)}>Mark Delivered</button>
                        <button type="button" className="danger-button" onClick={() => cancelOrder(orderId)}>Request to Cancel</button>
                      </div>
                    )}
                  </article>
                  );
                })}
              </div>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
