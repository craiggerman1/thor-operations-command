import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading } from "@/components/TocCards";
import { AssetTrackingClient } from "@/components/AssetTrackingClient";

export default function AssetTrackingPage() {
  return (
    <TocShell>
      <PageIntro title="Asset Tracking" detail="Live Fleet Complete GPS visibility for wash vehicles and field units." />
      <FlowHeading eyebrow="Asset Tracking" title="Track wash units by region, GPS freshness, ignition state and current position." />
      <section className="command-grid route-grid">
        <AssetTrackingClient />
      </section>
    </TocShell>
  );
}
