import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel, Tag } from "@/components/TocCards";
import { assets } from "@/lib/toc-data";

export default function FleetPage() {
  return (
    <TocShell>
      <PageIntro eyebrow="TOC workspace" title="Fleetio" detail="Wash plants, vehicles, GPS status and assets needing awareness." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Fleetio" title="Assets needing awareness" pill="API planned">
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
