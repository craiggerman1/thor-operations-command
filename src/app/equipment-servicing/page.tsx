"use client";

import { useEffect, useMemo, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { equipmentAssets, servicingDataFlow } from "@/lib/toc-data";

function getStoredScope() {
  if (typeof window === "undefined") return "National";

  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.scope || "National";
  } catch {
    return "National";
  }
}

function getSeverityCount(assets: typeof equipmentAssets, severity: "red" | "amber" | "blue") {
  return assets.filter((asset) => asset.severity === severity).length;
}

export default function EquipmentServicingPage() {
  const [scope, setScope] = useState("National");
  const visibleAssets = useMemo(() => equipmentAssets.filter((asset) => scope === "National" || asset.region === scope), [scope]);
  const equipmentServiceSummary = [
    { label: "Assets in scope", value: visibleAssets.length.toString(), detail: scope === "National" ? "All national equipment" : `${scope} controlled assets`, severity: "blue" as const },
    { label: "Action required", value: getSeverityCount(visibleAssets, "red").toString(), detail: "Service items needing action", severity: "red" as const },
    { label: "Watch", value: getSeverityCount(visibleAssets, "amber").toString(), detail: "Assets getting close to service point", severity: "amber" as const },
    { label: "Readings", value: "Pending", detail: "Thor Portal feed planned", severity: "amber" as const }
  ];

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
      <PageIntro
        title="Equipment Servicing"
        detail="Central servicing hub for asset servicing and repairs."
      />
      <FlowHeading eyebrow="Equipment Servicing" title="Use odometer and hour readings to keep servicing visible before assets fail in the field." />
      <section className="status-strip equipment-summary" aria-label="Equipment servicing overview">
        {equipmentServiceSummary.map((item) => (
          <article className={`metric-card signal-${item.severity}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </article>
        ))}
      </section>
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Thor Portal data feed" title={`${scope} odometer and hour tracking`} pill={`${visibleAssets.length} assets`}>
          <div className="equipment-table">
            <div className="equipment-row header">
              <span>Asset</span>
              <span>Type</span>
              <span>Region</span>
              <span>Reading</span>
              <span>Next service</span>
              <span>Status</span>
            </div>
            {visibleAssets.map((asset) => (
              <article className="equipment-row" key={asset.asset}>
                <strong>{asset.asset}</strong>
                <span>{asset.category}</span>
                <span>{asset.region}</span>
                <span>{asset.currentReading}</span>
                <span>{asset.nextService}</span>
                <div className="meta-row"><Tag tone={asset.severity}>{asset.status}</Tag></div>
                <small>
                  {asset.readingType}: {asset.currentReading}. Remaining: {asset.remaining}. Latest source: {asset.lastSubmitted}.
                </small>
              </article>
            ))}
            {visibleAssets.length ? null : <div className="empty-state">No equipment assets are currently assigned to {scope}.</div>}
          </div>
        </Panel>

        <Panel eyebrow="Servicing logic" title="How readings become action">
          <div className="pathway-list">
            {servicingDataFlow.map((item) => (
              <article className="pathway-item equipment-flow-item" key={item.step}>
                <span>{item.step}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Workshop control" title="Service ownership">
          <div className="brief-stack">
            <div className="brief-item"><span className="brief-dot" /><div><strong>Workshop view will own service actions.</strong><small>Jason and workshop access should see assets needing booking, parts, repairs or return-to-service follow-up.</small></div></div>
            <div className="brief-item"><span className="brief-dot" /><div><strong>Managers submit readings through Thor Portal.</strong><small>TOC should not rely on manual duplicate entry once the Portal feed is connected.</small></div></div>
            <div className="brief-item"><span className="brief-dot" /><div><strong>Fleetio can remain the asset reference.</strong><small>TOC can use Fleetio for asset identity and GPS, while Thor Portal supplies operational readings.</small></div></div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
