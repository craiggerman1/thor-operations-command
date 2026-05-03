import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";

export default function EquipmentServicingPage() {
  return (
    <TocShell>
      <PageIntro title="Equipment Servicing" detail="Central servicing hub for asset servicing and repairs." />
      <FlowHeading eyebrow="Equipment Servicing" title="Track servicing, readings and repair action for wash assets." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Thor Portal data" title="Equipment servicing" pill="Offline">
          <div className="brief-item">
            <span className="brief-dot" />
            <div>
              <strong>Equipment servicing feed offline.</strong>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
