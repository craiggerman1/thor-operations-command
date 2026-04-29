import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { stockOrders } from "@/lib/toc-data";

export default function StockOrdersPage() {
  return (
    <TocShell>
      <PageIntro eyebrow="TOC workspace" title="Stock Orders" detail="Order stock early and ensure up to date." />
      <section className="command-grid route-grid">
        <FlowHeading step="4" eyebrow="Stock orders" title="Order stock early and ensure up to date" />
        <Panel wide eyebrow="Stock control" title="Request stock from national" pill={`${stockOrders.length} open`}>
          <div className="stock-layout">
            <form className="stock-form">
              <label><span>Region</span><select><option>Brisbane</option><option>Sydney</option><option>Melbourne</option><option>Workshop</option></select></label>
              <label><span>Site / area</span><input placeholder="Depot, wash bay, client site" /></label>
              <label><span>Category</span><select><option>Chemicals</option><option>PPE</option><option>Equipment</option><option>Parts</option></select></label>
              <label><span>Item</span><input placeholder="What is needed" /></label>
              <label><span>Quantity</span><input type="number" min="1" defaultValue="1" /></label>
              <label><span>Urgency</span><select><option>Normal</option><option>Soon</option><option>Urgent</option></select></label>
              <button type="button">Send to national</button>
            </form>
            <div className="stock-list">
              {stockOrders.map((order) => (
                <article className="stock-card" key={order.item}>
                  <div><strong>{order.item}</strong><small>{order.region} - {order.site}</small></div>
                  <div className="stock-detail"><span>{order.category}</span><span>Qty {order.quantity}</span><span>{order.status}</span></div>
                  <div className="meta-row"><Tag tone={order.urgency === "Urgent" ? "red" : order.urgency === "Soon" ? "amber" : "green"}>{order.urgency}</Tag><Tag>Open</Tag></div>
                </article>
              ))}
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
