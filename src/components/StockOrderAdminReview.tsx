"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";

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

async function fetchOrders() {
  try {
    const response = await fetch("/api/stock-orders", { cache: "no-store" });
    const payload = await response.json();
    return (payload.orders || []) as StockOrderRequest[];
  } catch {
    return [];
  }
}

export function StockOrderAdminReview() {
  const router = useRouter();
  const [orders, setOrders] = useState<StockOrderRequest[]>([]);

  useEffect(() => {
    function syncOrders() {
      void fetchOrders().then(setOrders);
    }

    syncOrders();
    window.addEventListener("storage", syncOrders);
    window.addEventListener("toc.stockOrders.updated", syncOrders);
    return () => {
      window.removeEventListener("storage", syncOrders);
      window.removeEventListener("toc.stockOrders.updated", syncOrders);
    };
  }, []);

  async function updateOrder(orderId: string, updates: Partial<StockOrderRequest>) {
    const response = await fetch("/api/stock-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id: orderId, updates })
    });
    const payload = await response.json();
    if (response.ok) setOrders(payload.orders || []);
    window.dispatchEvent(new Event("toc.stockOrders.updated"));
  }

  async function deleteOrder(orderId: string) {
    if (!window.confirm("Are you sure you want to delete this order?")) return;
    const response = await fetch("/api/stock-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: orderId })
    });
    const payload = await response.json();
    if (response.ok) setOrders(payload.orders || []);
    window.dispatchEvent(new Event("toc.stockOrders.updated"));
  }

  function openOrder(orderId: string) {
    router.push(`/national-requests/${encodeURIComponent(orderId)}`);
  }

  function openOrderFromKeyboard(event: KeyboardEvent<HTMLElement>, orderId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openOrder(orderId);
  }

  return (
    <div className="admin-stock-review">
      {orders.map((order) => {
        const orderId = getOrderId(order);
        return (
          <article
            className={`admin-config-card clickable-request-card ${order.updateRequested ? "needs-update" : ""}`}
            key={orderId}
            onClick={() => openOrder(orderId)}
            onKeyDown={(event) => openOrderFromKeyboard(event, orderId)}
            role="button"
            tabIndex={0}
          >
            <div className="stock-order-head">
              <strong>{order.region}: {order.item}</strong>
              <small>{order.status} - Qty {order.quantity} - {order.urgency}</small>
            </div>
            {order.updateRequested ? <small className="stock-update-alert">Manager requested an update</small> : null}
            <label className="admin-tracking-field" onClick={(event) => event.stopPropagation()}><span>Admin / national update</span><input value={order.update} onChange={(event) => updateOrder(orderId, { update: event.target.value, status: "Updated by national" })} /></label>
            <label className="admin-tracking-field" onClick={(event) => event.stopPropagation()}><span>Tracking number</span><input value={order.trackingNumber || ""} onChange={(event) => updateOrder(orderId, { trackingNumber: event.target.value || "Pending" })} placeholder="Add tracking number" /></label>
            <div className="stock-actions">
              <button type="button" onClick={(event) => { event.stopPropagation(); openOrder(orderId); }}>Open Request</button>
              <button type="button" className="danger-button" onClick={(event) => { event.stopPropagation(); deleteOrder(orderId); }}>Delete Order</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
