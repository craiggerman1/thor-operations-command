"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/components/TocCards";
import { allRegions } from "@/lib/access";
import { sheetSourceDefaults } from "@/lib/sheet-source-settings";
import { tocFetch } from "@/lib/toc-client-auth";
import type { SheetSourceConfig, SheetSourceSlug } from "@/lib/sheet-source-settings";

async function fetchSheetSourceConfig(slug: SheetSourceSlug) {
  const response = await tocFetch(`/api/sheet-source-settings?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Sheet source settings database read failed.");
  return (payload.config || sheetSourceDefaults[slug]) as SheetSourceConfig;
}

async function mutateSheetSourceConfig(body: Record<string, unknown>) {
  const response = await tocFetch("/api/sheet-source-settings", {
    method: "POST",
    body: JSON.stringify(body)
  }, true);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Sheet source settings update failed.");
  return (payload.config || sheetSourceDefaults[body.slug as SheetSourceSlug]) as SheetSourceConfig;
}

async function refreshSheetCache(slug: SheetSourceSlug) {
  const response = await tocFetch("/api/odin/sheet-sync", {
    method: "POST",
    body: JSON.stringify({ slug })
  }, true);
  const payload = await response.json();
  if (!response.ok && response.status !== 207) throw new Error(payload.error || "Sheet cache refresh failed.");
  return payload as { results?: { slug: string; cachedRows: number; staffCount?: number; siteCount?: number; error?: string }[] };
}

export function AdminSheetSourceManager({ slug, label }: { slug: SheetSourceSlug; label: string }) {
  const [config, setConfig] = useState<SheetSourceConfig>(sheetSourceDefaults[slug]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSheetSourceConfig(slug)
      .then(setConfig)
      .catch((error: Error) => setMessage(error.message));
  }, [slug]);

  function updateConfig(updates: Partial<SheetSourceConfig>) {
    setConfig((current) => ({ ...current, ...updates }));
  }

  async function saveConfig(action = "saveConfig") {
    setIsSaving(true);
    setMessage("");
    try {
      const nextConfig = await mutateSheetSourceConfig({ action, slug, config });
      setConfig(nextConfig);
      setMessage(action === "resetConfig" ? `${label} sheet source reset.` : `${label} sheet source saved.`);
      window.dispatchEvent(new Event("toc.sheetSourceSettings.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not save ${label} sheet source.`);
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshCache() {
    setIsSaving(true);
    setMessage("");
    try {
      const payload = await refreshSheetCache(slug);
      const result = payload.results?.find((item) => item.slug === slug);
      if (result?.error) throw new Error(result.error);
      setMessage(`${label} cache refreshed: ${result?.cachedRows || 0} database rows from ${result?.staffCount || 0} staff records.`);
      window.dispatchEvent(new Event("toc.sheetCache.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not refresh ${label} cache.`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="admin-action-console">
      <div className="admin-action-form">
        <div>
          <strong>{label} sheet source</strong>
          <small>Controls which region this controlled Google Sheet feeds into. TOC does not edit the sheet.</small>
        </div>
        <div className="admin-action-grid">
          <label><span>Source name</span><input value={config.sourceName} onChange={(event) => updateConfig({ sourceName: event.target.value })} /></label>
          <label>
            <span>Mapped region</span>
            <select value={config.region} onChange={(event) => updateConfig({ region: event.target.value })}>
              {allRegions.filter((region) => region !== "National").map((region) => <option key={region}>{region}</option>)}
            </select>
          </label>
          <label><span>Status label</span><input value={config.statusLabel} onChange={(event) => updateConfig({ statusLabel: event.target.value })} /></label>
        </div>
        <label><span>Google Sheet URL</span><input value={config.spreadsheetUrl} onChange={(event) => updateConfig({ spreadsheetUrl: event.target.value })} /></label>
        <label className="admin-checkbox-row">
          <input type="checkbox" checked={config.connected} onChange={(event) => updateConfig({ connected: event.target.checked })} />
          <span>Mark source as connected</span>
        </label>
        <div className="admin-action-controls">
          <button type="button" onClick={() => void saveConfig()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Sheet Source"}</button>
          <button type="button" onClick={() => void refreshCache()} disabled={isSaving}>Refresh Database Cache</button>
          <button type="button" className="danger-button" onClick={() => void saveConfig("resetConfig")} disabled={isSaving}>Reset Defaults</button>
        </div>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
      <div className="admin-action-list">
        <article className="admin-action-card">
          <div className="admin-action-card-head">
            <div>
              <strong>{config.sourceName}</strong>
              <small>{config.region} controlled sheet mapping</small>
            </div>
            <Tag tone={config.connected ? "green" : "amber"}>{config.connected ? "Connected" : config.statusLabel}</Tag>
          </div>
          <p>{config.spreadsheetUrl}</p>
        </article>
      </div>
    </div>
  );
}
