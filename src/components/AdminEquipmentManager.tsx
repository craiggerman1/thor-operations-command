"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";

type EquipmentAsset = {
  id: string;
  asset: string;
  category: string;
  region: string;
  status: string;
  severity: "red" | "amber" | "green" | "blue";
  latestOdometer: string;
  latestHours: string;
  nextService: string;
  serviceNote: string;
  actionHref?: string;
};

const regions = ["National", "Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"];
const assetTypes = ["Wash truck", "Wash ute", "Honda", "Generator", "Pony", "Wash plant", "Workshop asset"];
const statuses = ["Serviceable", "Active", "Service due", "Book service", "Under repair", "Overdue", "Stop use"];

async function fetchEquipment() {
  const response = await tocFetch("/api/equipment?all=true", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Equipment database read failed.");
  return (payload.assets || []) as EquipmentAsset[];
}

async function mutateEquipment(body: Record<string, unknown>) {
  const response = await tocFetch("/api/equipment", {
    method: "POST",
    body: JSON.stringify(body)
  }, true);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Equipment update failed.");
  return (payload.assets || []) as EquipmentAsset[];
}

export function AdminEquipmentManager() {
  const [assets, setAssets] = useState<EquipmentAsset[]>([]);
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("Wash truck");
  const [region, setRegion] = useState("Brisbane");
  const [status, setStatus] = useState("Serviceable");
  const [latestOdometer, setLatestOdometer] = useState("");
  const [latestHours, setLatestHours] = useState("");
  const [nextService, setNextService] = useState("");
  const [serviceNote, setServiceNote] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchEquipment()
      .then(setAssets)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  async function createAsset() {
    if (!assetName.trim()) {
      setMessage("Add an asset name first.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      const nextAssets = await mutateEquipment({ action: "create", all: true, assetName, assetType, region, status, latestOdometer, latestHours, nextService, serviceNote });
      setAssets(nextAssets);
      setAssetName("");
      setLatestOdometer("");
      setLatestHours("");
      setNextService("");
      setServiceNote("");
      setMessage("Equipment asset created.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create equipment asset.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateAsset(id: string, updates: Record<string, unknown>, successMessage: string) {
    setMessage("");
    try {
      const nextAssets = await mutateEquipment({ action: "update", all: true, id, updates });
      setAssets(nextAssets);
      setMessage(successMessage);
      window.dispatchEvent(new Event("toc.actionState.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update equipment asset.");
    }
  }

  async function deleteAsset(id: string) {
    if (!window.confirm("Are you sure you want to delete this equipment asset?")) return;
    setMessage("");
    try {
      const nextAssets = await mutateEquipment({ action: "delete", all: true, id });
      setAssets(nextAssets);
      setMessage("Equipment asset deleted.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete equipment asset.");
    }
  }

  return (
    <div className="admin-action-console">
      <div className="admin-action-form">
        <div>
          <strong>Register equipment asset</strong>
          <small>Assign wash vehicles, wash plants and mechanical wash assets to their operating region.</small>
        </div>
        <label><span>Asset name</span><input value={assetName} onChange={(event) => setAssetName(event.target.value)} placeholder="Asset name or registration" /></label>
        <div className="admin-action-grid">
          <label><span>Asset type</span><select value={assetType} onChange={(event) => setAssetType(event.target.value)}>{assetTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Region</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Next service</span><input value={nextService} onChange={(event) => setNextService(event.target.value)} placeholder="Due date / km / hours" /></label>
          <label><span>Odometer</span><input inputMode="numeric" value={latestOdometer} onChange={(event) => setLatestOdometer(event.target.value)} placeholder="km" /></label>
          <label><span>Hours</span><input inputMode="numeric" value={latestHours} onChange={(event) => setLatestHours(event.target.value)} placeholder="hrs" /></label>
        </div>
        <label><span>Service note</span><textarea value={serviceNote} onChange={(event) => setServiceNote(event.target.value)} placeholder="Servicing note or repair requirement" /></label>
        <button type="button" onClick={createAsset} disabled={isSaving}>{isSaving ? "Registering..." : "Register Equipment Asset"}</button>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
      <div className="admin-action-list">
        <div className="admin-list-head">
          <div>
            <strong>Equipment register</strong>
            <small>{assets.length} assets loaded from Supabase.</small>
          </div>
        </div>
        {assets.map((asset) => (
          <article className="admin-action-card" key={asset.id}>
            <div className="admin-action-card-head">
              <div>
                <strong>{asset.asset}</strong>
                <small>{asset.region} - {asset.category}</small>
              </div>
              <Tag tone={asset.severity}>{asset.status}</Tag>
            </div>
            <p>{asset.serviceNote}</p>
            <div className="admin-action-controls">
              <select value={asset.status} onChange={(event) => void updateAsset(asset.id, { status: event.target.value }, "Equipment status updated.")}>
                {statuses.map((item) => <option key={item}>{item}</option>)}
              </select>
              <button type="button" onClick={() => void updateAsset(asset.id, { status: "Serviceable" }, "Equipment marked serviceable.")}>Mark Serviceable</button>
              <button type="button" onClick={() => void updateAsset(asset.id, { status: "Service due" }, "Service review action created.")}>Service Due</button>
              <button type="button" className="danger-button" onClick={() => void deleteAsset(asset.id)}>Delete</button>
            </div>
          </article>
        ))}
        {assets.length ? null : <div className="empty-state">No equipment assets are currently loaded from the database.</div>}
      </div>
    </div>
  );
}
