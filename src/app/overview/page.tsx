import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { regions } from "@/lib/toc-data";
import type { CSSProperties } from "react";

export default function OverviewPage() {
  return (
    <TocShell>
      <FlowHeading step="2" eyebrow="Region health" title="Ensure your region health is at 100%" />
      <PageIntro eyebrow="TOC workspace" title="Region Health" detail="Ensure your region health is at 100%." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Operating position" title="Region health map" pill="Updated now">
          <div className="ops-map">
            {regions.map((region) => (
              <article className="state-node" key={region.name}>
                <div>
                  <strong>{region.name}</strong>
                  <small>{region.note}</small>
                </div>
                <div className="node-bars">
                  <span style={{ "--value": `${region.readiness}%` } as CSSProperties} />
                  <span style={{ "--value": `${region.wash}%` } as CSSProperties} />
                  <span style={{ "--value": `${Math.max(20, 100 - region.risks * 18)}%` } as CSSProperties} />
                </div>
                <div className="meta-row">
                  <Tag tone="green">{region.readiness}% ready</Tag>
                  <Tag tone="amber">{region.portal} approvals</Tag>
                  <Tag tone="red">{region.risks} risks</Tag>
                </div>
              </article>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Manager scan" title="Today's command brief">
          <div className="brief-stack">
            <Brief text="Jobsheet approval items are open." detail="Clear Portal work first so admin and invoicing are not held up." />
            <Brief text="Manager actions need ownership." detail="These are the practical items that need a person to move them today." />
            <Brief text="Several sites are under wash target today." detail="Check output before the gap becomes a client or invoicing issue." />
            <Brief text="Assets need attention or watching." detail="Fleetio and GPS awareness keeps operations moving." />
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}

function Brief({ text, detail }: { text: string; detail: string }) {
  return (
    <div className="brief-item">
      <span className="brief-dot" />
      <div>
        <strong>{text}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}
