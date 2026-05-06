"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/components/TocCards";
import { defaultHomeSettings } from "@/lib/home-settings";
import { tocFetch } from "@/lib/toc-client-auth";
import type { HomeRoadmapItem, HomeSettingsConfig, HomeSignalConfig } from "@/lib/home-settings";

async function fetchHomeSettings() {
  const response = await tocFetch("/api/home-settings", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Home settings database read failed.");
  return (payload.config || defaultHomeSettings) as HomeSettingsConfig;
}

async function mutateHomeSettings(body: Record<string, unknown>) {
  const response = await tocFetch("/api/home-settings", {
    method: "POST",
    body: JSON.stringify(body)
  }, true);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Home settings update failed.");
  return (payload.config || defaultHomeSettings) as HomeSettingsConfig;
}

export function AdminHomeManager() {
  const [config, setConfig] = useState<HomeSettingsConfig>(defaultHomeSettings);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchHomeSettings()
      .then(setConfig)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  function updateSignal(key: HomeSignalConfig["key"], updates: Partial<HomeSignalConfig>) {
    setConfig((current) => ({
      ...current,
      signals: current.signals.map((signal) => signal.key === key ? { ...signal, ...updates } : signal)
    }));
  }

  function updateRoadmap(step: string, updates: Partial<HomeRoadmapItem>) {
    setConfig((current) => ({
      ...current,
      roadmap: current.roadmap.map((item) => item.step === step ? { ...item, ...updates } : item)
    }));
  }

  async function saveConfig(action = "saveConfig") {
    setIsSaving(true);
    setMessage("");
    try {
      const nextConfig = await mutateHomeSettings({ action, config });
      setConfig(nextConfig);
      setMessage(action === "resetConfig" ? "Home settings reset to default." : "Home settings saved.");
      window.dispatchEvent(new Event("toc.homeSettings.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save Home settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="admin-action-console">
      <div className="admin-action-form">
        <div>
          <strong>Home command tiles</strong>
          <small>Choose which top-level command signal tiles appear on the Home page.</small>
        </div>
        <div className="admin-action-list compact-list">
          {config.signals.map((signal) => (
            <article className="admin-action-card compact-admin-card" key={signal.key}>
              <div className="admin-action-card-head">
                <label className="admin-checkbox-row">
                  <input type="checkbox" checked={signal.enabled} onChange={(event) => updateSignal(signal.key, { enabled: event.target.checked })} />
                  <span>{signal.label}</span>
                </label>
                <Tag tone={signal.enabled ? "green" : "amber"}>{signal.enabled ? "Visible" : "Hidden"}</Tag>
              </div>
              <label><span>Tile label</span><input value={signal.label} onChange={(event) => updateSignal(signal.key, { label: event.target.value })} /></label>
            </article>
          ))}
        </div>
        <div className="admin-action-controls">
          <button type="button" onClick={() => void saveConfig()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Home Settings"}</button>
          <button type="button" className="danger-button" onClick={() => void saveConfig("resetConfig")} disabled={isSaving}>Reset Defaults</button>
        </div>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
      <div className="admin-action-list">
        <div className="admin-list-head">
          <div>
            <strong>Go Live Pathway</strong>
            <small>Roadmap wording and status displayed on the admin Home page.</small>
          </div>
        </div>
        {config.roadmap.map((item) => (
          <article className="admin-action-card" key={item.step}>
            <div className="admin-action-card-head">
              <div>
                <strong>{item.step} - {item.title}</strong>
                <small>{item.status}</small>
              </div>
              <Tag tone={item.severity}>{item.severity}</Tag>
            </div>
            <div className="admin-action-grid">
              <label><span>Title</span><input value={item.title} onChange={(event) => updateRoadmap(item.step, { title: event.target.value })} /></label>
              <label><span>Status</span><input value={item.status} onChange={(event) => updateRoadmap(item.step, { status: event.target.value })} /></label>
              <label>
                <span>Tone</span>
                <select value={item.severity} onChange={(event) => updateRoadmap(item.step, { severity: event.target.value as HomeRoadmapItem["severity"] })}>
                  <option value="green">Green</option>
                  <option value="amber">Amber</option>
                  <option value="red">Red</option>
                  <option value="blue">Blue</option>
                </select>
              </label>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
