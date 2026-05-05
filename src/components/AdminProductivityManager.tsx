"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/components/TocCards";

type ProductivitySite = {
  id: string;
  site: string;
  slug: string;
  region: string;
  productivityScore: number;
  latestNote: string;
  actionHref?: string;
};

type DraftState = Record<string, { score: string; note: string }>;

const regions = ["National", "Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"];

function toneForScore(score: number) {
  if (score < 50) return "red";
  if (score < 80) return "amber";
  return "green";
}

function buildDrafts(sites: ProductivitySite[]) {
  return sites.reduce((lookup, site) => {
    lookup[site.id] = { score: String(site.productivityScore), note: site.latestNote || "" };
    return lookup;
  }, {} as DraftState);
}

async function fetchProductivity() {
  const response = await fetch("/api/productivity", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Productivity database read failed.");
  return (payload.sites || []) as ProductivitySite[];
}

async function mutateProductivity(body: Record<string, unknown>) {
  const response = await fetch("/api/productivity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Productivity update failed.");
  return (payload.sites || []) as ProductivitySite[];
}

export function AdminProductivityManager() {
  const [sites, setSites] = useState<ProductivitySite[]>([]);
  const [drafts, setDrafts] = useState<DraftState>({});
  const [siteName, setSiteName] = useState("");
  const [region, setRegion] = useState("Brisbane");
  const [score, setScore] = useState("80");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function applySites(nextSites: ProductivitySite[]) {
    setSites(nextSites);
    setDrafts(buildDrafts(nextSites));
  }

  useEffect(() => {
    fetchProductivity()
      .then(applySites)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  async function createSite() {
    if (!siteName.trim()) {
      setMessage("Add a productivity site name first.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      const nextSites = await mutateProductivity({ action: "createSite", siteName, region, productivityScore: Number(score), latestNote: note });
      applySites(nextSites);
      setSiteName("");
      setScore("80");
      setNote("");
      setMessage("Productivity site created.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create productivity site.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateSite(site: ProductivitySite) {
    const draft = drafts[site.id] || { score: String(site.productivityScore), note: site.latestNote || "" };
    setMessage("");
    try {
      const nextSites = await mutateProductivity({ action: "updateSite", id: site.id, updates: { productivityScore: Number(draft.score), latestNote: draft.note } });
      applySites(nextSites);
      setMessage("Productivity site updated.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update productivity site.");
    }
  }

  async function deleteSite(id: string) {
    if (!window.confirm("Are you sure you want to delete this productivity site?")) return;
    setMessage("");
    try {
      const nextSites = await mutateProductivity({ action: "deleteSite", id });
      applySites(nextSites);
      setMessage("Productivity site deleted.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete productivity site.");
    }
  }

  return (
    <div className="admin-action-console">
      <div className="admin-action-form">
        <div>
          <strong>Create productivity site</strong>
          <small>Sites below 80% automatically create linked Action Centre items for manager action.</small>
        </div>
        <label><span>Site name</span><input value={siteName} onChange={(event) => setSiteName(event.target.value)} placeholder="Customer / site name" /></label>
        <div className="admin-action-grid">
          <label><span>Region</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Productivity score</span><input type="number" min="0" max="100" value={score} onChange={(event) => setScore(event.target.value)} /></label>
        </div>
        <label><span>Productivity note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Productivity queue or improvement note" /></label>
        <button type="button" onClick={createSite} disabled={isSaving}>{isSaving ? "Creating..." : "Create Productivity Site"}</button>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
      <div className="admin-action-list">
        <div className="admin-list-head">
          <div>
            <strong>Productivity sites</strong>
            <small>{sites.length} sites loaded from Supabase.</small>
          </div>
        </div>
        {sites.map((site) => {
          const draft = drafts[site.id] || { score: String(site.productivityScore), note: site.latestNote || "" };
          const draftScore = Number(draft.score);
          return (
            <article className="admin-action-card" key={site.id}>
              <div className="admin-action-card-head">
                <div>
                  <strong>{site.site}</strong>
                  <small>{site.region} - productivity source record</small>
                </div>
                <Tag tone={toneForScore(Number.isFinite(draftScore) ? draftScore : site.productivityScore)}>{Number.isFinite(draftScore) ? draftScore : site.productivityScore}%</Tag>
              </div>
              <div className="admin-action-grid">
                <label><span>Score</span><input type="number" min="0" max="100" value={draft.score} onChange={(event) => setDrafts((current) => ({ ...current, [site.id]: { ...draft, score: event.target.value } }))} /></label>
                <label><span>Note</span><input value={draft.note} onChange={(event) => setDrafts((current) => ({ ...current, [site.id]: { ...draft, note: event.target.value } }))} /></label>
              </div>
              <div className="admin-action-controls">
                <button type="button" onClick={() => void updateSite(site)}>Save</button>
                <button type="button" onClick={() => void mutateProductivity({ action: "updateSite", id: site.id, updates: { productivityScore: 80, latestNote: draft.note } }).then(applySites)}>Mark Healthy</button>
                <button type="button" className="danger-button" onClick={() => void deleteSite(site.id)}>Delete</button>
              </div>
            </article>
          );
        })}
        {sites.length ? null : <div className="empty-state">No productivity sites are currently loaded from the database.</div>}
      </div>
    </div>
  );
}
