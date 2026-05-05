"use client";

import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

type HealthTone = "red" | "amber" | "yellow" | "green";

type RegionHealth = {
  id: string;
  name: string;
  healthScore: number;
  tone: HealthTone;
  healthText: string;
  openActions: number;
  urgentActions: number;
  productivityScore: number;
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

export default function OverviewPage() {
  const [scope, setScope] = useState("National");
  const [regionHealth, setRegionHealth] = useState<RegionHealth[]>([]);

  useEffect(() => {
    function syncScope(event?: Event) {
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : getStoredScope();
      setScope(nextScope);
    }

    async function syncRegionHealth() {
      try {
        const response = await fetch("/api/region-health", { cache: "no-store" });
        const payload = await response.json();
        setRegionHealth(payload.regions || []);
      } catch {
        setRegionHealth([]);
      }
    }

    syncScope();
    void syncRegionHealth();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    window.addEventListener("toc.actionState.updated", syncRegionHealth);
    return () => {
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
      window.removeEventListener("toc.actionState.updated", syncRegionHealth);
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
            {regionHealth.map((region) => {
              const healthScore = region.healthScore;
              const tone = region.tone;
              const healthText = region.healthText;
              const canOpen = scope === region.name;
              const content = (
                <>
                <div>
                  <strong>{region.name}</strong>
                  <small>{healthText}. Calculated from open actions and productivity.</small>
                </div>
                <div className={`node-health-bar ${tone}`}>
                  <span style={{ "--value": `${healthScore}%` } as CSSProperties} />
                </div>
                <div className="meta-row">
                  <Tag tone={tone === "yellow" ? "amber" : tone}>{healthScore}% health</Tag>
                  <Tag tone={region.openActions ? "red" : "green"}>{region.openActions} open actions</Tag>
                  <Tag tone={region.productivityScore >= 80 ? "green" : region.productivityScore >= 70 ? "amber" : "red"}>{region.productivityScore}% productivity</Tag>
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
            {regionHealth.length ? null : <div className="empty-state">No region health records are currently loaded.</div>}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
