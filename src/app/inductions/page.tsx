"use client";

import { useEffect, useMemo, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { staffInductionsSheet } from "@/lib/toc-data";
import type { InductionFeed, InductionStatus } from "@/lib/toc-data";
import { sheetSourceDefaults } from "@/lib/sheet-source-settings";
import type { SheetSourceConfig } from "@/lib/sheet-source-settings";
import { tocFetch } from "@/lib/toc-client-auth";

function getStoredScope() {
  if (typeof window === "undefined") return "National";
  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.scope || "National";
  } catch {
    return "National";
  }
}

function getInductionTone(status: InductionStatus) {
  if (status === "Inducted") return "green";
  if (status === "Expiring This Month" || status === "Expiring Soon") return "amber";
  if (status === "Expired") return "red";
  if (status === "Not Inducted") return "grey";
  return "unknown";
}

function getInduction(feed: InductionFeed, staffName: string, siteName: string) {
  return feed.staff.find((staff) => staff.name === staffName)?.inductions.find((item) => item.site === siteName) || {
    site: siteName,
    status: "" as InductionStatus,
    expiry: ""
  };
}

type WorkerInductionSubmission = {
  id: string;
  completedAt: string;
  status: "ready_for_documents" | "documents_issued" | "manager_contacted" | "archived";
  statusLabel: string;
  region: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  availabilityNotes: string;
  licenceType: string;
  hasTransport: boolean;
  managerNotes: string;
};

