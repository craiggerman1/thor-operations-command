import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { OdinConfidenceCentre } from "@/components/OdinConfidenceCentre";

export const dynamic = "force-dynamic";

export default function OdinConfidencePage() {
  return (
    <TocShell>
      <PageIntro title="Odin Confidence" detail="Data quality and routing trust before Odin drives autonomous follow-through." />
      <FlowHeading eyebrow="Odin Confidence" title="Review source gaps, weak mappings and automation trust signals before they become operational noise." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Odin Confidence" title="Data quality and trust centre">
          <OdinConfidenceCentre />
        </Panel>
      </section>
    </TocShell>
  );
}
