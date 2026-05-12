"use client";

import { useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { staffAvailabilitySheet } from "@/lib/toc-data";
import type { StaffAvailabilityFeed, StaffSheetStatus } from "@/lib/toc-data";
import { sheetSourceDefaults } from "@/lib/sheet-source-settings";
import type { SheetSourceConfig } from "@/lib/sheet-source-settings";
import { tocFetch } from "@/lib/toc-client-auth";

type RosterGap = {
  id: string;
  title: string;
  region: string;
  severity: string;
  dueAt: string;
  reason: string;
  staffSuggestionNames?: string[];
  alreadyActioned?: boolean;
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

function getStatusTone(status: StaffSheetStatus) {
  if (status === "Available") return "green";
  if (status === "Not Available") return "red";
  return "amber";
}

function getDaySummary(feed: StaffAvailabilityFeed, dayIndex: number) {
  const available = feed.staff.reduce((total, staff) => total + staff.availability[dayIndex].filter((status) => status === "Available").length, 0);
  const total = feed.staff.length * feed.windows.length;
  if (!total) return { available: 0, total: 0, percentage: 0 };
  return { available, total, percentage: Math.round((available / total) * 100) };
}

function getStaffTotal(staff: StaffAvailabilityFeed["staff"][number]) {
  return staff.availability.flat().filter((status) => status === "Available").length;
}

function emptyAvailabilityFeed(scope: string): StaffAvailabilityFeed {
  return {
    ...staffAvailabilitySheet,
    sourceName: `${scope} availability source required`,
    spreadsheetUrl: "",
    lastRead: "Source required",
    staff: []
  };
}

export default function StaffAvailabilityPage() {
  const [scope, setScope] = useState("National");
  const [feed, setFeed] = useState<StaffAvailabilityFeed>(() => emptyAvailabilityFeed("National"));
  const [sourceConfig, setSourceConfig] = useState<SheetSourceConfig>(sheetSourceDefaults["staff-availability"]);
  const [feedStatus, setFeedStatus] = useState("Source loading");
  const [rosterGaps, setRosterGaps] = useState<RosterGap[]>([]);
  const [rosterGapStatus, setRosterGapStatus] = useState("Odin roster scan loading");
  const sheetRegion = sourceConfig.region;
  const isMappedScope = scope === sheetRegion;
  const hasConnectedSource = (sourceConfig.connected && Boolean(sourceConfig.spreadsheetUrl)) || Boolean(feed.spreadsheetUrl);
  const hasAvailabilityRows = feed.staff.length > 0;
  const daySummaries = feed.days.map((day, index) => ({ day, ...getDaySummary(feed, index) }));
  const scopedRosterGaps = rosterGaps.filter((gap) => scope === "National" || gap.region === scope);
  const redRosterGaps = scopedRosterGaps.filter((gap) => gap.severity === "red").length;
  const actionedRosterGaps = scopedRosterGaps.filter((gap) => gap.alreadyActioned).length;
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
      tocFetch(`/api/sheet-source-settings?slug=staff-availability&region=${encodeURIComponent(scope)}`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Source settings unavailable")))
        .then((payload) => {
          if (!isActive) return;
          setSourceConfig((payload.config || sheetSourceDefaults["staff-availability"]) as SheetSourceConfig);
        })
        .catch(() => {
          if (!isActive) return;
          setSourceConfig(sheetSourceDefaults["staff-availability"]);
        });
    }

    syncSourceSettings();
    window.addEventListener("toc.sheetSourceSettings.updated", syncSourceSettings);
    return () => {
      isActive = false;
      window.removeEventListener("toc.sheetSourceSettings.updated", syncSourceSettings);
    };
  }, [scope]);

  useEffect(() => {
    let isActive = true;
    let refreshInterval: number | null = null;

    function syncAvailabilityFeed() {
      tocFetch(`/api/staff-availability?scope=${encodeURIComponent(scope)}&refresh=${Date.now()}`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Feed unavailable")))
        .then((nextFeed: StaffAvailabilityFeed) => {
          if (!isActive) return;
          setFeed(nextFeed);
          if (nextFeed.staff?.length) {
            setFeedStatus(nextFeed.lastRead ? `Source connected. Last read ${nextFeed.lastRead}` : "Source connected");
          } else {
            setFeedStatus(hasConnectedSource ? `${sheetRegion} source unavailable or empty` : "Source required");
          }
        })
        .catch(() => {
          if (!isActive) return;
          setFeed(emptyAvailabilityFeed(scope));
          setFeedStatus("Source unavailable");
        });
    }

    syncAvailabilityFeed();
    if (hasConnectedSource || hasAvailabilityRows) {
      refreshInterval = window.setInterval(syncAvailabilityFeed, liveRefreshMs);
      window.addEventListener("toc.manualRefresh", syncAvailabilityFeed);
      window.addEventListener("toc.sheetSourceSettings.updated", syncAvailabilityFeed);
    }

    return () => {
      isActive = false;
      if (refreshInterval) window.clearInterval(refreshInterval);
      window.removeEventListener("toc.manualRefresh", syncAvailabilityFeed);
      window.removeEventListener("toc.sheetSourceSettings.updated", syncAvailabilityFeed);
    };
  }, [hasAvailabilityRows, hasConnectedSource, scope, sheetRegion, sourceConfig.connected, sourceConfig.spreadsheetUrl]);

  useEffect(() => {
    let isActive = true;
    function syncRosterGaps() {
      tocFetch("/api/odin/roster-gaps", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Roster scan unavailable")))
        .then((payload) => {
          if (!isActive) return;
          setRosterGaps(payload.gaps || []);
          setRosterGapStatus(payload.gapCount ? `${payload.gapCount} roster gap${payload.gapCount === 1 ? "" : "s"} detected` : "No roster gaps detected");
        })
        .catch(() => {
          if (!isActive) return;
          setRosterGaps([]);
          setRosterGapStatus("Odin roster scan unavailable");
        });
    }

    syncRosterGaps();
    const refreshInterval = window.setInterval(syncRosterGaps, 60000);
    window.addEventListener("toc.actionState.updated", syncRosterGaps);
    return () => {
      isActive = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener("toc.actionState.updated", syncRosterGaps);
    };
  }, []);

  return (
    <TocShell>
      <PageIntro title="Staff Availability" detail="Staff coverage by day and time window." />
      <FlowHeading eyebrow="Staff Availability" title="Read the coverage by staff name, day and shift window before roster gaps become urgent." />
      <section className="command-grid route-grid">
        {!hasAvailabilityRows ? (
          <Panel wide eyebrow="Region source" title={`${scope} availability source required`} pill={hasConnectedSource ? `${sheetRegion} only` : "Not connected"}>
            <div className="empty-state">
              {hasConnectedSource
                ? isMappedScope
                  ? `The ${scope} Google Sheet availability source is connected, but no availability rows were returned yet. Press refresh or check that the sheet has staff names in the first column.`
                  : `The current Google Sheet availability source is mapped to ${sheetRegion}. Select ${sheetRegion} to view this sheet, or assign a separate source for ${scope} in Admin Settings.`
                : `No Google Sheet availability source is connected for ${scope}. Link this region's availability sheet in the Operations Setup Wizard or Admin Settings.`}
            </div>
          </Panel>
        ) : null}
        {hasAvailabilityRows ? (
        <>
        <Panel wide eyebrow="Odin roster risk" title="Staffing risks detected from schedule, availability and inductions" pill={scopedRosterGaps.length ? `${scopedRosterGaps.length} open` : "Clear"}>
          <div className={`staff-risk-strip ${redRosterGaps ? "red" : scopedRosterGaps.length ? "amber" : "clear"}`}>
            <div>
              <strong>{scopedRosterGaps.length ? `${scopedRosterGaps.length} roster risk${scopedRosterGaps.length === 1 ? "" : "s"} visible` : "No roster risks visible"}</strong>
              <small>{rosterGapStatus}. {actionedRosterGaps ? `${actionedRosterGaps} already linked to Action Centre. ` : ""}Red gaps should be actioned before the job proceeds.</small>
            </div>
            {scopedRosterGaps.length ? (
              <div className="staff-risk-list">
                {scopedRosterGaps.slice(0, 3).map((gap) => (
                  <span key={gap.id}>
                    <strong>{gap.title}</strong>
                    <small>{gap.reason}</small>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </Panel>
        <Panel wide eyebrow="Availability source" title="Staff coverage by day and time window" pill={`${feed.staff.length} staff listed`}>
          <div className="staff-source-strip">
            <div>
              <span className="eyebrow">{sourceConfig.statusLabel}</span>
              <strong>{sourceConfig.sourceName || feed.sourceName}</strong>
              <small>{feedStatus}. Source data has not been edited by TOC. TOC applies a hard-coded 2 hour early-start buffer to roster matching.</small>
            </div>
            <a href={sourceConfig.spreadsheetUrl || feed.spreadsheetUrl} target="_blank" rel="noreferrer">Open source sheet</a>
          </div>

          <div className="staff-availability-board">
            <div className="availability-buffer-note">
              <strong>Availability heat map</strong>
              <span>Green means available in the linked Google Sheet. Odin treats each available window as starting 2 hours earlier for roster checks, e.g. 6pm availability can cover from 4pm.</span>
            </div>
            <div className="availability-summary-grid" aria-label="Daily availability summary">
              <span className="availability-summary-spacer" aria-hidden="true" />
              {daySummaries.map((summary) => (
                <article className="availability-summary-card" key={summary.day}>
                  <span>{summary.day}</span>
                  <strong>{summary.percentage}%</strong>
                  <small>{summary.available} of {summary.total} windows available</small>
                </article>
              ))}
              <span className="availability-summary-spacer" aria-hidden="true" />
            </div>
            <div className="staff-availability-row header">
              <span>Staff name</span>
              {feed.days.map((day) => <strong key={day}>{day}</strong>)}
              <span>Available</span>
            </div>
            <div className="staff-availability-row time-header" aria-label="Availability time windows">
              <span>Time blocks</span>
              {feed.days.map((day) => (
                <div className="availability-day-cell time-labels" key={`${day}-windows`}>
                  {feed.windows.map((windowName) => <small key={`${day}-${windowName}`}>{windowName}</small>)}
                </div>
              ))}
              <span>Total</span>
            </div>
            {feed.staff.map((staff) => (
              <div className="staff-availability-row" key={staff.name}>
                <span className="staff-name"><strong>{staff.name}</strong></span>
                {staff.availability.map((dayStatuses, dayIndex) => (
                  <div className="availability-day-cell" key={`${staff.name}-${feed.days[dayIndex]}`}>
                    {dayStatuses.map((status, windowIndex) => (
                      <i
                        className={`availability-window ${getStatusTone(status)}`}
                        title={`${feed.windows[windowIndex]}: ${status || "Limited / not supplied"}`}
                        aria-label={`${feed.days[dayIndex]} ${feed.windows[windowIndex]} ${status || "Limited / not supplied"}`}
                        key={`${staff.name}-${dayIndex}-${windowIndex}`}
                      />
                    ))}
                  </div>
                ))}
                <span className="staff-total">{getStaffTotal(staff)}/{feed.days.length * feed.windows.length}</span>
              </div>
            ))}
          </div>
        </Panel>
        </>
        ) : null}
      </section>
    </TocShell>
  );
}
