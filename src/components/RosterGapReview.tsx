"use client";

import { useEffect, useState } from "react";
import { tocFetch } from "@/lib/toc-client-auth";
import { Tag } from "@/components/TocCards";

type StaffSuggestion = {
  id: string;
  name: string;
  score: number;
  role: string;
  availability: string;
  induction: string;
  reasons: string[];
  cautions: string[];
};

type RosterGap = {
  id: string;
  title: string;
  region: string;
  severity: "red" | "amber" | "blue" | string;
  dueAt: string;
  reason: string;
  recommendedAction: string;
  requiredCrew?: number;
  assignedCrewCount?: number;
  staffSuggestions?: StaffSuggestion[];
  staffSuggestionNames?: string[];
};

type RosterGapPayload = {
  connected: boolean;
  gapCount: number;
  gaps: RosterGap[];
  errors?: string[];
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "No due time";
  return date.toLocaleString("en-AU", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function toneForSeverity(severity: string) {
  if (severity === "red") return "red";
  if (severity === "amber") return "amber";
  return "blue";
}

export function RosterGapReview() {
  const [gaps, setGaps] = useState<RosterGap[]>([]);
  const [status, setStatus] = useState("Loading roster gaps...");
  const [isLoading, setIsLoading] = useState(false);
  const [activeGapId, setActiveGapId] = useState<string | null>(null);

  async function loadRosterGaps() {
    setIsLoading(true);
    setStatus("Loading roster gaps...");
    try {
      const response = await tocFetch("/api/odin/roster-gaps", { cache: "no-store" });
      const payload = await response.json() as RosterGapPayload;
      if (!response.ok || payload.connected === false) throw new Error(payload.errors?.join("; ") || "Roster gap detection unavailable.");
      setGaps(payload.gaps || []);
      setStatus(payload.gapCount ? `${payload.gapCount} roster gap${payload.gapCount === 1 ? "" : "s"} detected.` : "No roster gaps detected.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Roster gaps could not be loaded.");
      setGaps([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function createManagerAction(gap: RosterGap) {
    setActiveGapId(gap.id);
    setStatus(`Creating manager action for ${gap.region}...`);
    try {
      const response = await tocFetch("/api/odin/roster-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", gapId: gap.id })
      });
      const payload = await response.json();
      if (!response.ok || payload.connected === false) throw new Error(payload.error || "Manager action could not be created.");
      setStatus("Roster gap action created and sent to Action Centre.");
      window.dispatchEvent(new Event("toc.actionState.updated"));
      await loadRosterGaps();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Roster gap action could not be created.");
    } finally {
      setActiveGapId(null);
    }
  }

  useEffect(() => {
    void loadRosterGaps();
  }, []);

  return (
    <div className="roster-gap-console">
      <div className="admin-audit-toolbar">
        <div>
          <strong>Odin roster risk scan</strong>
          <small>Detected from calendar jobs, staff availability, induction status and region ownership.</small>
        </div>
        <button type="button" onClick={loadRosterGaps} disabled={isLoading}>{isLoading ? "Refreshing..." : "Refresh Roster Gaps"}</button>
      </div>
      <div className="roster-gap-list">
        {gaps.map((gap) => (
          <article className={`roster-gap-card ${toneForSeverity(gap.severity)}`} key={gap.id}>
            <div className="roster-gap-head">
              <div>
                <strong>{gap.title}</strong>
                <small>{gap.region} - Due {formatDateTime(gap.dueAt)}</small>
              </div>
              <div className="meta-row">
                <Tag tone={toneForSeverity(gap.severity)}>{gap.severity}</Tag>
                {typeof gap.requiredCrew === "number" ? <Tag>{gap.assignedCrewCount || 0}/{gap.requiredCrew} crew</Tag> : null}
              </div>
            </div>
            <p>{gap.reason}</p>
            <small>{gap.recommendedAction}</small>
            {gap.staffSuggestions?.length ? (
              <div className="roster-suggestion-strip">
                {gap.staffSuggestions.slice(0, 3).map((suggestion) => (
                  <span key={suggestion.id}>
                    <strong>{suggestion.name}</strong>
                    <small>{suggestion.score}/100 - {suggestion.reasons.slice(0, 2).join(", ") || "review suitability"}</small>
                  </span>
                ))}
              </div>
            ) : null}
            <button type="button" onClick={() => createManagerAction(gap)} disabled={activeGapId === gap.id || isLoading}>
              {activeGapId === gap.id ? "Creating..." : "Create Manager Action"}
            </button>
          </article>
        ))}
        {!gaps.length ? <div className="empty-state">{status}</div> : null}
      </div>
      {gaps.length ? <small className="admin-hint-message">{status}</small> : null}
    </div>
  );
}
