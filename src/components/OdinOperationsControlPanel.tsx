"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";

type Severity = "red" | "amber" | "blue";

type SnapshotLink = {
  id: string;
  title: string;
  region: string;
  status?: string;
  severity: Severity;
  href?: string;
  dueAt?: string | null;
  staleHours?: number;
  escalationLevel?: "none" | "watch" | "national" | "craig";
  owner?: string;
  recommendedAction?: string;
};

type ManagerPressure = {
  owner?: string;
  region?: string;
  count?: number;
  total?: number;
  overdue?: number;
  stale?: number;
  carryover?: number;
  craig?: number;
};

type ManagerDigest = {
  owner: string;
  region: string;
  totalOpen: number;
  red: number;
  overdue: number;
  dueSoon: number;
  carryover: number;
  craigEscalation: number;
  escalationLevel: "none" | "watch" | "national" | "craig";
  recommendedAction: string;
  nextCheck: "now" | "today" | "next_brief";
  topItems: SnapshotLink[];
};

type CraigPolicyCandidate = SnapshotLink & {
  callCraig: boolean;
  messageCraig: boolean;
  nationalOnly: boolean;
  reason: string;
};

type OdinSnapshotPayload = {
  connected: boolean;
  generatedAt: string;
  summary: {
    totalOpenWork: number;
    overdueCount: number;
    dueSoonCount: number;
    redCount: number;
    rosterGapCount: number;
    openByEscalation: Record<string, number>;
    actionClosure: {
      openActionCount: number;
      overdueCount: number;
      stale24Count: number;
      stale48Count: number;
      carryoverCount: number;
      managerWorkload: ManagerPressure[];
      carryoverItems: SnapshotLink[];
      staleItems: SnapshotLink[];
    };
    managerFollowThrough: ManagerDigest[];
    craigEscalationPolicy: {
      purpose: string;
      callCandidates: CraigPolicyCandidate[];
      messageCandidates: CraigPolicyCandidate[];
      nationalOnlyCandidates: CraigPolicyCandidate[];
      suppressedCount: number;
    };
  };
  focusQueues: {
    redItems: SnapshotLink[];
    overdueItems: SnapshotLink[];
    dueSoonItems: SnapshotLink[];
    ownerQueue: SnapshotLink[];
    actionCarryover: SnapshotLink[];
    rosterGaps: SnapshotLink[];
    managerFollowThrough: ManagerDigest[];
    craigEscalationPolicy: OdinSnapshotPayload["summary"]["craigEscalationPolicy"];
  };
};

type WatcherStatusPayload = {
  connected: boolean;
  expectedWatcherVersion: string;
  status: "healthy" | "dry_run" | "version_mismatch" | "stale" | "not_seen" | "brief_seen_no_heartbeat";
  healthy: boolean;
  lastSeenAt: string | null;
  lastSeenMinutes: number | null;
  summary: string;
  facts: {
    watcherVersion?: string;
    dryRun?: boolean;
    minimumSeverity?: string;
    state?: string;
    snapshotOpenWork?: number;
    snapshotRedCount?: number;
    snapshotOverdueCount?: number;
  };
  checks: {
    heartbeatSeen: boolean;
    watcherBriefSeen?: boolean;
    recentBriefWithoutHeartbeat?: boolean;
    versionCurrent: boolean;
    dryRunDisabled: boolean;
    freshWithin90Minutes: boolean;
  };
};

