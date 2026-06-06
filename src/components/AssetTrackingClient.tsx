"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";
import type { Status } from "@/lib/toc-data";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";

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

type LeafletModule = typeof import("leaflet");
type AssetSortKey = "unit" | "region" | "status" | "location" | "speed" | "latestAt" | "readings";
type SortDirection = "asc" | "desc";

const assetSortHeadings: { key: AssetSortKey; label: string }[] = [
  { key: "unit", label: "Unit" },
  { key: "region", label: "Region" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
  { key: "speed", label: "Speed" },
  { key: "latestAt", label: "Last GPS" },
  { key: "readings", label: "Readings" }
];

const restrictedProviderNamePattern = ["ti" + "tan", "rental", "group"].join("\\s+");

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

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanProviderDisplay(value: string | null | undefined, fallback = "Thor Fleet") {
  const cleaned = String(value || "")
    .replace(new RegExp(restrictedProviderNamePattern, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || fallback;
}

function markerTone(asset: TrackedAsset) {
  return asset.severity === "green" ? "green" : asset.severity === "red" ? "red" : asset.severity === "amber" ? "amber" : "blue";
}

function getAssetSortValue(asset: TrackedAsset, key: AssetSortKey) {
  switch (key) {
    case "unit":
      return asset.unit;
    case "region":
      return asset.region;
    case "status":
      return asset.status;
    case "location":
      return `${asset.location} ${asset.group}`;
    case "speed":
      return asset.speedKph ?? -1;
    case "latestAt":
      return asset.latestAt ? new Date(asset.latestAt).getTime() : 0;
    case "readings":
      return asset.odometer ?? asset.engineHours ?? 0;
    default:
      return "";
  }
}

function compareAssetsByHeading(first: TrackedAsset, second: TrackedAsset, key: AssetSortKey) {
  const firstValue = getAssetSortValue(first, key);
  const secondValue = getAssetSortValue(second, key);

  if (typeof firstValue === "number" && typeof secondValue === "number") {
    return firstValue - secondValue || first.unit.localeCompare(second.unit, "en-AU", { numeric: true, sensitivity: "base" });
  }

  return String(firstValue).localeCompare(String(secondValue), "en-AU", { numeric: true, sensitivity: "base" })
    || first.unit.localeCompare(second.unit, "en-AU", { numeric: true, sensitivity: "base" });
}

export function AssetTrackingClient() {
  const [scope, setScope] = useState("National");
  const [payload, setPayload] = useState<AssetTrackingPayload>(emptyPayload);
  const [status, setStatus] = useState("Loading Fleet Complete assets...");
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<AssetSortKey>("unit");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const markerRefs = useRef<Map<string, Marker>>(new Map());
  const leafletRef = useRef<LeafletModule | null>(null);

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
    const matchingAssets = needle ? payload.assets.filter((asset) => [
      asset.unit,
      asset.region,
      asset.group,
      asset.status,
      asset.location,
      asset.licensePlate,
      asset.vehicleType
    ].join(" ").toLowerCase().includes(needle)) : payload.assets;

    return [...matchingAssets].sort((first, second) => {
      const result = compareAssetsByHeading(first, second, sortKey);
      return sortDirection === "asc" ? result : -result;
    });
  }, [payload.assets, query, sortDirection, sortKey]);

  const mappedAssets = useMemo(
    () => filteredAssets.filter((asset) => typeof asset.latitude === "number" && typeof asset.longitude === "number"),
    [filteredAssets]
  );

  useEffect(() => {
    let cancelled = false;

    async function drawMap() {
      if (!mapNodeRef.current) return;

      const leaflet = leafletRef.current || await import("leaflet");
      if (cancelled || !mapNodeRef.current) return;
      leafletRef.current = leaflet;

      if (!mapRef.current) {
        mapRef.current = leaflet.map(mapNodeRef.current, {
          center: [-25.2744, 133.7751],
          zoom: 4,
          zoomControl: true,
          scrollWheelZoom: true
        });
        leaflet.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
          maxZoom: 19,
          attribution: "Tiles &copy; Esri"
        }).addTo(mapRef.current);
        leaflet.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
          maxZoom: 19,
          attribution: ""
        }).addTo(mapRef.current);
        markerLayerRef.current = leaflet.layerGroup().addTo(mapRef.current);
      }

      markerLayerRef.current?.clearLayers();
      markerRefs.current.clear();

      const bounds: [number, number][] = [];
      mappedAssets.forEach((asset) => {
        if (asset.latitude === null || asset.longitude === null) return;
        const tone = markerTone(asset);
        const marker = leaflet.marker([asset.latitude, asset.longitude], {
          title: `${asset.unit} - ${asset.region}`,
          icon: leaflet.divIcon({
            className: "",
            html: `<span class="asset-map-marker ${tone}"><span>${escapeHtml(asset.unit.replace(/^Unit\s*/i, "").slice(0, 4))}</span></span>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -18]
          })
        });

        marker.bindPopup(`
          <div class="asset-map-popup">
            <strong>${escapeHtml(asset.unit)}</strong>
            <small>${escapeHtml(asset.vehicleType)} | Plate ${escapeHtml(asset.licensePlate)}</small>
            <dl>
              <div><dt>Region</dt><dd>${escapeHtml(asset.region)}</dd></div>
              <div><dt>Status</dt><dd>${escapeHtml(asset.status)}</dd></div>
              <div><dt>Speed</dt><dd>${escapeHtml(formatNumber(asset.speedKph, " km/h"))}</dd></div>
              <div><dt>Last GPS</dt><dd>${escapeHtml(formatDateTime(asset.latestAt))}</dd></div>
            </dl>
            <p>${escapeHtml(asset.location)}</p>
            ${asset.mapHref ? `<a href="${escapeHtml(asset.mapHref)}" target="_blank" rel="noreferrer">Open in Google Maps</a>` : ""}
          </div>
        `);
        marker.addTo(markerLayerRef.current!);
        markerRefs.current.set(asset.id, marker);
        bounds.push([asset.latitude, asset.longitude]);
      });

      if (bounds.length > 1) {
        mapRef.current.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
      } else if (bounds.length === 1) {
        mapRef.current.setView(bounds[0], 12);
      } else {
        mapRef.current.setView([-25.2744, 133.7751], 4);
      }

      window.setTimeout(() => mapRef.current?.invalidateSize(), 100);
    }

    void drawMap();

    return () => {
      cancelled = true;
    };
  }, [mappedAssets]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  function focusAsset(asset: TrackedAsset) {
    if (asset.latitude === null || asset.longitude === null || !mapRef.current) return;
    mapRef.current.flyTo([asset.latitude, asset.longitude], Math.max(mapRef.current.getZoom(), 15), { duration: 0.8 });
    window.setTimeout(() => markerRefs.current.get(asset.id)?.openPopup(), 850);
    mapNodeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function toggleSort(key: AssetSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  }

  return (
    <>
      <Panel wide eyebrow="Live GPS feed" title={`${scope} asset tracking`} pill={payload.connected ? "Fleet Complete connected" : "Connection required"}>
        <div className="asset-tracking-toolbar">
          <div>
            <strong>{cleanProviderDisplay(payload.fleetName, "Thor fleet visibility")}</strong>
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
            { label: "Units Available", value: "0", detail: "Configure Fleet Complete env vars", severity: "amber" as const },
            { label: "Moving", value: "0", detail: "Waiting for live feed", severity: "green" as const },
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

        <section className="asset-tracking-map-card" aria-label="Fleet Complete unit map">
          <div className="asset-map-header">
            <div>
              <span>Mission control map</span>
              <strong>Live unit positions</strong>
              <small>{mappedAssets.length} mapped units visible. {filteredAssets.length - mappedAssets.length} without GPS coordinates.</small>
            </div>
            <div className="asset-map-legend" aria-label="Map marker legend">
              <span><i className="green" /> Moving</span>
              <span><i className="blue" /> Stopped</span>
              <span><i className="amber" /> Stale</span>
              <span><i className="red" /> Offline</span>
            </div>
          </div>
          <div className="asset-tracking-map" ref={mapNodeRef} />
        </section>

        <div className="asset-tracking-table" role="table" aria-label="Fleet Complete tracked units">
          <div className="asset-tracking-row header" role="row">
            {assetSortHeadings.map((heading) => (
              <button
                type="button"
                className={`asset-sort-heading ${sortKey === heading.key ? "active" : ""}`}
                role="columnheader"
                aria-sort={sortKey === heading.key ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                onClick={() => toggleSort(heading.key)}
                key={heading.key}
              >
                <span>{heading.label}</span>
                <b aria-hidden="true">{sortKey === heading.key ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</b>
              </button>
            ))}
          </div>
          {filteredAssets.map((asset) => (
            <article
              className={`asset-tracking-row ${asset.severity} ${asset.latitude !== null && asset.longitude !== null ? "is-map-selectable" : ""}`}
              role="row"
              tabIndex={asset.latitude !== null && asset.longitude !== null ? 0 : undefined}
              aria-label={`${asset.unit} ${asset.region} ${asset.status}${asset.latitude !== null && asset.longitude !== null ? ". Select to zoom to unit on map." : ""}`}
              onClick={() => focusAsset(asset)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  focusAsset(asset);
                }
              }}
              key={asset.id}
            >
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
                <small>{cleanProviderDisplay(asset.group, asset.region)}</small>
                {asset.mapHref ? <a href={asset.mapHref} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open map</a> : null}
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
