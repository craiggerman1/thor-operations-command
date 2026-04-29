import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { assets, washes } from "@/lib/toc-data";

export default function OperationsPage() {
  return (
    <TocShell>
      <PageIntro eyebrow="TOC workspace" title="Operations" detail="Check operations and take action." />
      <section className="command-grid route-grid">
        <FlowHeading step="3" eyebrow="Operations health" title="Check output and assets before small issues become big ones" />
        <Panel wide eyebrow="Woolworths wash data" title="Site performance" pill="Fleetio feed planned">
          <div className="wash-table">
            <div className="wash-row header"><span>Site</span><span>Target</span><span>Actual</span><span>Internal</span><span>Exceptions</span></div>
            {washes.map((wash) => (
              <div className="wash-row" key={wash.site}>
                <strong>{wash.site}</strong><span>{wash.target}</span><span>{wash.actual}</span><span>{wash.internal}</span><span className={wash.exceptions > 2 ? "tag red" : "tag green"}>{wash.exceptions}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Fleetio" title="Assets needing awareness">
          <div className="asset-list">
            {assets.map((asset) => (
              <article className="asset-card" key={asset.name}>
                <strong>{asset.name}</strong>
                <small>{asset.region} - GPS: {asset.gps} - service due in {asset.service}</small>
                <div className="meta-row"><Tag tone={asset.status}>{asset.state}</Tag><Tag>Fleetio</Tag></div>
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
