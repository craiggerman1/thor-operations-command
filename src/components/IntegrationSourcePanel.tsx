"use client";

import { useEffect, useState } from "react";
import { Panel, Tag } from "@/components/TocCards";
import { integrationDefaults } from "@/lib/integration-settings";
import type { IntegrationPageSlug, IntegrationSourceConfig } from "@/lib/integration-settings";

async function fetchIntegrationConfig(slug: IntegrationPageSlug) {
  const response = await fetch(`/api/integration-settings?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Integration source settings unavailable.");
  return (payload.config || integrationDefaults[slug]) as IntegrationSourceConfig;
}

export function IntegrationSourcePanel({ slug, eyebrow, title }: { slug: IntegrationPageSlug; eyebrow: string; title: string }) {
  const [config, setConfig] = useState<IntegrationSourceConfig>(integrationDefaults[slug]);

  useEffect(() => {
    function syncConfig() {
      fetchIntegrationConfig(slug)
        .then(setConfig)
        .catch(() => setConfig(integrationDefaults[slug]));
    }

    syncConfig();
    window.addEventListener("toc.integrationSettings.updated", syncConfig);
    return () => window.removeEventListener("toc.integrationSettings.updated", syncConfig);
  }, [slug]);

  return (
    <Panel wide eyebrow={eyebrow} title={title} pill={config.statusLabel}>
      <div className="brief-item source-brief">
        <span className={`brief-dot ${config.connected ? "green" : ""}`} />
        <div>
          <span className="eyebrow">{config.sourceName}</span>
          <strong>{config.title}</strong>
          <small>{config.detail}</small>
          <div className="meta-row">
            <Tag tone={config.connected ? "green" : "amber"}>{config.connected ? "Connected" : config.statusLabel}</Tag>
          </div>
        </div>
      </div>
    </Panel>
  );
}
