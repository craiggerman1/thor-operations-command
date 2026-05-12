"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";
import type { Status } from "@/lib/toc-data";

type AssetSummary = {
  label: string;
  value: string;
  detail: string;
  severity: Status | "green";
};

type TrackedAsset = {
  id: string;
  unit: string;
  region: string;
  group: string;
  status: string;
  severity: Status | "green";
  location: string;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  direction: number | null;
  ignition: string;
  odometer: number | null;
  engineHours: number | null;
  licensePlate: string;
  vehicleType: string;
  latestAt: string | null;
  staleMinutes: number | null;
  deviceSerial: string;
  mapHref: string;
};

type AssetTrackingPayload = {
  connected: boolean;
  source: string;
  generatedAt: string;
  cacheTtlSeconds: number;
  scope: string;
  fleetName: string;
  totalAssets: number;
  assets: TrackedAsset[];
  summary: AssetSummary[];
  error?: string;
};

const emptyPayload: AssetTrackingPayload = {
  connected: false,
  source: "Fleet Complete Unity API",
  generatedAt: "",
  cacheTtlSeconds: 120,
  scope: "National",
  fleetName: "Fleet Complete",
  totalAssets: 0,
  assets: [],
  summary: []
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "No timestamp";
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(Number(value))}${suffix}`;
}

export function AssetTrackingClient() {
  const [scope, setScope] = useState("National");
  const [payload, setPayload] = useState<AssetTrackingPayload>(emptyPayload);
  const [status, setStatus] = useState("Loading Fleet Complete assets...");
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");

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

  async function load(force = false) {
    setIsLoading(true);
    setStatus(force ? "Refreshing Fleet Complete..." : "Loading Fleet Complete assets...");
    try {
      const response = await tocFetch(`/api/asset-tracking?scope=${encodeURIComponent(scope)}${force ? "&refresh=true" : ""}`, { cache: "no-store" });
      const nextPayload = await response.json() as AssetTrackingPayload;
      if (!response.ok) throw new Error(nextPayload.error || "Fleet Complete assets could not be loaded.");
      setPayload(nextPayload);
      setStatus(nextPayload.connected ? `Fleet Complete connected. ${nextPayload.assets.length} units visible for ${scope}.` : nextPayload.error || "Fleet Complete not connected.");
    } catch (error) {
      setPayload((current) => ({ ...current, connected: false, error: error instanceof Error ? error.message : "Fleet Complete assets could not be loaded." }));
      setStatus(error instanceof Error ? error.message : "Fleet Complete assets could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, [scope]);

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return payload.assets;
    return payload.assets.filter((asset) => [
      asset.unit,
      asset.region,
      asset.group,
      asset.status,
      asset.location,
      asset.licensePlate,
      asset.vehicleType
    ].join(" ").toLowerCase().includes(needle));
  }, [payload.assets, query]);

  return (
    <>
      <Panel wide eyebrow="Live GPS feed" title={`${scope} asset tracking`} pill={payload.connected ? "Fleet Complete connected" : "Connection required"}>
        <div className="asset-tracking-toolbar">
          <div>
            <strong>{payload.fleetName}</strong>
            <small>{status}</small>
            <small>Last generated: {formatDateTime(payload.generatedAt)} | Cache: {payload.cacheTtlSeconds}s</small>
          </div>
          <div className="asset-tracking-actions">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search unit, region, plate or site" />
            <button type="button" onClick={() => void load(true)} disabled={isLoading}>{isLoading ? "Loading..." : "Refresh GPS"}</button>
          </div>
        </div>

        <div className="status-strip equipment-summary" aria-label="Fleet Complete summary">
          {(payload.summary.length ? payload.summary : [
            { label: "Units loaded", value: "0", detail: "Configure Fleet Complete env vars", severity: "amber" as const },
            { label: "Moving", value: "0", detail: "Waiting for live feed", severity: "blue" as const },
            { label: "Stale", value: "0", detail: "Waiting for live feed", severity: "green" as const },
            { label: "Offline", value: "0", detail: "Waiting for live feed", severity: "green" as const }
          ]).map((item) => (
            <article className={`metric-card signal-${item.severity === "red" ? "red" : item.severity === "amber" ? "amber" : item.severity === "green" ? "green" : "blue"}`} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </article>
          ))}
        </div>

        {payload.error ? <div className="asset-tracking-error">{payload.error}</div> : null}

        <div className="asset-tracking-table" role="table" aria-label="Fleet Complete tracked units">
          <div className="asset-tracking-row header" role="row">
            <span>Unit</span>
            <span>Region</span>
            <span>Status</span>
            <span>Location</span>
            <span>Speed</span>
            <span>Last GPS</span>
            <span>Readings</span>
          </div>
          {filteredAssets.map((asset) => (
            <article className={`asset-tracking-row ${asset.severity}`} role="row" key={asset.id}>
              <div>
                <strong>{asset.unit}</strong>
                <small>{asset.vehicleType} | Plate {asset.licensePlate}</small>
              </div>
              <span>{asset.region}</span>
              <div>
                <Tag tone={asset.severity === "green" ? "green" : asset.severity}>{asset.status}</Tag>
                <small>Ignition {asset.ignition}</small>
              </div>
              <div>
                <strong>{asset.location}</strong>
                <small>{asset.group}</small>
                {asset.mapHref ? <a href={asset.mapHref} target="_blank" rel="noreferrer">Open map</a> : null}
              </div>
              <span>{formatNumber(asset.speedKph, " km/h")}</span>
              <div>
                <strong>{formatDateTime(asset.latestAt)}</strong>
                <small>{asset.staleMinutes === null ? "Age unknown" : `${asset.staleMinutes} minutes old`}</small>
              </div>
              <div>
                <strong>{formatNumber(asset.odometer, " km")}</strong>
                <small>{formatNumber(asset.engineHours, " hrs")} | Device {asset.deviceSerial}</small>
              </div>
            </article>
          ))}
          {!filteredAssets.length ? (
            <div className="empty-state">{payload.connected ? "No units match the current scope/search." : "Fleet Complete is not connected yet. Add the server-side credentials and refresh this page."}</div>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
