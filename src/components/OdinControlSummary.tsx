"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { tocFetch } from "@/lib/toc-client-auth";

type Tone = "green" | "amber" | "red" | "blue";

type WatcherStatus = {
  connected: boolean;
  healthy: boolean;
  status: string;
  summary: string;
  lastSeenAt: string | null;
  lastSeenMinutes: number | null;
  facts?: {
    dryRun?: boolean;
    minimumSeverity?: string;
    snapshotOpenWork?: number;
    snapshotRedCount?: number;
    snapshotOverdueCount?: number;
  };
};

type ConfidencePayload = {
  connected: boolean;
  confidenceScore: number;
  summary: {
    issueCount: number;
    severityCounts: Record<"red" | "amber" | "blue", number>;
  };
};

type BriefPayload = {
  connected: boolean;
  briefs?: Array<{
    id: string;
    briefDate: string;
    briefType: string;
    title: string;
    severity: Tone;
    updatedAt: string;
    priorityItems?: Array<{ title?: string; href?: string }>;
  }>;
};

type SnapshotPayload = {
  connected: boolean;
  generatedAt: string;
  summary: {
    totalOpenWork: number;
    redCount: number;
    overdueCount: number;
    rosterGapCount: number;
    openByEscalation?: Record<string, number>;
  };
};

type OdinControlPayload = {
  connected: boolean;
  error?: string | null;
  control: {
    overwatchEnabled: boolean;
    updatedAt?: string | null;
    updatedBy?: string | null;
  };
  managers: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    regions: string[];
    mobile: string;
    whatsapp: string;
    hasContact: boolean;
    escalationEnabled: boolean;
  }>;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Not seen yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function scoreTone(score?: number): Tone {
  if (typeof score !== "number") return "blue";
  if (score < 70) return "red";
  if (score < 86) return "amber";
  return "green";
}

function statusTone(status?: WatcherStatus | null): Tone {
  if (!status) return "blue";
  if (status.healthy) return "green";
  if (status.status === "dry_run" || status.status === "version_mismatch") return "amber";
  return "red";
}

function latestBriefLabel(briefs: BriefPayload["briefs"]) {
  const brief = [...(briefs || [])].sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""))[0];
  if (!brief) return "No brief generated yet";
  return `${brief.title} - ${formatDateTime(brief.updatedAt)}`;
}

