import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { OperationsSetupWizard } from "@/components/OperationsSetupWizard";

export default function OperationsSetupPage() {
  return (
    <TocShell>
      <PageIntro title="Operations Setup" detail="Set up staff, clients, recurring jobs, inductions and availability for a region." />
      <FlowHeading eyebrow="Guided setup" title="Build the region database in the same order a manager thinks about the operation." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Region onboarding" title="Interactive TOC setup">
          <OperationsSetupWizard adminMode />
        </Panel>
      </section>
    </TocShell>
  );
}
