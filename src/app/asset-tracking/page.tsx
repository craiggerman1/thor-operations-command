import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading } from "@/components/TocCards";
import { IntegrationSourcePanel } from "@/components/IntegrationSourcePanel";

export default function AssetTrackingPage() {
  return (
    <TocShell>
      <PageIntro title="Asset Tracking" detail="Central hub for Unity GPS data across wash vehicles, mobile crews and GPS-equipped field assets." />
      <FlowHeading eyebrow="Asset Tracking" title="Track Unity GPS-equipped wash vehicles and mobile crews from one asset view." />
      <section className="command-grid route-grid">
        <IntegrationSourcePanel slug="asset-tracking" eyebrow="Unity data" title="Asset tracking" />
      </section>
    </TocShell>
  );
}
