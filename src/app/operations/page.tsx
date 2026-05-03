"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { productivitySites } from "@/lib/toc-data";
import {
  getProductivityScore,
  getProductivitySiteSlug,
  getProductivityText,
  getProductivityTone
} from "@/lib/productivity-utils";

function getStoredScope() {
  if (typeof window === "undefined") return "National";

  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.scope || "National";
  } catch {
    return "National";
  }
}

export default function OperationsPage() {
  const [scope, setScope] = useState("National");
  const visibleSites = useMemo(() => productivitySites.filter((site) => scope === "National" || site.region === scope), [scope]);
  const regionScore = visibleSites.length ? Math.round(visibleSites.reduce((total, site) => total + getProductivityScore(site), 0) / visibleSites.length) : 0;
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
        <Panel wide eyebrow="Productivity command" title={`${scope} productivity score`} pill={`${regionScore}% productivity`}>
          <div className={`productivity-score-card ${regionTone}`}>
            <div>
              <span className="eyebrow">Cumulative productivity score</span>
              <strong>{regionScore}%</strong>
              <small>{getProductivityText(regionScore)}. Take action on sites below target and record the manager response.</small>
            </div>
            <div className={`productivity-bar ${regionTone}`}><span style={{ "--value": `${regionScore}%` } as CSSProperties} /></div>
          </div>
          <div className="productivity-site-list">
            {visibleSites.map((site) => {
              const score = getProductivityScore(site);
              const tone = getProductivityTone(score);
              return (
                <Link className={`productivity-site-card ${tone}`} href={`/operations/${getProductivitySiteSlug(site.site)}`} key={`${site.region}-${site.site}`}>
                  <div>
                    <span className="eyebrow">{site.region}</span>
                    <strong>{site.site}</strong>
                    <small>{getProductivityText(score)}</small>
                    <p>{site.queue}</p>
                  </div>
                  <div className={`productivity-bar ${tone}`}><span style={{ "--value": `${score}%` } as CSSProperties} /></div>
                  <div className="productivity-site-footer">
                    <strong>{score}% productivity</strong>
                  </div>
                </Link>
              );
            })}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
