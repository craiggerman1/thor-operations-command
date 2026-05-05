"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";

type RegionHealthConfig = {
  actionWeight: number;
  productivityWeight: number;
  openActionPenalty: number;
  urgentActionPenalty: number;
  minimumActionScore: number;
  healthyTarget: number;
};

type RegionHealth = {
  id: string;
  name: string;
  healthScore: number;
  tone: "red" | "amber" | "yellow" | "green";
  healthText: string;
  openActions: number;
  urgentActions: number;
  productivityScore: number;
  actionHealthScore: number;
};

const defaultConfig: RegionHealthConfig = {
  actionWeight: 58,
  productivityWeight: 42,
  openActionPenalty: 14,
  urgentActionPenalty: 8,
  minimumActionScore: 10,
  healthyTarget: 95
};

async function fetchRegionHealth() {
  const response = await tocFetch("/api/region-health", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Region Health database read failed.");
  return {
    regions: (payload.regions || []) as RegionHealth[],
    config: (payload.config || defaultConfig) as RegionHealthConfig
  };
}

async function mutateRegionHealth(body: Record<string, unknown>) {
  const response = await tocFetch("/api/region-health", {
    method: "POST",
    body: JSON.stringify(body)
  }, true);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Region Health settings update failed.");
  return {
    regions: (payload.regions || []) as RegionHealth[],
    config: (payload.config || defaultConfig) as RegionHealthConfig
  };
}

export function AdminRegionHealthManager() {
  const [regions, setRegions] = useState<RegionHealth[]>([]);
  const [config, setConfig] = useState<RegionHealthConfig>(defaultConfig);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function applyPayload(payload: { regions: RegionHealth[]; config: RegionHealthConfig }) {
    setRegions(payload.regions);
    setConfig(payload.config);
  }

  useEffect(() => {
    fetchRegionHealth()
      .then(applyPayload)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  function updateConfig(field: keyof RegionHealthConfig, value: string) {
    setConfig((current) => ({ ...current, [field]: Number(value) || 0 }));
  }

  async function saveConfig(action = "saveConfig") {
    setIsSaving(true);
    setMessage("");
    try {
      const payload = await mutateRegionHealth({ action, config });
      applyPayload(payload);
      setMessage(action === "resetConfig" ? "Region Health scoring reset to default." : "Region Health scoring saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save Region Health settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="admin-action-console">
      <div className="admin-action-form">
        <div>
          <strong>Score weighting</strong>
          <small>Tune how Action Centre load and productivity scores combine into the Region Health scoreboard.</small>
        </div>
        <div className="admin-action-grid">
          <label><span>Action weight</span><input type="number" min="0" max="100" value={config.actionWeight} onChange={(event) => updateConfig("actionWeight", event.target.value)} /></label>
          <label><span>Productivity weight</span><input type="number" min="0" max="100" value={config.productivityWeight} onChange={(event) => updateConfig("productivityWeight", event.target.value)} /></label>
          <label><span>Open action penalty</span><input type="number" min="1" max="50" value={config.openActionPenalty} onChange={(event) => updateConfig("openActionPenalty", event.target.value)} /></label>
          <label><span>Urgent action penalty</span><input type="number" min="0" max="50" value={config.urgentActionPenalty} onChange={(event) => updateConfig("urgentActionPenalty", event.target.value)} /></label>
          <label><span>Minimum action score</span><input type="number" min="0" max="100" value={config.minimumActionScore} onChange={(event) => updateConfig("minimumActionScore", event.target.value)} /></label>
          <label><span>Healthy target</span><input type="number" min="50" max="100" value={config.healthyTarget} onChange={(event) => updateConfig("healthyTarget", event.target.value)} /></label>
        </div>
        <div className="admin-action-controls">
          <button type="button" onClick={() => void saveConfig()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Scoring Settings"}</button>
          <button type="button" className="danger-button" onClick={() => void saveConfig("resetConfig")} disabled={isSaving}>Reset Defaults</button>
        </div>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
      <div className="admin-action-list">
        <div className="admin-list-head">
          <div>
            <strong>Current region scoreboard</strong>
            <small>{regions.length} regions calculated from live action and productivity tables.</small>
          </div>
        </div>
        {regions.map((region) => (
          <article className="admin-action-card" key={region.id}>
            <div className="admin-action-card-head">
              <div>
                <strong>{region.name}</strong>
                <small>{region.healthText}</small>
              </div>
              <Tag tone={region.tone === "yellow" ? "amber" : region.tone}>{region.healthScore}%</Tag>
            </div>
            <p>{region.openActions} open actions, {region.urgentActions} urgent actions, {region.productivityScore}% productivity.</p>
            <div className="meta-row">
              <Tag>{region.actionHealthScore}% action health</Tag>
              <Tag tone={region.productivityScore >= 80 ? "green" : "amber"}>{region.productivityScore}% productivity</Tag>
            </div>
          </article>
        ))}
        {regions.length ? null : <div className="empty-state">No region health rows are currently loaded from the database.</div>}
      </div>
    </div>
  );
}
