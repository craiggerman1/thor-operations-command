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
  getProductivityTrend
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
  const trend = getProductivityTrend(score);
  const chartPoints = trend.map((point, index) => {
    const x = 24 + index * 50.4;
    const y = 176 - point.indexScore * 1.45;
    return { ...point, x, y };
  });
  const linePoints = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");

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
      <FlowHeading eyebrow="Productivity Detail" title="Review the site signal, productivity trend and manager action required." />
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
                <span className="eyebrow">Productivity trend</span>
                <strong>Last 6 months</strong>
              </div>
              <Tag tone={getProductivityTagTone(tone)}>Trend view</Tag>
            </div>
            <div className="productivity-line-chart" aria-label="Six month productivity trend">
              <svg viewBox="0 0 300 190" role="img" aria-hidden="true">
                <path className="chart-grid-line" d="M18 35H284" />
                <path className="chart-grid-line" d="M18 82H284" />
                <path className="chart-grid-line" d="M18 129H284" />
                <polyline className="productivity-trend-fill" points={`24,176 ${linePoints} 276,176`} />
                <polyline className="productivity-trend-line" points={linePoints} />
                {chartPoints.map((point) => (
                  <circle className="productivity-trend-dot" cx={point.x} cy={point.y} r="4.2" key={point.month} />
                ))}
              </svg>
              <div className="productivity-chart-months">
                {trend.map((point) => <strong key={point.month}>{point.month}</strong>)}
              </div>
            </div>
          </div>

          <div className="productivity-detail-actions">
            <Link className="calendar-back-link" href="/operations">Back to productivity</Link>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
