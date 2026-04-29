import { TocShell, PageIntro } from "@/components/TocShell";
import { metrics } from "@/lib/toc-data";

export default function HomePage() {
  return (
    <TocShell>
      <PageIntro eyebrow="TOC workspace" title="Home" />
      <section className="status-strip" aria-label="Business overview">
        {metrics.map((metric) => (
          <div className={`metric-card signal-${metric.status}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </div>
        ))}
      </section>
    </TocShell>
  );
}
