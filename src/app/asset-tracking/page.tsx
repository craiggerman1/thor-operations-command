import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { unityAssets } from "@/lib/toc-data";

export default function AssetTrackingPage() {
  return (
    <TocShell>
      <PageIntro title="Asset Tracking" detail="Central hub for Unity GPS data across wash vehicles, mobile crews and GPS-equipped field assets." />
      <FlowHeading eyebrow="Asset Tracking" title="Use this page to confirm where GPS-equipped wash vehicles and mobile crews are situated." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Unity data" title="Live asset position" pill="Unity feed planned">
          <div className="tracking-map">
            {unityAssets.map((asset, index) => (
              <article className={`tracking-marker ${asset.status} marker-${index + 1}`} key={asset.asset}>
                <span />
                <div>
                  <strong>{asset.asset}</strong>
                  <small>{asset.location} - {asset.lastSeen}</small>
                </div>
              </article>
            ))}
          </div>
        </Panel>
        <Panel wide eyebrow="Mobile crews" title="Field movement and crew state">
          <div className="asset-tracking-list">
            {unityAssets.map((asset) => (
              <article className="asset-card" key={asset.asset}>
                <strong>{asset.asset}</strong>
                <small>{asset.crew} - {asset.region} - {asset.location}</small>
                <div className="meta-row"><Tag tone={asset.status}>{asset.movement}</Tag><Tag>{asset.lastSeen}</Tag></div>
              </article>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Feed status" title="Unity integration path">
          <div className="brief-stack">
            <div className="brief-item"><span className="brief-dot" /><div><strong>Unity is the GPS source.</strong><small>TOC will use Unity location data to track wash vehicles and mobile crew positioning.</small></div></div>
            <div className="brief-item"><span className="brief-dot" /><div><strong>Managers need movement confidence.</strong><small>The page should quickly show who is on site, in transit, stationary or unavailable.</small></div></div>
            <div className="brief-item"><span className="brief-dot" /><div><strong>Future alerts can flow to Action Centre.</strong><small>Late arrival, long idle time or wrong-location signals can become action items.</small></div></div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
