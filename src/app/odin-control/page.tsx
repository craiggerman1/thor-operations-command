import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { OdinConfidenceCentre } from "@/components/OdinConfidenceCentre";
import { OdinDailyRhythmPanel } from "@/components/OdinDailyRhythmPanel";
import { OdinOperationsControlPanel } from "@/components/OdinOperationsControlPanel";
import { RosterGapReview } from "@/components/RosterGapReview";

export const dynamic = "force-dynamic";

export default function OdinControlPage() {
  return (
    <TocShell>
      <PageIntro title="Odin Control" detail="Odin status, operating rhythm and automation health." />
      <FlowHeading eyebrow="Odin Control" title="Use this page to confirm Odin is watching TOC correctly, driving the daily rhythm, and only escalating what matters." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Odin status" title="Watcher status, closure pressure and escalation control" pill="Live snapshot">
          <OdinOperationsControlPanel />
        </Panel>
        <Panel wide eyebrow="Operating rhythm" title="Morning brief, midday check and end-of-day closeout" pill="National">
          <OdinDailyRhythmPanel />
        </Panel>
        <Panel wide eyebrow="Odin roster scan" title="Detected roster gaps and staffing risks">
          <RosterGapReview />
        </Panel>
        <Panel wide eyebrow="Automation confidence" title="Data quality and routing trust">
          <OdinConfidenceCentre />
        </Panel>
      </section>
    </TocShell>
  );
}
