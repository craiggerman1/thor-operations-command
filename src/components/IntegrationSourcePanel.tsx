"use client";

import { useEffect, useState } from "react";
import { Panel, Tag } from "@/components/TocCards";
import { integrationDefaults } from "@/lib/integration-settings";
import type { IntegrationPageSlug, IntegrationSourceConfig } from "@/lib/integration-settings";

type IntegrationSourceState = {
  scope: string;
  live: boolean;
  label: string;
  detail: string;
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

function defaultSourceState(config: IntegrationSourceConfig, scope: string): IntegrationSourceState {
  return {
    scope,
    live: config.connected,
    label: config.connected ? "Connected" : config.statusLabel,
    detail: config.connected
      ? `${config.sourceName} is marked connected for ${scope}.`
      : `${config.sourceName} is configured for ${scope}. Live feed activation is still controlled from Admin Settings.`
  };
}

async function fetchIntegrationConfig(slug: IntegrationPageSlug, scope: string) {
  const response = await fetch(`/api/integration-settings?slug=${encodeURIComponent(slug)}&scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Integration source settings unavailable.");
  const config = (payload.config || integrationDefaults[slug]) as IntegrationSourceConfig;
  return {
    config,
    sourceState: (payload.sourceState || defaultSourceState(config, scope)) as IntegrationSourceState
  };
}

export function IntegrationSourcePanel({ slug, eyebrow, title }: { slug: IntegrationPageSlug; eyebrow: string; title: string }) {
  const [scope, setScope] = useState("National");
  const [config, setConfig] = useState<IntegrationSourceConfig>(integrationDefaults[slug]);
  const [sourceState, setSourceState] = useState<IntegrationSourceState>(() => defaultSourceState(integrationDefaults[slug], "National"));

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
    function syncConfig() {
      fetchIntegrationConfig(slug, scope)
        .then((payload) => {
          setConfig(payload.config);
          setSourceState(payload.sourceState);
        })
        .catch(() => {
          const fallback = integrationDefaults[slug];
          setConfig(fallback);
          setSourceState(defaultSourceState(fallback, scope));
        });
    }

    syncConfig();
    window.addEventListener("toc.integrationSettings.updated", syncConfig);
    return () => window.removeEventListener("toc.integrationSettings.updated", syncConfig);
  }, [scope, slug]);

  return (
    <Panel wide eyebrow={eyebrow} title={title} pill={sourceState.label}>
      <div className="brief-item source-brief">
        <span className={`brief-dot ${sourceState.live ? "green" : ""}`} />
        <div>
          <span className="eyebrow">{config.sourceName}</span>
          <strong>{config.title}</strong>
          <small>{config.detail}</small>
          <small>{sourceState.detail}</small>
          <div className="meta-row">
            <Tag tone={sourceState.live ? "green" : "amber"}>{sourceState.label}</Tag>
            <Tag>{sourceState.scope} scope</Tag>
          </div>
        </div>
      </div>
    </Panel>
  );
}
