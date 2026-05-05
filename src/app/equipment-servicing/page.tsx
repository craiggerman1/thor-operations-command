"use client";

import { useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import type { Status } from "@/lib/toc-data";
import { tocFetch } from "@/lib/toc-client-auth";

type EquipmentAsset = {
  id: string;
  asset: string;
  category: string;
  region: string;
  status: string;
  severity: Status;
  latestOdometer: string;
  latestHours: string;
  nextService: string;
  serviceNote: string;
  latestReadingAt: string;
};

type EquipmentSummary = {
  label: string;
  value: string;
  detail: string;
  severity: Status;
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

export default function EquipmentServicingPage() {
  const [scope, setScope] = useState("National");
  const [assets, setAssets] = useState<EquipmentAsset[]>([]);
  const [summary, setSummary] = useState<EquipmentSummary[]>([]);

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
    async function loadEquipment() {
      try {
        const response = await tocFetch(`/api/equipment?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
        const payload = await response.json();
        setAssets(payload.assets || []);
        setSummary(payload.summary || []);
      } catch {
        setAssets([]);
        setSummary([]);
      }
    }

    void loadEquipment();
  }, [scope]);

  return (
    <TocShell>
      <PageIntro title="Equipment Servicing" detail="Central servicing hub for asset servicing and repairs." />
      <FlowHeading eyebrow="Equipment Servicing" title="Track servicing, readings and repair action for wash assets." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Service command" title={`${scope} asset servicing`} pill={`${assets.length} assets`}>
          <div className="status-strip equipment-summary" aria-label="Equipment servicing summary">
            {summary.map((item) => (
              <article className={`metric-card signal-${item.severity}`} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </article>
            ))}
          </div>
          <div className="equipment-table" role="table" aria-label="Equipment servicing assets">
            <div className="equipment-row header" role="row">
              <strong>Asset</strong>
              <strong>Region</strong>
              <strong>Readings</strong>
              <strong>Next service</strong>
              <strong>Status</strong>
            </div>
            {assets.map((asset) => (
              <article className={`equipment-row ${asset.severity}`} role="row" key={asset.id}>
                <div>
                  <strong>{asset.asset}</strong>
                  <small>{asset.category}</small>
                </div>
                <div><strong>{asset.region}</strong><small>Assigned region</small></div>
                <div><strong>{asset.latestOdometer} km</strong><small>{asset.latestHours} hrs</small></div>
                <div><strong>{asset.nextService}</strong><small>{asset.serviceNote}</small></div>
                <div className="meta-row"><Tag tone={asset.severity}>{asset.status}</Tag></div>
              </article>
            ))}
            {assets.length ? null : <div className="empty-state">No equipment servicing assets are currently loaded for this scope.</div>}
          </div>
        </Panel>
        <Panel wide eyebrow="Action link" title="Servicing items feed into Action Centre" pill="Linked workflow">
          <div className="brief-item">
            <span className="brief-dot" />
            <div>
              <strong>Service risks should create Action Centre items for manager close-out.</strong>
              <small>When assets are overdue, under repair, or need booking, those items will be issued as action items and counted in Region Health.</small>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
