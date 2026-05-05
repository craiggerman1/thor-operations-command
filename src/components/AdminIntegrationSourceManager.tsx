"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/components/TocCards";
import { integrationDefaults } from "@/lib/integration-settings";
import { tocFetch } from "@/lib/toc-client-auth";
import type { IntegrationPageSlug, IntegrationSourceConfig } from "@/lib/integration-settings";

async function fetchIntegrationConfig(slug: IntegrationPageSlug) {
  const response = await tocFetch(`/api/integration-settings?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Integration settings database read failed.");
  return (payload.config || integrationDefaults[slug]) as IntegrationSourceConfig;
}

async function mutateIntegrationConfig(body: Record<string, unknown>) {
  const response = await tocFetch("/api/integration-settings", {
    method: "POST",
    body: JSON.stringify(body)
  }, true);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Integration settings update failed.");
  return (payload.config || integrationDefaults[body.slug as IntegrationPageSlug]) as IntegrationSourceConfig;
}

export function AdminIntegrationSourceManager({ slug, label }: { slug: IntegrationPageSlug; label: string }) {
  const [config, setConfig] = useState<IntegrationSourceConfig>(integrationDefaults[slug]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchIntegrationConfig(slug)
      .then(setConfig)
      .catch((error: Error) => setMessage(error.message));
  }, [slug]);

  function updateConfig(updates: Partial<IntegrationSourceConfig>) {
    setConfig((current) => ({ ...current, ...updates }));
  }

  async function saveConfig(action = "saveConfig") {
    setIsSaving(true);
    setMessage("");
    try {
      const nextConfig = await mutateIntegrationConfig({ action, slug, config });
      setConfig(nextConfig);
      setMessage(action === "resetConfig" ? `${label} source settings reset.` : `${label} source settings saved.`);
      window.dispatchEvent(new Event("toc.integrationSettings.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not save ${label} source settings.`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="admin-action-console">
      <div className="admin-action-form">
        <div>
          <strong>{label} source control</strong>
          <small>Controls the source status and operational wording shown on the {label} page.</small>
        </div>
        <div className="admin-action-grid">
          <label><span>Source name</span><input value={config.sourceName} onChange={(event) => updateConfig({ sourceName: event.target.value })} /></label>
          <label><span>Status label</span><input value={config.statusLabel} onChange={(event) => updateConfig({ statusLabel: event.target.value })} /></label>
        </div>
        <label><span>Title</span><input value={config.title} onChange={(event) => updateConfig({ title: event.target.value })} /></label>
        <label><span>Detail</span><textarea value={config.detail} onChange={(event) => updateConfig({ detail: event.target.value })} /></label>
        <label className="admin-checkbox-row">
          <input type="checkbox" checked={config.connected} onChange={(event) => updateConfig({ connected: event.target.checked })} />
          <span>Mark source as connected</span>
        </label>
        <div className="admin-action-controls">
          <button type="button" onClick={() => void saveConfig()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Source Settings"}</button>
          <button type="button" className="danger-button" onClick={() => void saveConfig("resetConfig")} disabled={isSaving}>Reset Defaults</button>
        </div>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
      <div className="admin-action-list">
        <article className="admin-action-card">
          <div className="admin-action-card-head">
            <div>
              <strong>{config.sourceName}</strong>
              <small>{config.title}</small>
            </div>
            <Tag tone={config.connected ? "green" : "amber"}>{config.connected ? "Connected" : config.statusLabel}</Tag>
          </div>
          <p>{config.detail}</p>
        </article>
      </div>
    </div>
  );
}
