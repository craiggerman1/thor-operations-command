"use client";

import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { actionItems, productivitySites, regions } from "@/lib/toc-data";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { getOpenActionItems, type ActionItem } from "@/lib/action-state";

type HealthTone = "red" | "amber" | "yellow" | "green";

function getStoredScope() {
  if (typeof window === "undefined") return "National";

  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.scope || "National";
  } catch {
    return "National";
  }
}

function getHealthTone(readiness: number): HealthTone {
  if (readiness < 25) return "red";
  if (readiness < 50) return "amber";
  if (readiness < 95) return "yellow";
  return "green";
}

function getHealthText(readiness: number) {
  if (readiness < 25) return "Critical action load";
  if (readiness < 50) return "Action load hurting region health";
  if (readiness < 95) return "Watch open actions";
  return "Healthy and competitive";
}

function getActionHealthScore(openActionCount: number) {
  if (openActionCount <= 0) return 100;
  return Math.max(10, 100 - openActionCount * 16);
}

function getProductivityScore(regionName: string) {
  const sites = productivitySites.filter((site) => site.region === regionName);
  if (!sites.length) return 100;
  return Math.round(sites.reduce((total, site) => total + site.productivityScore, 0) / sites.length);
}

function getRegionHealthScore(openActionCount: number, productivityScore: number) {
  const actionHealthScore = getActionHealthScore(openActionCount);
  return Math.round(actionHealthScore * 0.58 + productivityScore * 0.42);
}

export default function OverviewPage() {
  const [scope, setScope] = useState("National");
  const [openActionItems, setOpenActionItems] = useState<ActionItem[]>(() => getOpenActionItems(actionItems));

  useEffect(() => {
    function syncScope(event?: Event) {
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : getStoredScope();
      setScope(nextScope);
    }

    function syncActions() {
      setOpenActionItems(getOpenActionItems(actionItems));
    }

    syncScope();
    syncActions();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    window.addEventListener("toc.actionState.updated", syncActions);
    return () => {
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
      window.removeEventListener("toc.actionState.updated", syncActions);
    };
  }, []);

  return (
    <TocShell>
      <PageIntro title="Region Health" detail="Ensure your region health is at 100%." />
      <FlowHeading eyebrow="Region Health" title="Scan your region first, then open the items pulling readiness below target." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Operating position" title="Region health map" pill="Updated now">
          <div className="region-health-notice">
            <strong>All region health is visible to all managers.</strong>
            <small>Health is calculated from open Action Centre items and the region productivity score.</small>
          </div>
          <div className="ops-map">
            {regions.map((region) => {
              const openActions = openActionItems.filter((item) => item.region === region.name || item.region === "National");
              const productivityScore = getProductivityScore(region.name);
              const healthScore = getRegionHealthScore(openActions.length, productivityScore);
              const tone = getHealthTone(healthScore);
              const healthText = getHealthText(healthScore);
              const canOpen = scope === region.name;
              const content = (
                <>
                <div>
                  <strong>{region.name}</strong>
                  <small>{healthText}. {region.note}</small>
                </div>
                <div className={`node-health-bar ${tone}`}>
                  <span style={{ "--value": `${healthScore}%` } as CSSProperties} />
                </div>
                <div className="meta-row">
                  <Tag tone={tone === "yellow" ? "amber" : tone}>{healthScore}% health</Tag>
                  <Tag tone={openActions.length ? "red" : "green"}>{openActions.length} open actions</Tag>
                  <Tag tone={productivityScore >= 80 ? "green" : productivityScore >= 70 ? "amber" : "red"}>{productivityScore}% productivity</Tag>
                  <Tag>{canOpen ? "Open your action centre" : "Visible only"}</Tag>
                </div>
                </>
              );

              return canOpen ? (
                <Link className={`state-node ${tone} is-clickable`} href="/actions" key={region.name}>
                  {content}
                </Link>
              ) : (
                <article className={`state-node ${tone}`} key={region.name}>
                  {content}
                </article>
              );
            })}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
