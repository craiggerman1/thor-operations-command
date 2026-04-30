import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { getThorOperatingWeek } from "@/lib/operating-week";
import { commandPathways, commandSignals, goLivePathway, integrationReadiness } from "@/lib/toc-data";
import { metrics } from "@/lib/toc-data";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const operatingWeek = getThorOperatingWeek();
  const commandMetrics = [
    {
      label: "Operating week",
      value: operatingWeek.name,
      detail: operatingWeek.detail,
      status: "green",
      href: "/overview"
    },
    ...metrics
  ];

  return (
    <TocShell>
      <PageIntro title="Home" detail="National command entry point. Start with the business signal, then move to the page that owns the action." />
      <FlowHeading eyebrow="Home" title="Start with the business signal, then move to the page that owns the action." />
      <section className="status-strip" aria-label="Business overview">
        {commandMetrics.map((metric) => (
          <Link className={`metric-card signal-${metric.status}`} href={metric.href} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </Link>
        ))}
      </section>
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Command signal" title="What needs attention first" pill="Action-linked">
          <div className="signal-command-grid">
            {commandSignals.map((signal) => (
              <article className={`signal-command-card ${signal.severity}`} key={signal.title}>
                <div>
                  <span className="eyebrow">{signal.source}</span>
                  <h3>{signal.title}</h3>
                  <p>{signal.detail}</p>
                </div>
                <div className="signal-command-footer">
                  <div className="meta-row"><Tag tone={signal.severity}>{signal.owner}</Tag></div>
                  <Link className="node-action" href={signal.href}>{signal.action}</Link>
                </div>
              </article>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Operating flow" title="Manager pathway">
          <div className="pathway-list">
            {commandPathways.map((item) => (
              <Link className="pathway-item" href={item.href} key={item.label}>
                <span>{item.step}</span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="System readiness" title="Integration control">
          <div className="integration-list">
            {integrationReadiness.map((item) => (
              <article className="integration-item" key={item.system}>
                <div>
                  <strong>{item.system}</strong>
                  <small>{item.purpose}</small>
                </div>
                <Tag tone={item.severity}>{item.status}</Tag>
              </article>
            ))}
          </div>
        </Panel>
        <Panel wide className="admin-only-panel" eyebrow="Admin roadmap" title="Go Live Pathway" pill="Field-use readiness">
          <div className="go-live-pathway">
            {goLivePathway.map((item) => (
              <article className={`go-live-item ${item.severity}`} key={item.step}>
                <span>{item.step}</span>
                <strong>{item.title}</strong>
                <Tag tone={item.severity}>{item.status}</Tag>
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
