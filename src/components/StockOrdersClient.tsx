"use client";

import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { tocFetch } from "@/lib/toc-client-auth";

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

export function StockOrdersClient({ stockItems }: { stockItems: string[] }) {
  const approvedStockItems = useMemo(() => stockItems.length ? stockItems : ["Stock catalogue unavailable"], [stockItems]);
  const [scope, setScope] = useState("National");
  const [role, setRole] = useState("manager");
  const [orders, setOrders] = useState<StockOrderRequest[]>([]);
  const [message, setMessage] = useState("");
  const [selectedItem, setSelectedItem] = useState(approvedStockItems[0]);
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState("Normal");
  const [note, setNote] = useState("");
  const visibleOrders = orders;

  useEffect(() => {
    setSelectedItem((currentItem) => approvedStockItems.includes(currentItem) ? currentItem : approvedStockItems[0]);
  }, [approvedStockItems]);

  useEffect(() => {
    function syncStockState(event?: Event) {
      const session = getStoredSession();
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : session.scope;
      setScope(nextScope);
      setRole(session.role);
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

  useEffect(() => {
    async function loadOrders() {
      try {
        const response = await tocFetch(`/api/stock-orders?scope=${encodeURIComponent(scope)}&active=true`, { cache: "no-store" });
        const payload = await response.json();
        setOrders(payload.orders || []);
      } catch {
        setOrders([]);
      }
    }

    void loadOrders();
    window.addEventListener("toc.stockOrders.updated", loadOrders);
    return () => window.removeEventListener("toc.stockOrders.updated", loadOrders);
  }, [scope]);

  async function mutateStockOrder(payload: Record<string, unknown>) {
    const response = await tocFetch("/api/stock-orders", {
      method: "POST",
      body: JSON.stringify(payload)
    }, true);
    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Stock order update failed.");
      return;
    }

    setOrders(result.orders || []);
    window.dispatchEvent(new Event("toc.stockOrders.updated"));
  }

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem || selectedItem === "Stock catalogue unavailable") return;

    void mutateStockOrder({
      action: "create",
      scope,
      active: true,
      item: selectedItem,
      region: scope,
      quantity,
      urgency,
      note: note || "No additional note supplied."
    });
    setQuantity(1);
    setUrgency("Normal");
    setNote("");
    setMessage("Stock order request sent to the database.");
  }

  function cancelOrder(orderId: string) {
    void mutateStockOrder({ action: "update", scope, active: true, id: orderId, updates: { status: "Cancellation requested", update: "Cancellation request sent to national/admin for review." } });
  }

  function requestUpdate(orderId: string) {
    void mutateStockOrder({ action: "update", scope, active: true, id: orderId, updates: { status: "Awaiting national approval", update: "Manager requested an update. National admin to respond." } });
  }

  function markDelivered(orderId: string) {
    void mutateStockOrder({ action: "update", scope, active: true, id: orderId, updates: { status: "Delivered", update: "Manager marked this stock order as delivered." } });
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
              <button type="submit" disabled={!selectedItem || selectedItem === "Stock catalogue unavailable"}>Send Stock Order Request</button>
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
                {visibleOrders.length ? null : <div className="empty-state">No stock order requests are currently loaded.</div>}
              </div>
              {message ? <small className="admin-hint-message">{message}</small> : null}
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
