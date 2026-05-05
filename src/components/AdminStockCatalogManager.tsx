"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";

type StockCatalogItem = {
  id: string;
  item: string;
  status: "Active" | "Inactive";
  createdAt: string;
};

async function fetchStockCatalog() {
  const response = await fetch("/api/stock-orders?all=true", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Stock catalogue database read failed.");
  return (payload.catalog || []) as StockCatalogItem[];
}

async function mutateStockCatalog(body: Record<string, unknown>) {
  const response = await tocFetch("/api/stock-orders", {
    method: "POST",
    body: JSON.stringify(body)
  }, true);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Stock catalogue update failed.");
  return (payload.catalog || []) as StockCatalogItem[];
}

export function AdminStockCatalogManager() {
  const [catalog, setCatalog] = useState<StockCatalogItem[]>([]);
  const [itemName, setItemName] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchStockCatalog()
      .then(setCatalog)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  async function createItem() {
    if (!itemName.trim()) {
      setMessage("Add a stock item name first.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      const nextCatalog = await mutateStockCatalog({ action: "createItem", all: true, item: itemName, isActive: true });
      setCatalog(nextCatalog);
      setItemName("");
      setMessage("Stock catalogue item added.");
      window.dispatchEvent(new Event("toc.stockOrders.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add stock catalogue item.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateItem(id: string, updates: Record<string, unknown>, successMessage: string) {
    setMessage("");
    try {
      const nextCatalog = await mutateStockCatalog({ action: "updateItem", all: true, id, ...updates });
      setCatalog(nextCatalog);
      setMessage(successMessage);
      window.dispatchEvent(new Event("toc.stockOrders.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update stock catalogue item.");
    }
  }

  async function deleteItem(id: string) {
    if (!window.confirm("Are you sure you want to delete this stock catalogue item?")) return;
    setMessage("");
    try {
      const nextCatalog = await mutateStockCatalog({ action: "deleteItem", all: true, id });
      setCatalog(nextCatalog);
      setMessage("Stock catalogue item deleted.");
      window.dispatchEvent(new Event("toc.stockOrders.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete stock catalogue item. If it has order history, deactivate it instead.");
    }
  }

  return (
    <div className="admin-action-console">
      <div className="admin-action-form">
        <div>
          <strong>Add approved stock item</strong>
          <small>Only active catalogue items appear in the manager stock order dropdown.</small>
        </div>
        <label><span>Item name</span><input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Approved item name" /></label>
        <button type="button" onClick={createItem} disabled={isSaving}>{isSaving ? "Adding..." : "Add To Stock Catalogue"}</button>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
      <div className="admin-action-list">
        <div className="admin-list-head">
          <div>
            <strong>Approved stock catalogue</strong>
            <small>{catalog.filter((item) => item.status === "Active").length} active items. {catalog.length} total items.</small>
          </div>
        </div>
        {catalog.map((item) => (
          <article className="admin-action-card" key={item.id}>
            <div className="admin-action-card-head">
              <div>
                <strong>{item.item}</strong>
                <small>Manager order dropdown item</small>
              </div>
              <Tag tone={item.status === "Active" ? "green" : "amber"}>{item.status}</Tag>
            </div>
            <div className="admin-action-controls">
              <button type="button" onClick={() => void updateItem(item.id, { isActive: item.status !== "Active" }, item.status === "Active" ? "Stock item deactivated." : "Stock item activated.")}>
                {item.status === "Active" ? "Deactivate" : "Activate"}
              </button>
              <button type="button" className="danger-button" onClick={() => void deleteItem(item.id)}>Delete</button>
            </div>
          </article>
        ))}
        {catalog.length ? null : <div className="empty-state">No stock catalogue items are currently loaded from the database.</div>}
      </div>
    </div>
  );
}
