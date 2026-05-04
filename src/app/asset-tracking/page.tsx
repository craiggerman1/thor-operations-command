import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";

export default function AssetTrackingPage() {
  return (
    <TocShell>
      <PageIntro title="Asset Tracking" detail="Central hub for Unity GPS data across wash vehicles, mobile crews and GPS-equipped field assets." />
      <FlowHeading eyebrow="Asset Tracking" title="Track Unity GPS-equipped wash vehicles and mobile crews from one asset view." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Unity data" title="Asset tracking" pill="Connection status">
          <div className="brief-item">
            <span className="brief-dot" />
            <div>
              <strong>Unity asset source awaiting activation.</strong>
              <small>Vehicle GPS, crew location and asset status will land here once the Unity source is enabled.</small>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
