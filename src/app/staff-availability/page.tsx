"use client";

import { useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { staffAvailabilitySheet } from "@/lib/toc-data";
import type { StaffAvailabilityFeed, StaffSheetStatus } from "@/lib/toc-data";
import { sheetSourceDefaults } from "@/lib/sheet-source-settings";
import type { SheetSourceConfig } from "@/lib/sheet-source-settings";

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

export default function StaffAvailabilityPage() {
  const [scope, setScope] = useState("National");
  const [feed, setFeed] = useState<StaffAvailabilityFeed>(staffAvailabilitySheet);
  const [sourceConfig, setSourceConfig] = useState<SheetSourceConfig>(sheetSourceDefaults["staff-availability"]);
  const [feedStatus, setFeedStatus] = useState("Source loading");
  const sheetRegion = sourceConfig.region;
  const isMappedScope = scope === sheetRegion;
  const daySummaries = feed.days.map((day, index) => ({ day, ...getDaySummary(feed, index) }));

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
      fetch("/api/sheet-source-settings?slug=staff-availability", { cache: "no-store" })
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
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!isMappedScope || !sourceConfig.connected) {
      setFeed(staffAvailabilitySheet);
      setFeedStatus(`${sheetRegion} source only`);
      return () => {
        isActive = false;
      };
    }

    fetch(`/api/staff-availability?scope=${encodeURIComponent(scope)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Feed unavailable")))
      .then((nextFeed: StaffAvailabilityFeed) => {
        if (!isActive) return;
        setFeed(nextFeed);
        setFeedStatus("Source connected");
      })
      .catch(() => {
        if (!isActive) return;
        setFeed(staffAvailabilitySheet);
        setFeedStatus("Using last confirmed sheet read");
      });

    return () => {
      isActive = false;
    };
  }, [isMappedScope, scope, sheetRegion, sourceConfig.connected]);

  return (
    <TocShell>
      <PageIntro title="Staff Availability" detail="Staff coverage by day and time window." />
      <FlowHeading eyebrow="Staff Availability" title="Read the coverage by staff name, day and shift window before roster gaps become urgent." />
      <section className="command-grid route-grid">
        {!isMappedScope ? (
          <Panel wide eyebrow="Region source" title={`${scope} availability source required`} pill={`${sheetRegion} only`}>
            <div className="empty-state">The current Google Sheet availability source is mapped to {sheetRegion}. Select {sheetRegion} to view this sheet, or assign a separate source for {scope} in Admin Settings.</div>
          </Panel>
        ) : null}
        {isMappedScope ? (
        <Panel wide eyebrow="Availability source" title="Staff coverage by day and time window" pill={`${feed.staff.length} staff listed`}>
          <div className="staff-source-strip">
            <div>
              <span className="eyebrow">{sourceConfig.statusLabel}</span>
              <strong>{sourceConfig.sourceName || feed.sourceName}</strong>
              <small>{feedStatus}. Source data has not been edited by TOC.</small>
            </div>
            <a href={sourceConfig.spreadsheetUrl || feed.spreadsheetUrl} target="_blank" rel="noreferrer">Open source sheet</a>
          </div>

          <div className="staff-availability-board">
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
        ) : null}
      </section>
    </TocShell>
  );
}
