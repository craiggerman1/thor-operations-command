"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import {
  getProductivityScore,
  getProductivitySiteBySlug,
  getProductivityTagTone,
  getProductivityText,
  getProductivityTone,
  getRedactedGrossMarginTrend
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

export default function ProductivitySitePage() {
  const params = useParams<{ site: string }>();
  const site = getProductivitySiteBySlug(params.site);
  const [scope, setScope] = useState("National");

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

  if (!site) {
    return (
      <TocShell>
        <PageIntro title="Productivity" detail="Site productivity detail not found." />
        <section className="command-grid route-grid">
          <Panel wide eyebrow="Productivity detail" title="Unavailable site">
            <Link className="calendar-back-link" href="/operations">Back to productivity</Link>
          </Panel>
        </section>
      </TocShell>
    );
  }

  const isVisible = scope === "National" || scope === site.region;
  const score = getProductivityScore(site);
  const tone = getProductivityTone(score);
  const trend = getRedactedGrossMarginTrend(score);

  if (!isVisible) {
    return (
      <TocShell>
        <PageIntro title="Productivity" detail={`${site.site} is outside the current signed-in scope.`} />
        <section className="command-grid route-grid">
          <Panel wide eyebrow="Restricted scope" title="Site not visible">
            <div className="empty-state">Change scope or return to the Productivity page to view sites available to this user.</div>
            <Link className="calendar-back-link" href="/operations">Back to productivity</Link>
          </Panel>
        </section>
      </TocShell>
    );
  }

  return (
    <TocShell>
      <PageIntro title="Productivity" detail={`${site.site} productivity detail.`} />
      <FlowHeading eyebrow="Productivity Detail" title="Review the site signal, redacted commercial productivity trend and manager action required." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow={site.region} title={site.site} pill={`${score}% productivity`}>
          <div className={`productivity-score-card ${tone}`}>
            <div>
              <span className="eyebrow">Site productivity score</span>
              <strong>{score}%</strong>
              <small>{getProductivityText(score)}. This score is calculated from the connected productivity feed once live.</small>
            </div>
            <div className={`productivity-bar ${tone}`}><span style={{ "--value": `${score}%` } as CSSProperties} /></div>
          </div>

          <div className="productivity-detail-grid">
            <article className="productivity-detail-metric">
              <span>Units</span>
              <strong>{site.units}</strong>
              <small>Washed units in the current reporting window.</small>
            </article>
            <article className="productivity-detail-metric">
              <span>Labour hours</span>
              <strong>{site.labourHours}</strong>
              <small>Operational labour hours used for the productivity signal.</small>
            </article>
            <article className="productivity-detail-metric">
              <span>Current queue</span>
              <strong>{site.queue}</strong>
              <small>{site.action}</small>
            </article>
          </div>

          <div className="productivity-chart-card">
            <div className="productivity-chart-head">
              <div>
                <span className="eyebrow">Gross margin trend</span>
                <strong>Last 6 months - redacted</strong>
              </div>
              <Tag tone={getProductivityTagTone(tone)}>Commercial values hidden</Tag>
            </div>
            <div className="productivity-chart" aria-label="Redacted six month gross margin trend">
              {trend.map((point) => (
                <div className="productivity-chart-column" key={point.month}>
                  <span style={{ "--value": `${point.indexScore}%` } as CSSProperties}><i>{point.label}</i></span>
                  <strong>{point.month}</strong>
                </div>
              ))}
            </div>
            <small className="productivity-redacted-note">Exact gross margin values are intentionally hidden on this management view.</small>
          </div>

          <div className="productivity-detail-actions">
            <Link className="calendar-back-link" href="/operations">Back to productivity</Link>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
