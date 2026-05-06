import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { OdinCommandClient } from "@/components/OdinCommandClient";

export const dynamic = "force-dynamic";

export default function OdinPage() {
  return (
    <TocShell>
      <PageIntro title="Odin Command" detail="AI operations watch tower, alerts, recommendations, briefs and approval workflow." />
      <FlowHeading eyebrow="Odin Command" title="Use Odin as the TOC operator: review what he noticed, why it matters and what should happen next." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Odin Command" title="AI operations layer" pill="Watch tower">
          <OdinCommandClient />
        </Panel>
      </section>
    </TocShell>
  );
}

