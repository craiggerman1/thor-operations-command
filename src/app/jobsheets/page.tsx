import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";

export default function JobsheetsPage() {
  return (
    <TocShell>
      <PageIntro title="Jobsheets" detail="Jobsheet integration and Thor Portal approval flow." />
      <FlowHeading eyebrow="Jobsheets" title="Jobsheet integration planned." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Jobsheets" title="Jobsheet integration planned." pill="Integration planned">
          <div className="brief-item">
            <span className="brief-dot" />
            <div>
              <strong>Jobsheet integration planned.</strong>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
