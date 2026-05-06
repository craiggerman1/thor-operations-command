"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { AskOdinButton } from "@/components/AskOdinButton";
import {
  getProductivityScore,
  getProductivityTagTone,
  getProductivityText,
  getProductivityTone,
  getProductivityTrend
} from "@/lib/productivity-utils";
import { tocFetch } from "@/lib/toc-client-auth";

type ProductivityResponse = {
  response: string;
  updatedAt: string;
  region: string;
  site: string;
};

type ProductivitySite = {
  id: string;
  site: string;
  slug: string;
  region: string;
  productivityScore: number;
  queue: string;
  action: string;
  units: number;
  labourHours: number;
  latestResponse: string;
  latestResponseAt: string;
};

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
  const [site, setSite] = useState<ProductivitySite | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("National");
  const [responseText, setResponseText] = useState("");
  const [savedResponse, setSavedResponse] = useState<ProductivityResponse | null>(null);
  const [message, setMessage] = useState("");

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

  useEffect(() => {
    async function loadSite() {
      try {
        const result = await tocFetch(`/api/productivity?slug=${encodeURIComponent(params.site)}&scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
        const payload = await result.json();
        const nextSite = (payload.sites || [])[0] || null;
        setSite(nextSite);
        if (nextSite?.latestResponse) {
          setResponseText(nextSite.latestResponse);
          setSavedResponse({
            response: nextSite.latestResponse,
            updatedAt: nextSite.latestResponseAt,
            region: nextSite.region,
            site: nextSite.site
          });
        }
      } catch {
        setSite(null);
      } finally {
        setLoading(false);
      }
    }

    void loadSite();
  }, [params.site, scope]);

  if (loading) {
    return (
      <TocShell>
        <PageIntro title="Productivity" detail="Loading site productivity detail." />
        <section className="command-grid route-grid">
          <Panel wide eyebrow="Productivity detail" title="Loading site">
            <div className="empty-state">Loading productivity site from the database.</div>
          </Panel>
        </section>
      </TocShell>
    );
  }

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

  const currentSite = site;
  const isVisible = scope === "National" || scope === currentSite.region;
  const score = getProductivityScore(currentSite);
  const tone = getProductivityTone(score);
  const trend = getProductivityTrend(score);
  const chartPoints = trend.map((point, index) => {
    const x = 76 + index * 118;
    const y = 350 - point.indexScore * 3;
    return { ...point, x, y };
  });
  const linePoints = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const yAxisTicks = [100, 80, 60, 40, 20, 0];

  async function saveResponse() {
    const response = responseText.trim();
    if (!response) {
      setMessage("Enter the manager response before saving.");
      return;
    }

    const result = await tocFetch("/api/productivity", {
      method: "POST",
      body: JSON.stringify({ siteId: currentSite.id, slug: currentSite.slug, scope, response })
    }, true);
    const payload = await result.json();

    if (!result.ok) {
      setMessage(payload.error || "Could not save the productivity response.");
      return;
    }

    const updatedSite = (payload.sites || [])[0] || currentSite;
    setSite(updatedSite);
    setSavedResponse({
      response,
      updatedAt: updatedSite.latestResponseAt || new Date().toISOString(),
      region: currentSite.region,
      site: currentSite.site
    });
    setMessage("Manager productivity response saved to the database.");
  }

  if (!isVisible) {
    return (
      <TocShell>
        <PageIntro title="Productivity" detail={`${currentSite.site} is outside the current signed-in scope.`} />
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
      <PageIntro title="Productivity" detail={`${currentSite.site} productivity detail.`} />
      <FlowHeading eyebrow="Productivity Detail" title="Review the site signal, productivity trend and manager action required." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow={currentSite.region} title={currentSite.site} pill={`${score}% productivity`}>
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
              <strong>{currentSite.units}</strong>
              <small>Washed units in the current reporting window.</small>
            </article>
            <article className="productivity-detail-metric">
              <span>Labour hours</span>
              <strong>{currentSite.labourHours}</strong>
              <small>Operational labour hours used for the productivity signal.</small>
            </article>
            <article className="productivity-detail-metric">
              <span>Current queue</span>
              <strong>{currentSite.queue}</strong>
              <small>{currentSite.action}</small>
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
              <svg viewBox="0 0 720 430" role="img" aria-hidden="true">
                {yAxisTicks.map((tick) => {
                  const y = 350 - tick * 3;
                  return (
                    <g key={tick}>
                      <text className="chart-axis-label" x="42" y={y + 4}>{tick}</text>
                      <path className="chart-grid-line" d={`M60 ${y}H684`} />
                    </g>
                  );
                })}
                <polyline className="productivity-trend-line" points={linePoints} />
                {chartPoints.map((point) => (
                  <circle className="productivity-trend-dot" cx={point.x} cy={point.y} r="4.2" key={point.month} />
                ))}
                {chartPoints.map((point) => (
                  <text className="chart-month-label" x={point.x} y="400" key={`${point.month}-label`}>{point.month}</text>
                ))}
              </svg>
            </div>
          </div>

          <label className="productivity-response productivity-detail-response">
            <span>Manager response on actions that will be taken to increase productivity</span>
            <textarea
              value={responseText}
              onChange={(event) => setResponseText(event.target.value)}
              placeholder="Enter the action plan for this site"
            />
            {savedResponse?.response ? <small>Response visible to admin and national review. Last updated {new Date(savedResponse.updatedAt).toLocaleString()}.</small> : null}
            <button type="button" onClick={() => void saveResponse()}>Save Productivity Response</button>
            {message ? <small className="admin-hint-message">{message}</small> : null}
          </label>

          <div className="productivity-detail-actions">
            <AskOdinButton
              sourceType="productivity_site"
              sourceId={currentSite.id}
              title={currentSite.site}
              region={currentSite.region}
              severity={score < 50 ? "red" : score < 70 ? "amber" : "blue"}
              summary={`${currentSite.site} productivity score is ${score}% with current queue: ${currentSite.queue}.`}
              noticed={`Productivity signal for ${currentSite.site} is ${score}% and current action is ${currentSite.action}.`}
              whyItMatters="Productivity issues can reduce operating efficiency and should be reviewed before they become repeated site patterns."
              recommendedAction="Review the six-month trend, manager response and current queue, then recommend the most practical improvement action."
            />
            <Link className="calendar-back-link" href="/operations">Back to productivity</Link>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
