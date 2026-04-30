"use client";

import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { approvedStockItems, stockOrders } from "@/lib/toc-data";
import { useEffect, useState } from "react";

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
  const visibleOrders = stockOrders.filter((order) => scope === "National" || order.region === scope);

  useEffect(() => {
    function syncScope(event?: Event) {
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : getStoredScope();
      setScope(nextScope);
    }

    syncScope();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    return () => {
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
    };
  }, []);

  return (
    <TocShell>
      <PageIntro title="Stock Orders" detail="Order stock early and ensure up to date." />
      <FlowHeading eyebrow="Stock Orders" title="Raise stock needs early so chemicals, PPE, parts and equipment do not block the work." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Stock control" title="Request stock and consumable orders" pill={`${visibleOrders.length} pending`}>
          <div className="stock-layout">
            <form className="stock-form">
              <label><span>Signed-in region</span><input value={scope} readOnly /></label>
              <label><span>Item</span><select>{approvedStockItems.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>Quantity</span><input type="number" min="1" defaultValue="1" /></label>
              <label><span>Urgency</span><select><option>Normal</option><option>Urgent</option></select></label>
              <label className="stock-notes"><span>Note</span><textarea placeholder="Add extra information for national admin" /></label>
              <button type="button">Send Stock Order Request</button>
            </form>
            <div className="stock-list">
              {visibleOrders.map((order) => (
                <article className="stock-card" key={order.item}>
                  <div><strong>{order.item}</strong><small>{order.region} - Qty {order.quantity}</small></div>
                  <p>{order.note}</p>
                  <div className="stock-detail"><span>{order.status}</span><span>{order.update}</span></div>
                  <div className="meta-row"><Tag tone={order.urgency === "Urgent" ? "red" : "green"}>{order.urgency}</Tag><Tag>Pending manager view</Tag></div>
                </article>
              ))}
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