function Metric({ label, value, detail, tone = "blue" }: { label: string; value: string | number; detail: string; tone?: Tone }) {
  return (
    <article className={`odin-simple-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function ToggleButton({
  checked,
  disabled,
  label,
  onToggle
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`odin-toggle ${checked ? "on" : "off"}`}
      aria-pressed={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    >
      <span />
    </button>
  );
}

export function OdinControlSummary() {
  const [watcher, setWatcher] = useState<WatcherStatus | null>(null);
  const [confidence, setConfidence] = useState<ConfidencePayload | null>(null);
  const [briefs, setBriefs] = useState<BriefPayload["briefs"]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotPayload | null>(null);
  const [control, setControl] = useState<OdinControlPayload | null>(null);
  const [status, setStatus] = useState("Loading Odin control...");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setStatus("Checking Odin...");
    try {
      const [watcherResponse, confidenceResponse, briefsResponse, snapshotResponse, controlResponse] = await Promise.all([
        tocFetch("/api/odin/watcher-status", { cache: "no-store" }),
        tocFetch("/api/odin/confidence", { cache: "no-store" }),
        tocFetch("/api/odin/briefs?region=National&limit=6", { cache: "no-store" }),
        tocFetch("/api/odin/snapshot", { cache: "no-store" }),
        tocFetch("/api/odin/control", { cache: "no-store" })
      ]);

      const watcherPayload = await watcherResponse.json();
      const confidencePayload = await confidenceResponse.json();
      const briefsPayload = await briefsResponse.json();
      const snapshotPayload = await snapshotResponse.json();
      const controlPayload = await controlResponse.json();

      if (watcherResponse.ok && watcherPayload.connected !== false) setWatcher(watcherPayload as WatcherStatus);
      if (confidenceResponse.ok && confidencePayload.connected !== false) setConfidence(confidencePayload as ConfidencePayload);
      if (briefsResponse.ok && briefsPayload.connected !== false) setBriefs((briefsPayload as BriefPayload).briefs || []);
      if (snapshotResponse.ok && snapshotPayload.connected !== false) setSnapshot(snapshotPayload as SnapshotPayload);
      if (controlResponse.ok && controlPayload.connected !== false) setControl(controlPayload as OdinControlPayload);
      setStatus(`Last checked ${formatDateTime(new Date().toISOString())}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Odin control could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function saveControl(payload: Record<string, unknown>, savingKey: string) {
    setSaving(savingKey);
    setStatus("Saving Odin control...");
    try {
      const response = await tocFetch("/api/odin/control", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const nextPayload = await response.json();
      if (!response.ok) throw new Error(nextPayload.error || "Odin control could not be saved.");
      setControl(nextPayload as OdinControlPayload);
      setStatus(`Saved ${formatDateTime(new Date().toISOString())}`);
      window.dispatchEvent(new Event("toc.odin.updated"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Odin control could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  useEffect(() => {
    void load();
    window.addEventListener("toc.odin.updated", load);
    window.addEventListener("toc.actionState.updated", load);
    return () => {
      window.removeEventListener("toc.odin.updated", load);
      window.removeEventListener("toc.actionState.updated", load);
    };
  }, []);

  const recentPriorities = useMemo(() => (briefs || []).flatMap((brief) => brief.priorityItems || []).slice(0, 5), [briefs]);
  const watcherTone = statusTone(watcher);
  const confidenceTone = scoreTone(confidence?.confidenceScore);
  const craigCount = snapshot?.summary.openByEscalation?.craig || 0;
  const overwatchEnabled = control?.control.overwatchEnabled !== false;
  const enabledManagers = (control?.managers || []).filter((manager) => manager.escalationEnabled).length;
  const contactableManagers = (control?.managers || []).filter((manager) => manager.hasContact).length;

  return (
    <div className="odin-simple-control">
      <section className={`odin-simple-status ${overwatchEnabled ? watcherTone : "amber"}`}>
        <div>
          <span className="eyebrow">Odin Watcher</span>
          <strong>{overwatchEnabled ? watcher?.healthy ? "Online and watching" : watcher ? watcher.status.replace(/_/g, " ") : "Status loading" : "Overwatch paused"}</strong>
          <small>{overwatchEnabled ? watcher?.summary || status : "Odin service writes and operating control are paused until Overwatch is turned back on."}</small>
        </div>
        <div className="odin-status-actions">
          <ToggleButton
            checked={overwatchEnabled}
            disabled={saving === "overwatch"}
            label="Toggle Odin Overwatch"
            onToggle={() => void saveControl({ overwatchEnabled: !overwatchEnabled }, "overwatch")}
          />
          <button type="button" onClick={load} disabled={loading}>{loading ? "Checking..." : "Refresh"}</button>
        </div>
      </section>

      <section className="odin-simple-grid">
        <Metric label="Heartbeat" value={watcher?.lastSeenMinutes === null || watcher?.lastSeenMinutes === undefined ? "--" : `${watcher.lastSeenMinutes}m`} detail={formatDateTime(watcher?.lastSeenAt)} tone={watcherTone} />
        <Metric label="Open Work" value={snapshot?.summary.totalOpenWork ?? "--"} detail={`${snapshot?.summary.redCount ?? 0} red, ${snapshot?.summary.overdueCount ?? 0} overdue`} tone={(snapshot?.summary.redCount || 0) > 0 ? "red" : (snapshot?.summary.overdueCount || 0) > 0 ? "amber" : "green"} />
        <Metric label="Roster Risks" value={snapshot?.summary.rosterGapCount ?? "--"} detail="Current Odin roster gap count" tone={(snapshot?.summary.rosterGapCount || 0) > 0 ? "amber" : "green"} />
        <Metric label="Craig Escalation" value={craigCount} detail="Only material exceptions should reach Craig" tone={craigCount > 0 ? "red" : "green"} />
        <Metric label="Data Confidence" value={confidence ? confidence.confidenceScore : "--"} detail={`${confidence?.summary.issueCount ?? 0} confidence items`} tone={confidenceTone} />
        <Metric label="Dry Run" value={watcher?.facts?.dryRun ? "On" : "Off"} detail={`Minimum severity: ${watcher?.facts?.minimumSeverity || "unknown"}`} tone={watcher?.facts?.dryRun ? "amber" : "green"} />
        <Metric label="Manager Escalation" value={enabledManagers} detail={`${contactableManagers} managers have contact details`} tone={enabledManagers > 0 ? "green" : "amber"} />
      </section>

      <section className="odin-control-switchboard">
        <div className="odin-switchboard-head">
          <div>
            <span className="eyebrow">Escalation Control</span>
            <strong>Manager contact permissions</strong>
            <small>When enabled, Odin may contact that manager only for high-severity action items and only while Overwatch is on.</small>
          </div>
          <span>{enabledManagers} enabled</span>
        </div>
        <div className="odin-manager-list">
          {(control?.managers || []).map((manager) => (
            <article key={manager.id} className={!manager.hasContact ? "muted" : ""}>
              <div>
                <strong>{manager.name}</strong>
                <small>{[manager.role, manager.regions.join(", ") || "No region", manager.whatsapp || manager.mobile || "No contact number"].filter(Boolean).join(" - ")}</small>
              </div>
              <ToggleButton
                checked={manager.escalationEnabled}
                disabled={!manager.hasContact || saving === manager.id}
                label={`Toggle escalation contact for ${manager.name}`}
                onToggle={() => void saveControl({ managerId: manager.id, escalationEnabled: !manager.escalationEnabled }, manager.id)}
              />
            </article>
          ))}
          {!control?.managers?.length ? <small>No active manager contacts are available yet.</small> : null}
        </div>
      </section>

      <section className="odin-simple-panels">
        <article>
          <span className="eyebrow">Daily Rhythm</span>
          <strong>{latestBriefLabel(briefs)}</strong>
          <small>Odin creates the operating rhythm automatically. Manual generation is backup only.</small>
          <div className="odin-simple-actions">
            <Link href="/home">View Rhythm Health</Link>
            <Link href="/actions">Open Action Centre</Link>
          </div>
        </article>
        <article>
          <span className="eyebrow">Current Priorities</span>
          <strong>{recentPriorities.length ? `${recentPriorities.length} linked from recent briefs` : "No active brief priorities"}</strong>
          <div className="odin-simple-priority-list">
            {recentPriorities.map((item, index) => (
              <Link href={item.href || "/actions"} key={`${item.title || "priority"}-${index}`}>{item.title || "Odin priority"}</Link>
            ))}
            {!recentPriorities.length ? <small>Nothing needs action from this panel right now.</small> : null}
          </div>
        </article>
      </section>
    </div>
  );
}
