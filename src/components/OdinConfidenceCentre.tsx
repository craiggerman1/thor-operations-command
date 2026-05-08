"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";

type Severity = "red" | "amber" | "blue";
type IssueCategory = "ownership" | "lifecycle" | "routing" | "source" | "duplicate" | "staff" | "roster";

type ConfidenceIssue = {
  id: string;
  title: string;
  detail: string;
  category: IssueCategory;
  severity: Severity;
  page: string;
  href: string;
  recommendedAction: string;
};

type ConfidencePayload = {
  connected: boolean;
  generatedAt: string;
  confidenceScore: number;
  summary: {
    issueCount: number;
    severityCounts: Record<Severity, number>;
    categoryCounts: Partial<Record<IssueCategory, number>>;
    openActions: number;
    blockedActions: number;
    inProgressActions: number;
    submittedForReviewActions: number;
    acknowledgedActions: number;
    activeCompliance: number;
    activeEquipment: number;
    activeStockOrders: number;
    activeStockCatalogItems: number;
    calendarJobsLoaded: number;
    staffLoaded: number;
    rosterGapCount: number;
  };
  sections: {
    critical: ConfidenceIssue[];
    dataMapping: ConfidenceIssue[];
    sourceHealth: ConfidenceIssue[];
    lifecycle: ConfidenceIssue[];
  };
  issues: ConfidenceIssue[];
};

