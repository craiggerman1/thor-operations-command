import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel, Tag } from "@/components/TocCards";
import { equipmentAssets, equipmentServiceSummary, servicingDataFlow } from "@/lib/toc-data";

export default function EquipmentServicingPage() {
  return (
    <TocShell>
      <PageIntro
        eyebrow="TOC workspace"
        title="Equipment Servicing"
        detail="Central servicing hub for wash vehicles, utes, wash plants, Hondas, generators and Pony fleet wash machines."
      />
      <section className="status-strip equipment-summary" aria-label="Equipment servicing overview">
        {equipmentServiceSummary.map((item) => (
          <article className={`metric-card signal-${item.severity}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </article>
        ))}
      </section>
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Thor Portal data feed" title="Odometer and hour tracking" pill="Feed planned">
          <div className="equipment-table">
            <div className="equipment-row header">
              <span>Asset</span>
              <span>Type</span>
              <span>Region</span>
              <span>Reading</span>
              <span>Next service</span>
              <span>Status</span>
            </div>
            {equipmentAssets.map((asset) => (
              <article className="equipment-row" key={asset.asset}>
                <strong>{asset.asset}</strong>
                <span>{asset.category}</span>
                <span>{asset.region}</span>
                <span>{asset.currentReading}</span>
                <span>{asset.nextService}</span>
                <div className="meta-row"><Tag tone={asset.severity}>{asset.status}</Tag></div>
                <small>
                  {asset.readingType}: {asset.currentReading}. Remaining: {asset.remaining}. Latest source: {asset.lastSubmitted}.
                </small>
              </article>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Servicing logic" title="How readings become action">
          <div className="pathway-list">
            {servicingDataFlow.map((item) => (
              <article className="pathway-item equipment-flow-item" key={item.step}>
                <span>{item.step}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Workshop control" title="Service ownership">
          <div className="brief-stack">
            <div className="brief-item"><span className="brief-dot" /><div><strong>Workshop view will own service actions.</strong><small>Jason and workshop access should see assets needing booking, parts, repairs or return-to-service follow-up.</small></div></div>
            <div className="brief-item"><span className="brief-dot" /><div><strong>Managers submit readings through Thor Portal.</strong><small>TOC should not rely on manual duplicate entry once the Portal feed is connected.</small></div></div>
            <div className="brief-item"><span className="brief-dot" /><div><strong>Fleetio can remain the asset reference.</strong><small>TOC can use Fleetio for asset identity and GPS, while Thor Portal supplies operational readings.</small></div></div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
