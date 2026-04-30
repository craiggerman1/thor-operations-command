import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { assets, serviceSchedule, washes, washRolloverCounters } from "@/lib/toc-data";

export default function OperationsPage() {
  return (
    <TocShell>
      <FlowHeading step="5" eyebrow="Operations" title="Check operations and take action" />
      <PageIntro title="Operations" detail="Check operations and take action." />
      <section className="command-grid route-grid">
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
        <Panel wide eyebrow="Washed unit tracking" title="Rollover counter" pill="Live counter planned">
          <div className="rollover-grid">
            {washRolloverCounters.map((item) => (
              <article className={`rollover-card ${item.severity}`} key={item.site}>
                <div>
                  <strong>{item.site}</strong>
                  <small>{item.region} - yesterday {item.yesterday}, today {item.today}</small>
                </div>
                <div><span>{item.rollover}</span><em>{item.trend}</em></div>
              </article>
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
        <Panel eyebrow="Fleetio service schedule" title="Service items" pill="API planned">
          <div className="ops-list">
            {serviceSchedule.map((item) => (
              <article className="ops-card" key={item.asset}>
                <strong>{item.asset}</strong>
                <small>{item.region} - {item.item}</small>
                <div className="meta-row"><Tag tone={item.severity}>{item.status}</Tag><Tag>Due {item.due}</Tag></div>
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
