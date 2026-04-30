"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { productivitySites } from "@/lib/toc-data";

type ProductivityTone = "red" | "amber" | "yellow" | "light-green" | "green";
type ProductivityResponse = {
  response: string;
  updatedAt: string;
  region: string;
  site: string;
};

const productivityResponseStorageKey = "toc.productivityResponses";

function getStoredScope() {
  if (typeof window === "undefined") return "National";

  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.scope || "National";
  } catch {
    return "National";
  }
}

function getStoredRole() {
  if (typeof window === "undefined") return "admin";

  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.role || "admin";
  } catch {
    return "admin";
  }
}

function getProductivityResponses() {
  if (typeof window === "undefined") return {} as Record<string, ProductivityResponse>;

  try {
    return JSON.parse(localStorage.getItem(productivityResponseStorageKey) || "{}") as Record<string, ProductivityResponse>;
  } catch {
    return {};
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

function getProductivityScore(site: { grossMargin?: number; wageCost?: number }) {
  if (typeof site.grossMargin === "number") return site.grossMargin;
  if (typeof site.wageCost === "number") return Math.max(0, 100 - site.wageCost);
  return 0;
}

function getProductivityTagTone(tone: ProductivityTone) {
  if (tone === "red") return "red";
  if (tone === "green") return "green";
  return "amber";
}

export default function OperationsPage() {
  const [scope, setScope] = useState("National");
  const [role, setRole] = useState("manager");
  const [responses, setResponses] = useState<Record<string, ProductivityResponse>>({});
  const visibleSites = useMemo(() => productivitySites.filter((site) => scope === "National" || site.region === scope), [scope]);
  const regionScore = visibleSites.length ? Math.round(visibleSites.reduce((total, site) => total + getProductivityScore(site), 0) / visibleSites.length) : 0;
  const regionTone = getProductivityTone(regionScore);
  const canReviewResponses = role === "admin";

  useEffect(() => {
    function syncScope(event?: Event) {
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : getStoredScope();
      setScope(nextScope);
      setRole(getStoredRole());
      setResponses(getProductivityResponses());
    }

    syncScope();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    return () => {
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
    };
  }, []);

  function getSiteKey(region: string, site: string) {
    return `${region}:${site}`;
  }

  function updateResponse(region: string, site: string, response: string) {
    const nextResponses = {
      ...responses,
      [getSiteKey(region, site)]: {
        response,
        updatedAt: new Date().toISOString(),
        region,
        site
      }
    };
    setResponses(nextResponses);
    localStorage.setItem(productivityResponseStorageKey, JSON.stringify(nextResponses));
  }

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
              const siteKey = getSiteKey(site.region, site.site);
              const savedResponse = responses[siteKey];
              return (
                <article className={`productivity-site-card ${tone}`} key={`${site.region}-${site.site}`}>
                  <div>
                    <span className="eyebrow">{site.region}</span>
                    <strong>{site.site}</strong>
                    <small>{getProductivityText(score)} - {site.queue}</small>
                  </div>
                  <div className={`productivity-bar ${tone}`}><span style={{ "--value": `${score}%` } as CSSProperties} /></div>
                  <div className="productivity-site-footer">
                    <div className="meta-row"><Tag tone={getProductivityTagTone(tone)}>{score}% productivity</Tag><Tag>{site.units} units</Tag><Tag>{site.labourHours} labour hrs</Tag></div>
                  </div>
                  {score < 80 ? (
                    <label className="productivity-response">
                      <span>Manager response on actions that will be taken to increase productivity</span>
                      <textarea
                        rows={1}
                        value={savedResponse?.response || ""}
                        onChange={(event) => updateResponse(site.region, site.site, event.target.value)}
                        placeholder="Enter the action plan for this site"
                      />
                      {savedResponse?.response ? <small>Response visible to admin and national review.</small> : null}
                    </label>
                  ) : null}
                </article>
              );
            })}
          </div>
        </Panel>
        {canReviewResponses ? (
          <Panel wide eyebrow="National review" title="Manager productivity responses" pill={`${Object.keys(responses).length} submitted`}>
            <div className="productivity-response-review">
              {Object.values(responses).length ? Object.values(responses).map((item) => (
                <article className="admin-config-card" key={`${item.region}-${item.site}`}>
                  <div><strong>{item.region}: {item.site}</strong><small>{new Date(item.updatedAt).toLocaleString()}</small></div>
                  <p>{item.response || "No response supplied."}</p>
                </article>
              )) : (
                <div className="brief-item">
                  <span className="brief-dot" />
                  <div><strong>No manager responses yet.</strong><small>Sites below 80% will collect responses here for admin and national review.</small></div>
                </div>
              )}
            </div>
          </Panel>
        ) : null}
      </section>
    </TocShell>
  );
}
