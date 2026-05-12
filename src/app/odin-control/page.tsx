import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { OdinCommandClient } from "@/components/OdinCommandClient";
import { OdinConfidenceCentre } from "@/components/OdinConfidenceCentre";
import { OdinDailyRhythmPanel } from "@/components/OdinDailyRhythmPanel";
import { OdinOperationsControlPanel } from "@/components/OdinOperationsControlPanel";
import { RosterGapReview } from "@/components/RosterGapReview";

export const dynamic = "force-dynamic";

export default function OdinControlPage() {
  return (
    <TocShell>
      <PageIntro title="ODIN Control" detail="Odin command, rhythm, confidence and autonomous operating controls." />
      <FlowHeading eyebrow="ODIN Control" title="Review Odin's control surfaces from one dedicated command page without scattering AI controls across normal manager workflows." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Odin command" title="Direct Odin controls and item queue" pill="Admin / National">
          <OdinCommandClient />
        </Panel>
        <Panel wide eyebrow="Odin operating rhythm" title="Morning brief, midday check and end-of-day closeout" pill="National">
          <OdinDailyRhythmPanel />
        </Panel>
        <Panel wide eyebrow="Odin closure control" title="Closure, escalation and manager follow-through" pill="Live snapshot">
          <OdinOperationsControlPanel />
        </Panel>
        <Panel wide eyebrow="Odin roster scan" title="Detected roster gaps and staffing risks">
          <RosterGapReview />
        </Panel>
        <Panel wide eyebrow="Odin Confidence" title="Data quality and routing trust">
          <OdinConfidenceCentre />
        </Panel>
      </section>
    </TocShell>
  );
}
