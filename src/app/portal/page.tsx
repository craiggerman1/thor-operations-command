import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { approvals } from "@/lib/toc-data";

export default function PortalPage() {
  return (
    <TocShell>
      <PageIntro title="Portal" detail="Jobsheets and Thor Portal approval items needing manager review." />
      <FlowHeading eyebrow="Portal" title="Clear jobsheet approval issues early so admin, invoicing and client reporting are not held up." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Thor Portal" title="Jobsheets needing review" pill="Webhook planned">
          <div className="queue-list">
            {approvals.map((item) => (
              <article className="queue-card" key={item.id}>
                <strong>{item.id} {item.site}</strong>
                <small>{item.region} - {item.count} vehicles - waiting {item.age}</small>
                <div className="meta-row"><Tag tone={item.risk === "Ready" ? "green" : "amber"}>{item.risk}</Tag><Tag>Portal</Tag></div>
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
