import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { AdminOperationsMasterData } from "@/components/AdminOperationsMasterData";

export default function RegionSetupPage() {
  return (
    <TocShell>
      <PageIntro
        title="Region Setup"
        detail="Maintain customer sites, crew requirements and recurring schedules for the selected region."
      />
      <FlowHeading eyebrow="Live Database" title="Customer, site and schedule source of truth" />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Operations master data" title="Regional customer and schedule setup">
          <AdminOperationsMasterData />
        </Panel>
      </section>
    </TocShell>
  );
}
