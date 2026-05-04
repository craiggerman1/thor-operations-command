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
  const [feedStatus, setFeedStatus] = useState("Source loading");
  const daySummaries = feed.days.map((day, index) => ({ day, ...getDaySummary(feed, index) }));

  useEffect(() => {
    let isActive = true;

    fetch("/api/staff-availability", { cache: "no-store" })
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
  }, []);

  return (
    <TocShell>
      <PageIntro title="Staff Availability" detail="Staff coverage by day and time window." />
      <FlowHeading eyebrow="Staff Availability" title="Read the coverage by staff name, day and shift window before roster gaps become urgent." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Availability source" title="Staff coverage by day and time window" pill={`${feed.staff.length} staff listed`}>
          <div className="staff-source-strip">
            <div>
              <span className="eyebrow">Controlled source</span>
              <strong>{feed.sourceName}</strong>
              <small>{feedStatus}. Source data has not been edited by TOC.</small>
            </div>
            <a href={feed.spreadsheetUrl} target="_blank" rel="noreferrer">Open source sheet</a>
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
      </section>
    </TocShell>
  );
}
