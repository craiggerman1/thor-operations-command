"use client";

import { useEffect, useMemo, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { staffInductionsSheet } from "@/lib/toc-data";
import type { InductionFeed, InductionStatus } from "@/lib/toc-data";

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

export default function InductionsPage() {
  const [scope, setScope] = useState("National");
  const [feed, setFeed] = useState<InductionFeed>(staffInductionsSheet);
  const [feedStatus, setFeedStatus] = useState("Google Sheet read-only feed staging");
  const visibleSites = useMemo(() => feed.sites.filter((site) => scope === "National" || site.region === scope), [feed.sites, scope]);
  const inductionCells = visibleSites.length * feed.staff.length;
  const inductedCount = feed.staff.reduce((total, staff) => total + visibleSites.filter((site) => getInduction(feed, staff.name, site.name).status === "Inducted").length, 0);
  const actionCount = feed.staff.reduce((total, staff) => total + visibleSites.filter((site) => {
    const status = getInduction(feed, staff.name, site.name).status;
    return status === "Expired" || status === "Expiring Soon" || status === "Expiring This Month";
  }).length, 0);
  const notInductedCount = feed.staff.reduce((total, staff) => total + visibleSites.filter((site) => getInduction(feed, staff.name, site.name).status === "Not Inducted").length, 0);
  const readiness = inductionCells ? Math.round((inductedCount / inductionCells) * 100) : 0;

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

    fetch("/api/inductions", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Feed unavailable")))
      .then((nextFeed: InductionFeed) => {
        if (!isActive) return;
        setFeed(nextFeed);
        setFeedStatus("Google Sheet read-only feed connected");
      })
      .catch(() => {
        if (!isActive) return;
        setFeed(staffInductionsSheet);
        setFeedStatus("Using last confirmed sheet read");
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <TocShell>
      <PageIntro title="Inductions" detail="Staff induction status by site, filtered to the signed-in region." />
      <FlowHeading eyebrow="Inductions" title="Confirm the right staff are inducted for the right customer sites before work is assigned." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Google Sheets feed" title={`${scope} induction register`} pill={`${visibleSites.length} sites`}>
          <div className="staff-source-strip">
            <div>
              <span className="eyebrow">Read-only source</span>
              <strong>{feed.sourceName}</strong>
              <small>{feedStatus}. Google Sheet data has not been edited.</small>
            </div>
            <a href={feed.spreadsheetUrl} target="_blank" rel="noreferrer">Open source sheet</a>
          </div>
          <div className="induction-summary-grid">
            <article className="availability-summary-card"><span>Readiness</span><strong>{readiness}%</strong><small>{inductedCount} current induction records</small></article>
            <article className="availability-summary-card"><span>Action</span><strong>{actionCount}</strong><small>Expired or expiring items</small></article>
            <article className="availability-summary-card"><span>Not inducted</span><strong>{notInductedCount}</strong><small>Site gaps to watch</small></article>
          </div>
          {visibleSites.length ? (
            <div className="induction-board">
              <div className="induction-row header">
                <span>Staff name</span>
                {visibleSites.map((site) => <strong key={site.name}>{site.name}</strong>)}
              </div>
              {feed.staff.map((staff) => (
                <div className="induction-row" key={staff.name}>
                  <span className="staff-name"><strong>{staff.name}</strong></span>
                  {visibleSites.map((site) => {
                    const induction = getInduction(feed, staff.name, site.name);
                    return (
                      <div className={`induction-cell ${getInductionTone(induction.status)}`} key={`${staff.name}-${site.name}`}>
                        <strong>{induction.status || "Not supplied"}</strong>
                        {induction.expiry ? <small>Exp {induction.expiry}</small> : <small>No expiry</small>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">No induction sheet sites are mapped to {scope} yet.</div>
          )}
        </Panel>
        <Panel eyebrow="Visual key" title="Quick read">
          <div className="brief-stack">
            <div className="brief-item"><span className="brief-dot" /><div><strong>Green means inducted.</strong><small>The staff member is currently inducted for that site.</small></div></div>
            <div className="brief-item"><span className="brief-dot amber-dot" /><div><strong>Amber needs attention.</strong><small>The induction is expiring soon or this month.</small></div></div>
            <div className="brief-item"><span className="brief-dot red-dot" /><div><strong>Red needs action.</strong><small>The induction is expired and should be resolved before site work.</small></div></div>
          </div>
        </Panel>
        <Panel eyebrow="Scope" title="Region-specific induction control">
          <div className="brief-stack">
            <div className="brief-item"><span className="brief-dot" /><div><strong>Region filtering is active.</strong><small>National can see all mapped sites. Regional managers see the sites mapped to their region.</small></div></div>
            <div className="brief-item"><span className="brief-dot" /><div><strong>Read-only display.</strong><small>TOC consumes the sheet only and does not edit the Google Sheet.</small></div></div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