export default function InductionsPage() {
  const [scope, setScope] = useState("National");
  const [feed, setFeed] = useState<InductionFeed>(staffInductionsSheet);
  const [sourceConfig, setSourceConfig] = useState<SheetSourceConfig>(sheetSourceDefaults.inductions);
  const [feedStatus, setFeedStatus] = useState("Source loading");
  const [workerSubmissions, setWorkerSubmissions] = useState<WorkerInductionSubmission[]>([]);
  const [workerMessage, setWorkerMessage] = useState("");
  const [busyWorkerId, setBusyWorkerId] = useState<string | null>(null);
  const sheetRegion = sourceConfig.region;
  const isMappedScope = scope === sheetRegion;
  const visibleSites = useMemo(() => isMappedScope ? feed.sites.filter((site) => site.region === sheetRegion) : [], [feed.sites, isMappedScope, sheetRegion]);
  const inductionCells = visibleSites.length * feed.staff.length;
  const inductedCount = feed.staff.reduce((total, staff) => total + visibleSites.filter((site) => getInduction(feed, staff.name, site.name).status === "Inducted").length, 0);
  const actionCount = feed.staff.reduce((total, staff) => total + visibleSites.filter((site) => {
    const status = getInduction(feed, staff.name, site.name).status;
    return status === "Expired" || status === "Expiring Soon" || status === "Expiring This Month";
  }).length, 0);
  const notInductedCount = feed.staff.reduce((total, staff) => total + visibleSites.filter((site) => getInduction(feed, staff.name, site.name).status === "Not Inducted").length, 0);
  const readiness = inductionCells ? Math.round((inductedCount / inductionCells) * 100) : 0;
  const liveRefreshMs = 15000;

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
    let isActive = true;
    function syncSourceSettings() {
      tocFetch("/api/sheet-source-settings?slug=inductions", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Source settings unavailable")))
        .then((payload) => {
          if (!isActive) return;
          setSourceConfig((payload.config || sheetSourceDefaults.inductions) as SheetSourceConfig);
        })
        .catch(() => {
          if (!isActive) return;
          setSourceConfig(sheetSourceDefaults.inductions);
        });
    }

    syncSourceSettings();
    window.addEventListener("toc.sheetSourceSettings.updated", syncSourceSettings);
    return () => {
      isActive = false;
      window.removeEventListener("toc.sheetSourceSettings.updated", syncSourceSettings);
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    let refreshInterval: number | null = null;

    function syncInductionFeed() {
      if (!isMappedScope || !sourceConfig.connected) {
        setFeed(staffInductionsSheet);
        setFeedStatus(`${sheetRegion} source only`);
        return;
      }

      tocFetch(`/api/inductions?scope=${encodeURIComponent(scope)}&refresh=${Date.now()}`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Feed unavailable")))
        .then((nextFeed: InductionFeed) => {
          if (!isActive) return;
          setFeed(nextFeed);
          setFeedStatus(nextFeed.lastRead ? `Source connected. Last read ${nextFeed.lastRead}` : "Source connected");
        })
        .catch(() => {
          if (!isActive) return;
          setFeed(staffInductionsSheet);
          setFeedStatus("Using last confirmed sheet read");
        });
    }

    syncInductionFeed();
    if (isMappedScope && sourceConfig.connected) {
      refreshInterval = window.setInterval(syncInductionFeed, liveRefreshMs);
      window.addEventListener("toc.manualRefresh", syncInductionFeed);
      window.addEventListener("toc.sheetSourceSettings.updated", syncInductionFeed);
    }

    return () => {
      isActive = false;
      if (refreshInterval) window.clearInterval(refreshInterval);
      window.removeEventListener("toc.manualRefresh", syncInductionFeed);
      window.removeEventListener("toc.sheetSourceSettings.updated", syncInductionFeed);
    };
  }, [isMappedScope, scope, sheetRegion, sourceConfig.connected, sourceConfig.spreadsheetUrl]);

  useEffect(() => {
    let isActive = true;

    function syncWorkerSubmissions() {
      tocFetch(`/api/worker-inductions?scope=${encodeURIComponent(scope)}`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Worker induction queue unavailable")))
        .then((payload) => {
          if (!isActive) return;
          setWorkerSubmissions((payload.submissions || []) as WorkerInductionSubmission[]);
        })
        .catch(() => {
          if (!isActive) return;
          setWorkerSubmissions([]);
        });
    }

    syncWorkerSubmissions();
    const refreshInterval = window.setInterval(syncWorkerSubmissions, 30000);
    window.addEventListener("toc.workerInductions.updated", syncWorkerSubmissions);
    return () => {
      isActive = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener("toc.workerInductions.updated", syncWorkerSubmissions);
    };
  }, [scope]);

  async function updateWorkerSubmission(id: string, status: WorkerInductionSubmission["status"], message: string) {
    setBusyWorkerId(id);
    setWorkerMessage("");
    try {
      const response = await tocFetch("/api/worker-inductions", {
        method: "PATCH",
        body: JSON.stringify({ id, status })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Worker induction could not be updated.");

      setWorkerSubmissions((items) => status === "archived" ? items.filter((item) => item.id !== id) : items.map((item) => item.id === id ? { ...item, status, statusLabel: status === "documents_issued" ? "Documents issued" : "Manager contacted" } : item));
      setWorkerMessage(message);
      window.dispatchEvent(new Event("toc.workerInductions.updated"));
    } catch (error) {
      setWorkerMessage(error instanceof Error ? error.message : "Worker induction could not be updated.");
    } finally {
      setBusyWorkerId(null);
    }
  }

  return (
    <TocShell>
      <PageIntro title="Inductions" detail="Staff induction status by site, filtered to the signed-in region." />
      <FlowHeading eyebrow="Inductions" title="Confirm the right staff are inducted for the right customer sites before work is assigned." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Company induction alerts" title="New workers ready for onboarding documents" pill={workerSubmissions.length ? `${workerSubmissions.length} open` : "Clear"}>
          <div className="staff-source-strip">
            <div>
              <span className="eyebrow">Prospective worker link</span>
              <strong>/worker-induction</strong>
              <small>Completed company inductions appear here for the relevant regional manager.</small>
            </div>
            <a href="/worker-induction" target="_blank" rel="noreferrer">Open induction link</a>
          </div>
          {workerMessage ? <div className="admin-hint-message">{workerMessage}</div> : null}
          <div className="worker-induction-alert-list">
            {workerSubmissions.map((worker) => (
              <article className="worker-induction-alert" key={worker.id}>
                <div>
                  <div className="worker-induction-alert-head">
                    <strong>{worker.name}</strong>
                    <Tag tone={worker.status === "ready_for_documents" ? "amber" : "blue"}>{worker.statusLabel}</Tag>
                    <Tag tone="blue">{worker.region}</Tag>
                  </div>
                  <small>Completed {new Date(worker.completedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</small>
                  <p>{worker.email} | {worker.phone}</p>
                  <p>{worker.address || "Address not supplied"}</p>
                  <p>{worker.licenceType || "Licence not supplied"} | {worker.hasTransport ? "Has transport" : "Transport not confirmed"}</p>
                  {worker.availabilityNotes ? <p>{worker.availabilityNotes}</p> : null}
                </div>
                <div className="worker-induction-alert-actions">
                  <button type="button" disabled={busyWorkerId === worker.id || worker.status === "documents_issued"} onClick={() => void updateWorkerSubmission(worker.id, "documents_issued", "Worker marked as documents issued.")}>Documents issued</button>
                  <button type="button" disabled={busyWorkerId === worker.id || worker.status === "manager_contacted"} onClick={() => void updateWorkerSubmission(worker.id, "manager_contacted", "Worker marked as manager contacted.")}>Manager contacted</button>
                  <button type="button" disabled={busyWorkerId === worker.id} onClick={() => void updateWorkerSubmission(worker.id, "archived", "Worker induction alert archived.")}>Archive</button>
                </div>
              </article>
            ))}
            {workerSubmissions.length ? null : <div className="empty-state">No completed company inductions are waiting for manager action in {scope}.</div>}
          </div>
        </Panel>
        {!isMappedScope ? (
          <Panel wide eyebrow="Region source" title={`${scope} induction source required`} pill={`${sheetRegion} only`}>
            <div className="empty-state">The current Google Sheet induction register is mapped to {sheetRegion}. Select {sheetRegion} to view this sheet, or assign a separate induction source for {scope} in Admin Settings.</div>
          </Panel>
        ) : null}
        {isMappedScope ? (
        <Panel wide eyebrow="Induction source" title={`${scope} induction register`} pill={`${visibleSites.length} sites`}>
          <div className="staff-source-strip">
            <div>
              <span className="eyebrow">{sourceConfig.statusLabel}</span>
              <strong>{sourceConfig.sourceName || feed.sourceName}</strong>
              <small>{feedStatus}. Source data has not been edited by TOC.</small>
            </div>
            <a href={sourceConfig.spreadsheetUrl || feed.spreadsheetUrl} target="_blank" rel="noreferrer">Open source sheet</a>
          </div>
          <div className="induction-summary-grid">
            <article className="availability-summary-card"><span>Readiness</span><strong>{readiness}%</strong><small>{inductedCount} current induction records</small></article>
            <article className="availability-summary-card"><span>Action</span><strong>{actionCount}</strong><small>Expired or expiring items</small></article>
            <article className="availability-summary-card"><span>Not inducted</span><strong>{notInductedCount}</strong><small>Site gaps to watch</small></article>
          </div>
          {visibleSites.length ? (
            <div className="induction-board">
              <table className="induction-table">
                <thead>
                  <tr>
                    <th className="induction-staff-column">Staff name</th>
                    {visibleSites.map((site) => <th key={site.name}>{site.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {feed.staff.map((staff) => (
                    <tr key={staff.name}>
                      <th className="induction-staff-column" scope="row">{staff.name}</th>
                      {visibleSites.map((site) => {
                        const induction = getInduction(feed, staff.name, site.name);
                        return (
                          <td key={`${staff.name}-${site.name}`}>
                            <div className={`induction-cell ${getInductionTone(induction.status)}`}>
                              <strong>{induction.status || "Not supplied"}</strong>
                              {induction.expiry ? <small>Exp {induction.expiry}</small> : <small>No expiry</small>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">No induction sheet sites are mapped to {scope} yet.</div>
          )}
        </Panel>
        ) : null}
      </section>
    </TocShell>
  );
}
