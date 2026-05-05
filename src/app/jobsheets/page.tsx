import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading } from "@/components/TocCards";
import { IntegrationSourcePanel } from "@/components/IntegrationSourcePanel";

export default function JobsheetsPage() {
  return (
    <TocShell>
      <PageIntro title="Jobsheets" detail="Jobsheet integration and Thor Portal approval flow." />
      <FlowHeading eyebrow="Jobsheets" title="Track jobsheet approvals and Thor Portal action flow." />
      <section className="command-grid route-grid">
        <IntegrationSourcePanel slug="jobsheets" eyebrow="Jobsheets" title="Jobsheet flow" />
      </section>
    </TocShell>
  );
}
