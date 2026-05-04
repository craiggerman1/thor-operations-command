import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";

export default function JobsheetsPage() {
  return (
    <TocShell>
      <PageIntro title="Jobsheets" detail="Jobsheet integration and Thor Portal approval flow." />
      <FlowHeading eyebrow="Jobsheets" title="Track jobsheet approvals and Thor Portal action flow." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Jobsheets" title="Jobsheet flow" pill="Connection status">
          <div className="brief-item">
            <span className="brief-dot" />
            <div>
              <strong>Thor Portal jobsheet source awaiting activation.</strong>
              <small>Approval flow, manager review items and admin blockers will land here once the source is enabled.</small>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
