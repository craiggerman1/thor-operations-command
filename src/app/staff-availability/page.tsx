"use client";

import { useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { staffAvailabilitySheet } from "@/lib/toc-data";
import type { StaffAvailabilityFeed, StaffSheetStatus } from "@/lib/toc-data";

function getStatusTone(status: StaffSheetStatus) {
  if (status === "Available") return "green";
  if (status === "Not Available") return "red";
  return "amber";
}

function getDaySummary(feed: StaffAvailabilityFeed, dayIndex: number) {
  const available = feed.staff.reduce((total, staff) => total + staff.availability[dayIndex].filter((status) => status === "Available").length, 0);
  const total = feed.staff.length * feed.windows.length;
  return { available, total, percentage: Math.round((available / total) * 100) };
}

function getStaffTotal(staff: StaffAvailabilityFeed["staff"][number]) {
  return staff.availability.flat().filter((status) => status === "Available").length;
}

export default function StaffAvailabilityPage() {
  const [feed, setFeed] = useState<StaffAvailabilityFeed>(staffAvailabilitySheet);
  const [feedStatus, setFeedStatus] = useState("Google Sheet read-only feed staging");
  const daySummaries = feed.days.map((day, index) => ({ day, ...getDaySummary(feed, index) }));

  useEffect(() => {
    let isActive = true;

    fetch("/api/staff-availability", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Feed unavailable")))
      .then((nextFeed: StaffAvailabilityFeed) => {
        if (!isActive) return;
        setFeed(nextFeed);
        setFeedStatus("Google Sheet read-only feed connected");
      })
      .catch(() => {
        if (!isActive) return;
        setFeed(staffAvailabilitySheet);
        setFeedStatus("Using last confirmed sheet read");
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <TocShell>
      <PageIntro title="Staff Availability" detail="Google Sheets availability view for staff coverage by day and time window." />
      <FlowHeading eyebrow="Staff Availability" title="Read the coverage by staff name, day and shift window before roster gaps become urgent." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Google Sheets feed" title="Staff coverage by day and time window" pill={`${feed.staff.length} staff listed`}>
          <div className="staff-source-strip">
            <div>
              <span className="eyebrow">Read-only source</span>
              <strong>{feed.sourceName}</strong>
              <small>{feedStatus}. Google Sheet data has not been edited.</small>
            </div>
            <a href={feed.spreadsheetUrl} target="_blank" rel="noreferrer">Open source sheet</a>
          </div>

          <div className="availability-summary-grid" aria-label="Daily availability summary">
            {daySummaries.map((summary) => (
              <article className="availability-summary-card" key={summary.day}>
                <span>{summary.day}</span>
                <strong>{summary.percentage}%</strong>
                <small>{summary.available} of {summary.total} windows available</small>
              </article>
            ))}
          </div>

          <div className="staff-availability-board">
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
        <Panel eyebrow="Visual key" title="Quick read">
          <div className="brief-stack">
            <div className="brief-item"><span className="brief-dot" /><div><strong>Green means available.</strong><small>The person has marked that time window as available.</small></div></div>
            <div className="brief-item"><span className="brief-dot amber-dot" /><div><strong>Amber means limited or not supplied.</strong><small>Use this when the sheet has no clear availability value.</small></div></div>
            <div className="brief-item"><span className="brief-dot red-dot" /><div><strong>Red means not available.</strong><small>Do not use that person for that window unless directly confirmed.</small></div></div>
          </div>
        </Panel>
        <Panel eyebrow="Data source" title="Google Sheets connection">
          <div className="brief-stack">
            <div className="brief-item"><span className="brief-dot" /><div><strong>Google Sheet remains the source.</strong><small>Staff update the shared sheet. TOC presents it as a manager-friendly coverage view.</small></div></div>
            <div className="brief-item"><span className="brief-dot" /><div><strong>Read-only display.</strong><small>This page is designed to consume the Google Sheet without editing the sheet data.</small></div></div>
            <div className="brief-item"><span className="brief-dot" /><div><strong>Live API connection next.</strong><small>The current build uses the sheet read captured for TOC. Database-backed live refresh can be connected in the next data stage.</small></div></div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
