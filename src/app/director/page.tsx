import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";

export default function DirectorPage() {
  return (
    <TocShell>
      <PageIntro title="Director" detail="High-level owner view of business health, efficiency, compliance and productivity." />
      <FlowHeading eyebrow="Director" title="Use this view for the overall health of the business without operational noise." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Director access" title="Owner health view" pill="Green 84%">
          <div className="director-layout">
            <article className="director-scorecard"><span>Overall position</span><strong>Green 84%</strong><small>Business is broadly healthy. Keep watching isolated exceptions.</small></article>
            <div className="director-signals">
              <Signal label="Productivity" value="84%" />
              <Signal label="Efficiency" value="91%" />
              <Signal label="Compliance" value="76%" tone="amber" />
              <Signal label="Asset availability" value="83%" />
            </div>
            <div className="director-brief">
              <div className="director-brief-item"><span className="brief-dot" /><strong>No major red executive signals in this view.</strong></div>
              <div className="director-brief-item"><span className="brief-dot" /><strong><Tag tone="amber">Watch</Tag> Compliance needs attention this week.</strong></div>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}

function Signal({ label, value, tone = "green" }: { label: string; value: string; tone?: "green" | "amber" }) {
  return <article className={`director-signal ${tone}`}><span>{label}</span><strong>{value}</strong><small>Executive signal</small></article>;
}
