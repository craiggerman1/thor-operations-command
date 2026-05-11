import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { OperationsSetupWizard } from "@/components/OperationsSetupWizard";

export default function JobsPage() {
  return (
    <TocShell>
      <PageIntro title="Jobs" detail="Customer, site and recurring job source of truth. Calendar is generated from this database." />
      <FlowHeading eyebrow="Jobs source" title="Maintain clients, sites, recurring schedules, crew requirements and calendar generation from one controlled table." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Editable jobs workbook" title="Clients, sites and recurring schedules">
          <OperationsSetupWizard initialStep={2} />
        </Panel>
      </section>
    </TocShell>
  );
}
