import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { compliance } from "@/lib/toc-data";

export default function CompliancePage() {
  return (
    <TocShell>
      <FlowHeading step="3" eyebrow="Compliance" title="Ensure compliance items are completed and green" />
      <PageIntro title="Compliance" detail="Ensure compliance items are completed and green." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Compliance command" title="Inductions, safety and site readiness" pill="2 urgent">
          <div className="compliance-layout">
            <div className="compliance-metrics">
              <article className="compliance-stat"><span>Readiness</span><strong>62%</strong><small>Current compliance items</small></article>
              <article className="compliance-stat"><span>Urgent</span><strong>2</strong><small>Needs manager action</small></article>
              <article className="compliance-stat"><span>Due soon</span><strong>2</strong><small>Keep ahead this week</small></article>
            </div>
            <div className="compliance-list">
              {compliance.map((item) => (
                <article className="compliance-card" key={item.title}>
                  <div><strong>{item.title}</strong><small>{item.region} - {item.owner} - due {item.due}</small></div>
                  <div className="meta-row"><Tag>{item.type}</Tag><Tag tone={item.severity}>{item.status}</Tag></div>
                </article>
              ))}
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
