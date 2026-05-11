import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { OperationsSetupWizard } from "@/components/OperationsSetupWizard";

export default function StaffPage() {
  return (
    <TocShell>
      <PageIntro title="Staff" detail="Region staff source of truth for names, skills, phone numbers and Odin roster context." />
      <FlowHeading eyebrow="People register" title="Keep staff names, skills and contact details clean so schedules and Odin recommendations stay accurate." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Editable staff workbook" title="Staff setup and maintenance">
          <OperationsSetupWizard initialStep={1} />
        </Panel>
      </section>
    </TocShell>
  );
}