const severityLabels: Record<Severity, string> = {
  red: "Red",
  amber: "Amber",
  blue: "Blue"
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function scoreTone(score: number): Severity | "green" {
  if (score < 70) return "red";
  if (score < 86) return "amber";
  return "green";
}

function issueTone(issue: ConfidenceIssue) {
  return issue.severity === "red" ? "red" : issue.severity === "amber" ? "amber" : "blue";
}

function categoryLabel(category: IssueCategory) {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function IssueCard({ issue }: { issue: ConfidenceIssue }) {
  return (
    <article className={`odin-confidence-issue ${issue.severity}`}>
      <div className="odin-confidence-issue-head">
        <div>
          <strong>{issue.title}</strong>
          <small>{issue.page} | {categoryLabel(issue.category)}</small>
        </div>
        <div className="meta-row">
          <Tag tone={issueTone(issue)}>{severityLabels[issue.severity]}</Tag>
          <Link className="node-action subtle-action" href={issue.href}>Open</Link>
        </div>
      </div>
      <p>{issue.detail}</p>
      <small>{issue.recommendedAction}</small>
    </article>
  );
}

function SectionList({ title, detail, issues }: { title: string; detail: string; issues: ConfidenceIssue[] }) {
  return (
    <section className="odin-confidence-section">
      <div className="odin-confidence-section-head">
        <div>
          <strong>{title}</strong>
          <small>{detail}</small>
        </div>
        <Tag tone={issues.some((item) => item.severity === "red") ? "red" : issues.length ? "amber" : "green"}>{issues.length}</Tag>
      </div>
      <div className="odin-confidence-mini-list">
        {issues.slice(0, 5).map((item) => (
          <div key={item.id}>
            <span>{item.title}</span>
            <small>{item.page}</small>
          </div>
        ))}
        {!issues.length ? <small>No issues detected in this group.</small> : null}
      </div>
    </section>
  );
}

export function OdinConfidenceCentre() {
  const [payload, setPayload] = useState<ConfidencePayload | null>(null);
  const [status, setStatus] = useState("Loading Odin confidence...");
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<Severity | "all">("all");

  const filteredIssues = useMemo(() => {
    const issues = payload?.issues || [];
    return filter === "all" ? issues : issues.filter((issue) => issue.severity === filter);
  }, [payload, filter]);

  async function loadConfidence() {
    setIsLoading(true);
    setStatus("Refreshing Odin confidence...");
    try {
      const response = await tocFetch("/api/odin/confidence", { cache: "no-store" });
      const nextPayload = await response.json();
      if (!response.ok || nextPayload.connected === false) throw new Error(nextPayload.error || "Odin confidence could not be loaded.");
      setPayload(nextPayload as ConfidencePayload);
      setStatus(`Confidence checked at ${formatDate(nextPayload.generatedAt)}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Odin confidence could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadConfidence();
  }, []);

  const score = payload?.confidenceScore ?? 0;
  const counts = payload?.summary.severityCounts || { red: 0, amber: 0, blue: 0 };

  return (
    <div className="odin-confidence-console">
      <div className="odin-confidence-toolbar">
        <div>
          <strong>Odin data confidence</strong>
          <small>Checks whether TOC data is clean enough for Odin to automate from without creating noise.</small>
        </div>
        <button type="button" onClick={loadConfidence} disabled={isLoading}>{isLoading ? "Refreshing..." : "Refresh Confidence"}</button>
      </div>

      <div className="odin-confidence-score-row">
        <article className={`odin-confidence-score ${scoreTone(score)}`}>
          <span>Confidence score</span>
          <strong>{payload ? score : "--"}</strong>
          <small>{payload ? `${payload.summary.issueCount} data quality items found` : status}</small>
        </article>
        <article>
          <span>Red</span>
          <strong>{counts.red}</strong>
          <small>Needs urgent cleanup</small>
        </article>
        <article>
          <span>Amber</span>
          <strong>{counts.amber}</strong>
          <small>Weakens automation</small>
        </article>
        <article>
          <span>Blue</span>
          <strong>{counts.blue}</strong>
          <small>Low-risk refinement</small>
        </article>
      </div>

      {payload ? (
        <>
          <div className="odin-confidence-metrics">
            <article><span>Open actions</span><strong>{payload.summary.openActions}</strong></article>
            <article><span>Blocked</span><strong>{payload.summary.blockedActions}</strong></article>
            <article><span>In progress</span><strong>{payload.summary.inProgressActions}</strong></article>
            <article><span>Awaiting review</span><strong>{payload.summary.submittedForReviewActions}</strong></article>
            <article><span>Acknowledged</span><strong>{payload.summary.acknowledgedActions}</strong></article>
            <article><span>Compliance</span><strong>{payload.summary.activeCompliance}</strong></article>
            <article><span>Equipment</span><strong>{payload.summary.activeEquipment}</strong></article>
            <article><span>Stock orders</span><strong>{payload.summary.activeStockOrders}</strong></article>
            <article><span>Catalogue</span><strong>{payload.summary.activeStockCatalogItems}</strong></article>
            <article><span>Jobs loaded</span><strong>{payload.summary.calendarJobsLoaded}</strong></article>
            <article><span>Staff loaded</span><strong>{payload.summary.staffLoaded}</strong></article>
            <article><span>Roster gaps</span><strong>{payload.summary.rosterGapCount}</strong></article>
          </div>

          <div className="odin-confidence-sections">
            <SectionList title="Critical trust gaps" detail="Issues likely to break closure, routing or escalation." issues={payload.sections.critical} />
            <SectionList title="Mapping and dedupe" detail="Owner, link and duplicate issues Odin needs cleaned." issues={payload.sections.dataMapping} />
            <SectionList title="Source health" detail="Staff, roster and source feed health." issues={payload.sections.sourceHealth} />
            <SectionList title="Lifecycle discipline" detail="Overdue, stale or under-specified open work." issues={payload.sections.lifecycle} />
          </div>

          <div className="odin-confidence-filter">
            <div>
              <strong>Issue register</strong>
              <small>{status}</small>
            </div>
            <div className="meta-row">
              {(["all", "red", "amber", "blue"] as const).map((item) => (
                <button className={filter === item ? "active" : ""} type="button" key={item} onClick={() => setFilter(item)}>
                  {item === "all" ? "All" : severityLabels[item]}
                </button>
              ))}
            </div>
          </div>

          <div className="odin-confidence-list">
            {filteredIssues.map((item) => <IssueCard issue={item} key={item.id} />)}
            {!filteredIssues.length ? <div className="empty-state">No confidence issues found for this filter.</div> : null}
          </div>
        </>
      ) : (
        <div className="empty-state">{status}</div>
      )}
    </div>
  );
}
