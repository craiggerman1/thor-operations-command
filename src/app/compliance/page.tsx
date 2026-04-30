import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { compliance } from "@/lib/toc-data";

export default function CompliancePage() {
  return (
    <TocShell>
      <PageIntro title="Compliance" detail="Ensure compliance items are completed and green." />
      <FlowHeading eyebrow="Compliance" title="Work red and amber items first so inductions, safety and site readiness stay current." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Compliance command" title="Inductions, safety and site readiness" pill="2 urgent">
          <div className="compliance-layout">
            <div className="compliance-metrics">
              <Link className="compliance-stat actionable-card" href="/actions"><span>Readiness</span><strong>62%</strong><small>Current compliance items</small></Link>
              <Link className="compliance-stat actionable-card" href="/actions"><span>Urgent</span><strong>2</strong><small>Needs manager action</small></Link>
              <Link className="compliance-stat actionable-card" href="/actions"><span>Due soon</span><strong>2</strong><small>Keep ahead this week</small></Link>
            </div>
            <div className="compliance-list">
              {compliance.map((item) => (
                <Link className="compliance-card actionable-card" href={item.href} key={item.title}>
                  <div><strong>{item.title}</strong><small>{item.region} - {item.owner} - due {item.due}</small></div>
                  <div className="meta-row"><Tag>{item.type}</Tag><Tag tone={item.severity}>{item.status}</Tag><Tag>{item.adminSet ? "Admin set" : "Local"}</Tag></div>
                  <small>Open this compliance item to take action. Open items count toward Region Health until resolved and approved.</small>
                </Link>
              ))}
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
