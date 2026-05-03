import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";

export default function AssetTrackingPage() {
  return (
    <TocShell>
      <PageIntro title="Asset Tracking" detail="Central hub for Unity GPS data across wash vehicles, mobile crews and GPS-equipped field assets." />
      <FlowHeading eyebrow="Asset Tracking" title="Asset tracking integration planned." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Unity data" title="Asset tracking integration planned." pill="Integration planned">
          <div className="brief-item">
            <span className="brief-dot" />
            <div>
              <strong>Asset tracking integration planned.</strong>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
