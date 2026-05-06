"use client";

import { useEffect, useMemo, useState } from "react";
import { tocFetch } from "@/lib/toc-client-auth";
import { Tag } from "@/components/TocCards";

type AuditEntry = {
  id: string;
  createdAt: string;
  actorProfileId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  entityEmail: string | null;
  scope: string;
  details: Record<string, unknown>;
};

function formatAction(action: string) {
  return action
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatActor(entry: AuditEntry) {
  if (!entry.actorProfileId) return entry.actorRole === "admin" ? "Development admin" : "System";
  if (entry.actorName) return `${entry.actorName} - ${entry.actorRole}`;
  return `${entry.actorRole} - ${entry.actorProfileId.slice(0, 8)}`;
}

function formatEntity(entry: AuditEntry) {
  const entityName = entry.entityName ? `${entry.entityName}` : entry.entityType;
  const entityId = entry.entityId ? ` - ${entry.entityId.slice(0, 8)}` : "";
  return `${entityName}${entityId}`;
}

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

function detailSummary(details: Record<string, unknown>) {
  const keys = Object.keys(details || {});
  if (!keys.length) return "No extra detail recorded.";
  return keys
    .slice(0, 4)
    .map((key) => `${key}: ${Array.isArray(details[key]) ? (details[key] as unknown[]).join(", ") : String(details[key])}`)
    .join(" | ");
}

export function AdminAuditTrail() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [status, setStatus] = useState("Loading audit trail...");
  const [isLoading, setIsLoading] = useState(false);

  const actorMappedCount = useMemo(() => entries.filter((entry) => entry.actorProfileId).length, [entries]);

  async function loadAuditTrail() {
    setIsLoading(true);
    setStatus("Loading audit trail...");
    try {
      const response = await tocFetch("/api/admin/audit", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.connected === false) throw new Error(payload.error || "Audit trail unavailable.");
      setEntries((payload.entries || []) as AuditEntry[]);
      setStatus(`${payload.entries?.length || 0} audit events loaded.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Audit trail could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAuditTrail();
  }, []);

  return (
    <div className="admin-audit-console">
      <div className="admin-audit-summary">
        <article>
          <span>Events loaded</span>
          <strong>{entries.length}</strong>
        </article>
        <article>
          <span>Actor mapped</span>
          <strong>{actorMappedCount}</strong>
        </article>
        <article>
          <span>Status</span>
          <strong>{entries.length ? "Live" : "Ready"}</strong>
        </article>
      </div>
      <div className="admin-audit-toolbar">
        <div>
          <strong>Security and admin activity</strong>
          <small>Shows recent database-backed TOC activity. Real Supabase users should populate the actor column.</small>
        </div>
        <button type="button" onClick={loadAuditTrail} disabled={isLoading}>{isLoading ? "Refreshing..." : "Refresh Audit Trail"}</button>
      </div>
      <div className="admin-audit-list">
        {entries.map((entry) => (
          <article className="admin-audit-row" key={entry.id}>
            <div>
              <strong>{formatAction(entry.action)}</strong>
              <small>{formatDate(entry.createdAt)} | {formatActor(entry)}</small>
              {entry.actorEmail ? <small>{entry.actorEmail}</small> : null}
            </div>
            <div className="meta-row">
              <Tag tone={entry.actorProfileId ? "green" : "amber"}>{entry.actorProfileId ? "Actor linked" : "System/dev"}</Tag>
              <Tag>{entry.scope}</Tag>
            </div>
            <p>{formatEntity(entry)}</p>
            <small>{detailSummary(entry.details)}</small>
          </article>
        ))}
        {!entries.length ? <small className="admin-hint-message">{status}</small> : null}
      </div>
      {entries.length ? <small className="admin-hint-message">{status}</small> : null}
    </div>
  );
}
