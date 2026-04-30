"use client";

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

function getStoredScope() {
  if (typeof window === "undefined") return "National";

  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.scope || "National";
  } catch {
    return "National";
  }
}

export default function StockOrdersPage() {
  const [scope, setScope] = useState("National");
  const [orders, setOrders] = useState<StockOrderRequest[]>(stockOrders);
  const [selectedItem, setSelectedItem] = useState(approvedStockItems[0]);
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState("Normal");
  const [note, setNote] = useState("");
  const visibleOrders = useMemo(() => orders.filter((order) => scope === "National" || order.region === scope), [orders, scope]);

  useEffect(() => {
    function syncScope(event?: Event) {
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : getStoredScope();
      setScope(nextScope);
    }

    try {
      const storedOrders = localStorage.getItem(stockOrderStorageKey);
      if (storedOrders) setOrders(JSON.parse(storedOrders));
    } catch {
      setOrders(stockOrders);
    }

    syncScope();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    return () => {
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
    };
  }, []);

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
    const nextOrders = [nextOrder, ...orders];
    setOrders(nextOrders);
    localStorage.setItem(stockOrderStorageKey, JSON.stringify(nextOrders));
    setQuantity(1);
    setUrgency("Normal");
    setNote("");
  }

  function cancelOrder(orderId: string) {
    const nextOrders = orders.map((order) => (order.id || `${order.region}-${order.item}`) === orderId
      ? { ...order, status: "Cancellation requested", update: "Cancellation sent to national admin for review." }
      : order);
    setOrders(nextOrders);
    localStorage.setItem(stockOrderStorageKey, JSON.stringify(nextOrders));
  }

  function requestUpdate(orderId: string) {
    const nextOrders = orders.map((order) => (order.id || `${order.region}-${order.item}`) === orderId
      ? { ...order, updateRequested: true, update: "Manager requested an update. National admin to respond." }
      : order);
    setOrders(nextOrders);
    localStorage.setItem(stockOrderStorageKey, JSON.stringify(nextOrders));
  }

  return (
    <TocShell>
      <PageIntro title="Stock Orders" detail="Order stock early and ensure up to date." />
      <FlowHeading eyebrow="Stock Orders" title="Raise stock needs early so chemicals, PPE, parts and equipment do not block the work." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Stock control" title="Request stock and consumable orders" pill={`${visibleOrders.length} pending`}>
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
                <div><span className="eyebrow">Order queue</span><strong>Pending stock order requests</strong></div>
                <Tag>{visibleOrders.length} pending</Tag>
              </div>
              <div className="stock-list">
                {visibleOrders.map((order) => {
                  const orderId = order.id || `${order.region}-${order.item}`;
                  return (
                  <article className="stock-card" key={orderId}>
                    <div><strong>{order.item}</strong><small>{order.region} - Qty {order.quantity}</small></div>
                    <p>{order.note}</p>
                    <div className="stock-detail"><span>{order.status}</span><span>{order.update}</span></div>
                    <div className="stock-detail"><span>Tracking</span><span>{order.trackingNumber || "Pending"}</span></div>
                    <div className="meta-row"><Tag tone={order.urgency === "Urgent" ? "red" : "green"}>{order.urgency}</Tag><Tag tone="amber">{order.updateRequested ? "Update requested" : "Pending"}</Tag><Tag>National update visible</Tag></div>
                    <div className="stock-actions">
                      <button type="button" onClick={() => requestUpdate(orderId)}>Request Update</button>
                      <button type="button" className="danger-button" onClick={() => cancelOrder(orderId)}>Cancel Order</button>
                    </div>
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
