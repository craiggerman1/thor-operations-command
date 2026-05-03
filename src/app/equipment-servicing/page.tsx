import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";

export default function EquipmentServicingPage() {
  return (
    <TocShell>
      <PageIntro title="Equipment Servicing" detail="Central servicing hub for asset servicing and repairs." />
      <FlowHeading eyebrow="Equipment Servicing" title="Equipment servicing integration planned." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Thor Portal data feed" title="Equipment servicing integration planned." pill="Integration planned">
          <div className="brief-item">
            <span className="brief-dot" />
            <div>
              <strong>Equipment servicing integration planned.</strong>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
