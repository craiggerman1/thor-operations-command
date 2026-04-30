"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { productivitySites } from "@/lib/toc-data";

type ProductivityTone = "red" | "amber" | "yellow" | "light-green" | "green";

function getStoredScope() {
  if (typeof window === "undefined") return "National";

  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.scope || "National";
  } catch {
    return "National";
  }
}

function getProductivityTone(score: number): ProductivityTone {
  if (score < 40) return "red";
  if (score < 50) return "amber";
  if (score < 70) return "yellow";
  if (score < 80) return "light-green";
  return "green";
}

function getProductivityText(score: number) {
  if (score < 40) return "Critical productivity issue";
  if (score < 50) return "Productivity action required";
  if (score < 70) return "Efficiency needs refinement";
  if (score < 80) return "Near healthy productivity";
  return "Healthy productivity";
}

function getProductivityTagTone(tone: ProductivityTone) {
  if (tone === "red") return "red";
  if (tone === "green") return "green";
  return "amber";
}

export default function OperationsPage() {
  const [scope, setScope] = useState("National");
  const visibleSites = useMemo(() => productivitySites.filter((site) => scope === "National" || site.region === scope), [scope]);
  const regionScore = visibleSites.length ? Math.round(visibleSites.reduce((total, site) => total + site.efficiency, 0) / visibleSites.length) : 0;
  const regionTone = getProductivityTone(regionScore);

  useEffect(() => {
    function syncScope(event?: Event) {
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : getStoredScope();
      setScope(nextScope);
    }

    syncScope();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    return () => {
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
    };
  }, []);

  return (
    <TocShell>
      <PageIntro title="Productivity" detail="Productivity tracking and action hub." />
      <FlowHeading eyebrow="Productivity" title="Take productivity queues, refine the operation, and keep each site moving efficiently." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Productivity command" title={`${scope} productivity score`} pill={`${regionScore}% efficiency`}>
          <div className={`productivity-score-card ${regionTone}`}>
            <div>
              <span className="eyebrow">Cumulative site score</span>
              <strong>{regionScore}%</strong>
              <small>{getProductivityText(regionScore)}. 80% is treated as perfect productivity for this TOC score.</small>
            </div>
            <div className={`productivity-bar ${regionTone}`}><span style={{ "--value": `${regionScore}%` } as CSSProperties} /></div>
          </div>
          <div className="productivity-site-list">
            {visibleSites.map((site) => {
              const tone = getProductivityTone(site.efficiency);
              return (
                <article className={`productivity-site-card ${tone}`} key={`${site.region}-${site.site}`}>
                  <div>
                    <span className="eyebrow">{site.region}</span>
                    <strong>{site.site}</strong>
                    <small>{getProductivityText(site.efficiency)} - {site.queue}</small>
                  </div>
                  <div className={`productivity-bar ${tone}`}><span style={{ "--value": `${site.efficiency}%` } as CSSProperties} /></div>
                  <div className="productivity-site-footer">
                    <div className="meta-row"><Tag tone={getProductivityTagTone(tone)}>{site.efficiency}% efficiency</Tag><Tag>{site.units} units</Tag><Tag>{site.labourHours} labour hrs</Tag></div>
                    <p>{site.action}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