function formatTime(value?: string) {
  if (!value) return "Not checked";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function dueLabel(value?: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Due date unclear";
  return `Due ${date.toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}`;
}

function metricTone(count: number, redAt = 1): Severity | "green" {
  if (count >= redAt) return "red";
  if (count > 0) return "amber";
  return "green";
}

function normaliseHref(item: SnapshotLink) {
  return item.href && item.href.startsWith("/") ? item.href : "/actions";
}

function PriorityRow({ item }: { item: SnapshotLink }) {
  return (
    <Link className={`odin-control-priority ${item.severity || "blue"}`} href={normaliseHref(item)}>
      <div>
        <strong>{item.title}</strong>
        <small>{item.region} | {item.owner || item.escalationLevel || "Owner pending"} | {dueLabel(item.dueAt)}</small>
      </div>
      <Tag tone={item.severity || "blue"}>{item.status || item.escalationLevel || "open"}</Tag>
    </Link>
  );
}

export function OdinOperationsControlPanel() {
  const [payload, setPayload] = useState<OdinSnapshotPayload | null>(null);
  const [watcherStatus, setWatcherStatus] = useState<WatcherStatusPayload | null>(null);
  const [status, setStatus] = useState("Loading Odin control snapshot...");
  const [isLoading, setIsLoading] = useState(false);

  async function loadSnapshot() {
    setIsLoading(true);
    try {
      const [response, watcherResponse] = await Promise.all([
        tocFetch("/api/odin/snapshot", { cache: "no-store" }),
        tocFetch("/api/odin/watcher-status", { cache: "no-store" })
      ]);
      const nextPayload = await response.json();
      if (!response.ok || nextPayload.connected === false) throw new Error(nextPayload.error || "Odin snapshot unavailable.");
      setPayload(nextPayload as OdinSnapshotPayload);
      if (watcherResponse.ok) {
        const watcherPayload = await watcherResponse.json();
        setWatcherStatus(watcherPayload.connected === false ? null : watcherPayload as WatcherStatusPayload);
      }
      setStatus(`Odin checked TOC at ${formatTime(nextPayload.generatedAt)}.`);
    } catch (error) {
      setPayload(null);
      setStatus(error instanceof Error ? error.message : "Odin control snapshot could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
    window.addEventListener("toc.actionState.updated", loadSnapshot);
    window.addEventListener("toc.odin.updated", loadSnapshot);
    return () => {
      window.removeEventListener("toc.actionState.updated", loadSnapshot);
      window.removeEventListener("toc.odin.updated", loadSnapshot);
    };
  }, []);

  const queue = useMemo(() => {
    const items = [
      ...(payload?.focusQueues.redItems || []),
      ...(payload?.focusQueues.overdueItems || []),
      ...(payload?.focusQueues.actionCarryover || [])
    ];
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.id || `${item.region}:${item.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }, [payload]);

  const closure = payload?.summary.actionClosure;
  const managerPressure = closure?.managerWorkload?.slice(0, 4) || [];
  const managerDigests = (payload?.summary.managerFollowThrough || payload?.focusQueues.managerFollowThrough || []).slice(0, 3);
  const craigPolicy = payload?.summary.craigEscalationPolicy || payload?.focusQueues.craigEscalationPolicy;
  const callCandidate = craigPolicy?.callCandidates?.[0];
  const craigCount = payload?.summary.openByEscalation?.craig || 0;
  const watcherTone: Severity | "green" = !watcherStatus ? "red" : watcherStatus.healthy ? "green" : watcherStatus.status === "dry_run" || watcherStatus.status === "version_mismatch" ? "amber" : "red";

  return (
    <div className="odin-control-console">
      <div className="odin-control-toolbar">
        <div>
          <strong>Odin operations control</strong>
          <small>{status}</small>
        </div>
        <button type="button" onClick={loadSnapshot} disabled={isLoading}>{isLoading ? "Checking..." : "Refresh Control"}</button>
      </div>

      {payload ? (
        <>
          <div className="closure-control-grid">
            <article className={`closure-metric-card ${metricTone(payload.summary.redCount)}`}>
              <span>Red work</span>
              <strong>{payload.summary.redCount}</strong>
              <small>Needs immediate control</small>
            </article>
            <article className={`closure-metric-card ${metricTone(payload.summary.overdueCount)}`}>
              <span>Overdue</span>
              <strong>{payload.summary.overdueCount}</strong>
              <small>Past due date</small>
            </article>
            <article className={`closure-metric-card ${metricTone(closure?.carryoverCount || 0)}`}>
              <span>Carryover</span>
              <strong>{closure?.carryoverCount || 0}</strong>
              <small>Still open from prior cycle</small>
            </article>
            <article className={`closure-metric-card ${metricTone(craigCount)}`}>
              <span>Craig escalation</span>
              <strong>{craigCount}</strong>
              <small>Only material exceptions</small>
            </article>
            <article className={`closure-metric-card ${metricTone(craigPolicy?.callCandidates?.length || 0)}`}>
              <span>Call Craig</span>
              <strong>{craigPolicy?.callCandidates?.length || 0}</strong>
              <small>{craigPolicy?.suppressedCount || 0} kept off Craig</small>
            </article>
            <article className={`closure-metric-card ${watcherTone}`}>
              <span>Watcher</span>
              <strong>{watcherStatus?.status?.replace("_", " ") || "unknown"}</strong>
              <small>{watcherStatus?.checks?.recentBriefWithoutHeartbeat ? "Brief seen, heartbeat missing" : watcherStatus?.lastSeenMinutes === null || watcherStatus?.lastSeenMinutes === undefined ? "No heartbeat" : `${watcherStatus.lastSeenMinutes}m ago`}</small>
            </article>
          </div>

          <div className="odin-control-split">
            <section className="odin-control-section">
              <div className="odin-control-section-head">
                <strong>Priority chase queue</strong>
                <small>{queue.length ? "Open the item and drive close-out." : "No urgent chase work detected."}</small>
              </div>
              <div className="odin-control-list">
                {queue.map((item) => <PriorityRow item={item} key={`${item.id}-${item.title}`} />)}
                {!queue.length ? <div className="empty-state">No red, overdue or carryover action needs immediate chasing.</div> : null}
              </div>
            </section>

            <section className="odin-control-section">
              <div className="odin-control-section-head">
                <strong>Manager pressure</strong>
                <small>Where Odin sees the most follow-through pressure.</small>
              </div>
              <div className="manager-workload-grid">
                {managerPressure.map((item) => {
                  const count = item.count ?? item.total ?? 0;
                  const carryover = item.carryover || 0;
                  return (
                    <article className={`manager-workload-card ${metricTone(item.overdue || item.craig || 0)}`} key={item.owner || item.region}>
                      <span>{item.owner || item.region || "Owner pending"}</span>
                      <strong>{count}</strong>
                      <small>{item.overdue || 0} overdue | {carryover} carryover</small>
                    </article>
                  );
                })}
                {!managerPressure.length ? <div className="empty-state">No manager pressure detected.</div> : null}
              </div>
            </section>
          </div>

          <section className="odin-control-section">
            <div className="odin-control-section-head">
              <strong>Manager follow-through digest</strong>
              <small>{managerDigests.length ? "Odin's practical chase plan by owner." : "No manager chase digest needed."}</small>
            </div>
            <div className="manager-digest-grid">
              {managerDigests.map((digest) => (
                <article className={`manager-digest-card ${digest.escalationLevel}`} key={digest.owner}>
                  <div>
                    <span className="eyebrow">{digest.region} | {digest.nextCheck.replace("_", " ")}</span>
                    <strong>{digest.owner}</strong>
                    <small>{digest.recommendedAction}</small>
                  </div>
                  <div className="manager-digest-metrics">
                    <Tag tone={digest.craigEscalation ? "red" : digest.overdue ? "amber" : "blue"}>{digest.totalOpen} open</Tag>
                    <Tag tone={digest.overdue ? "red" : "green"}>{digest.overdue} overdue</Tag>
                    <Tag tone={digest.carryover ? "amber" : "green"}>{digest.carryover} carryover</Tag>
                  </div>
                  {digest.topItems.length ? (
                    <div className="manager-digest-items">
                      {digest.topItems.slice(0, 2).map((item) => (
                        <Link href={normaliseHref(item)} key={`${digest.owner}-${item.id}`}>
                          {item.title}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
              {!managerDigests.length ? <div className="empty-state">No owner needs follow-through right now.</div> : null}
            </div>
          </section>

          {craigPolicy ? (
            <section className="odin-control-section">
              <div className="odin-control-section-head">
                <strong>Craig attention protection</strong>
                <small>{craigPolicy.purpose}</small>
              </div>
              <div className="craig-policy-strip">
                <article className={callCandidate ? "red" : "green"}>
                  <span>Phone call candidate</span>
                  <strong>{callCandidate ? callCandidate.title : "None"}</strong>
                  <small>{callCandidate ? callCandidate.reason : "Odin should keep current exceptions in TOC/National unless risk worsens."}</small>
                  {callCandidate?.href ? <Link href={normaliseHref(callCandidate)}>Open item</Link> : null}
                </article>
                <article className={craigPolicy.messageCandidates.length ? "amber" : "green"}>
                  <span>Message Craig</span>
                  <strong>{craigPolicy.messageCandidates.length}</strong>
                  <small>Material awareness only, not an automatic phone call.</small>
                </article>
                <article className="blue">
                  <span>National only</span>
                  <strong>{craigPolicy.nationalOnlyCandidates.length}</strong>
                  <small>Manager/National follow-up without interrupting Craig.</small>
                </article>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <div className="empty-state">{status}</div>
      )}
    </div>
  );
}
