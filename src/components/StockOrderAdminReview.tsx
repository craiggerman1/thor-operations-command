"use client";

import { useEffect, useState } from "react";
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

function readOrders() {
  try {
    const storedOrders = localStorage.getItem(stockOrderStorageKey);
    return storedOrders ? JSON.parse(storedOrders) as StockOrderRequest[] : stockOrders;
  } catch {
    return stockOrders;
  }
}

export function StockOrderAdminReview() {
  const [orders, setOrders] = useState<StockOrderRequest[]>([]);

  useEffect(() => {
    function syncOrders() {
      setOrders(readOrders());
    }

    syncOrders();
    window.addEventListener("storage", syncOrders);
    window.addEventListener("toc.stockOrders.updated", syncOrders);
    return () => {
      window.removeEventListener("storage", syncOrders);
      window.removeEventListener("toc.stockOrders.updated", syncOrders);
    };
  }, []);

  function updateOrder(orderId: string, updates: Partial<StockOrderRequest>) {
    const nextOrders = orders.map((order) => getOrderId(order) === orderId ? { ...order, ...updates, updateRequested: updates.update ? false : order.updateRequested } : order);
    setOrders(nextOrders);
    localStorage.setItem(stockOrderStorageKey, JSON.stringify(nextOrders));
    window.dispatchEvent(new Event("toc.stockOrders.updated"));
  }

  return (
    <div className="admin-stock-review">
      {orders.map((order) => {
        const orderId = getOrderId(order);
        return (
          <article className={`admin-config-card ${order.updateRequested ? "needs-update" : ""}`} key={orderId}>
            <div>
              <strong>{order.region}: {order.item}</strong>
              <small>{order.status} - Qty {order.quantity} - {order.urgency}</small>
            </div>
            {order.updateRequested ? <small className="stock-update-alert">Manager requested an update</small> : null}
            <label className="admin-tracking-field"><span>Admin / national update</span><input value={order.update} onChange={(event) => updateOrder(orderId, { update: event.target.value, status: "Updated by national" })} /></label>
            <label className="admin-tracking-field"><span>Tracking number</span><input value={order.trackingNumber || ""} onChange={(event) => updateOrder(orderId, { trackingNumber: event.target.value || "Pending" })} placeholder="Add tracking number" /></label>
          </article>
        );
      })}
    </div>
  );
}
