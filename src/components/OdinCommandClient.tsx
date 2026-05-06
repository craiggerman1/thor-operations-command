"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { tocFetch } from "@/lib/toc-client-auth";
import { allRegions } from "@/lib/access";
import { odinCommandFeatures, odinItemTypeLabels, odinStatusLabels, type OdinItem, type OdinItemType } from "@/lib/odin";
import { Tag } from "@/components/TocCards";
import type { Status } from "@/lib/toc-data";

type OdinContext = {
  connected: boolean;
  scope: string;
  generatedAt: string;
  counts: Record<string, number>;
  operatingRhythm: string[];
};

const itemTypes: OdinItemType[] = ["alert", "recommendation", "brief", "follow_up", "draft_message", "call_log", "action_request"];
const severityOptions: Status[] = ["red", "amber", "blue", "green"];

function formatDate(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function statusTone(status: string): Status {
  if (status === "approved" || status === "done") return "green";
  if (status === "rejected" || status === "dismissed") return "amber";
  return "blue";
}

export function OdinCommandClient() {
  const [items, setItems] = useState<OdinItem[]>([]);
  const [context, setContext] = useState<OdinContext | null>(null);
  const [status, setStatus] = useState("Loading Odin Command...");
  const [isLoading, setIsLoading] = useState(false);
  const [itemType, setItemType] = useState<OdinItemType>("alert");
  const [title, setTitle] = useState("");
  const [region, setRegion] = useState("National");
  const [severity, setSeverity] = useState<Status>("amber");
  const [summary, setSummary] = useState("");
  const [noticed, setNoticed] = useState("");
  const [whyItMatters, setWhyItMatters] = useState("");
  const [recommendedAction, setRecommendedAction] = useState("");
  const [latestOdinResponse, setLatestOdinResponse] = useState<{
    summary: string;
    risk: string;
    recommendation: string;
    draftMessage: string;
    requiresApproval: boolean;
    confidence: number;
  } | null>(null);

  const pendingItems = useMemo(() => items.filter((item) => item.status === "pending"), [items]);
  const approvalItems = useMemo(() => pendingItems.filter((item) => item.approvalRequired), [pendingItems]);
  const activeAlerts = useMemo(() => items.filter((item) => item.itemType === "alert" && item.status === "pending"), [items]);
  const visibleItems = useMemo(() => items.filter((item) => !["dismissed", "rejected", "done"].includes(item.status)), [items]);
  const clearedItems = useMemo(() => items.filter((item) => ["dismissed", "rejected", "done"].includes(item.status)), [items]);

  async function loadOdin() {
    setIsLoading(true);
    setStatus("Loading Odin Command...");
    try {
      const [itemsResponse, contextResponse] = await Promise.all([
        tocFetch("/api/odin/items?status=all", { cache: "no-store" }),
        tocFetch("/api/odin/context?scope=National", { cache: "no-store" })
      ]);
      const itemsPayload = await itemsResponse.json();
      const contextPayload = await contextResponse.json();
      if (!itemsResponse.ok || itemsPayload.connected === false) throw new Error(itemsPayload.error || "Odin items unavailable.");
      if (contextResponse.ok && contextPayload.connected !== false) setContext(contextPayload as OdinContext);
      setItems((itemsPayload.items || []) as OdinItem[]);
      setStatus(`${itemsPayload.items?.length || 0} Odin items loaded.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Odin Command could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOdin();
  }, []);

  async function askOdin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setStatus("Odin review title is required.");
      return;
    }

    setIsLoading(true);
    setLatestOdinResponse(null);
    try {
      const response = await tocFetch("/api/odin/ask", {
        method: "POST",
        body: JSON.stringify({
          sourceType: "toc_command",
          title,
          region,
          prompt: recommendedAction || summary || `Review ${title} and advise the next operational action.`,
          context: {
            itemType,
            severity,
            summary,
            noticed,
            whyItMatters,
            recommendedAction
          }
        })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Odin review could not be created.");
      setLatestOdinResponse(payload.response || null);
      await loadOdin();
      setTitle("");
      setSummary("");
      setNoticed("");
      setWhyItMatters("");
      setRecommendedAction("");
      setStatus(payload.gatewayConnected ? "Odin review completed and logged." : "Odin memory logged. Gateway configuration is still required.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Odin review could not be created.");
    } finally {
      setIsLoading(false);
    }
  }

  async function updateItem(id: string, action: "approve" | "reject" | "dismiss" | "done") {
    setIsLoading(true);
    try {
      const response = await tocFetch("/api/odin/items", {
        method: "POST",
        body: JSON.stringify({ action, id })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Odin item could not be updated.");
      setItems((payload.items || []) as OdinItem[]);
      setStatus(`Odin item ${action === "done" ? "closed" : action === "dismiss" ? "dismissed" : action}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Odin item could not be updated.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="odin-command-console">
      <div className="odin-command-hero">
        <div>
          <span className="eyebrow">AI watch tower</span>
          <h2>Odin Command</h2>
          <p>Odin reads TOC signals through controlled APIs, writes recommendations into this command queue, and cannot edit, close, approve or execute anything without express human approval.</p>
        </div>
        <div className="odin-command-status">
          <strong>{context?.connected ? "Online" : "Ready"}</strong>
          <small>{context ? `Context generated ${new Date(context.generatedAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}` : "Awaiting live context"}</small>
        </div>
      </div>

      <div className="odin-command-metrics">
        <article><span>Pending Odin items</span><strong>{pendingItems.length}</strong></article>
        <article><span>Approval required</span><strong>{approvalItems.length}</strong></article>
        <article><span>Active alerts</span><strong>{activeAlerts.length}</strong></article>
        <article><span>TOC open actions</span><strong>{context?.counts?.openActions ?? "--"}</strong></article>
      </div>

      <section className="odin-command-layout">
        <form className="odin-command-form" onSubmit={askOdin}>
          <div>
            <strong>Ask Odin</strong>
            <small>Admin and National users can ask Odin directly. Regional users cannot access Odin directly, but Odin can still monitor all users through the backend watch tower.</small>
          </div>
          <label><span>Type</span><select value={itemType} onChange={(event) => setItemType(event.target.value as OdinItemType)}>{itemTypes.map((type) => <option value={type} key={type}>{odinItemTypeLabels[type]}</option>)}</select></label>
          <label><span>Region</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{allRegions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          <label><span>Severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value as Status)}>{severityOptions.map((item) => <option value={item} key={item}>{item.toUpperCase()}</option>)}</select></label>
          <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Issue, recommendation or brief title" /></label>
          <label><span>Summary</span><textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What Odin is reporting" /></label>
          <label><span>What Odin noticed</span><textarea value={noticed} onChange={(event) => setNoticed(event.target.value)} placeholder="Signal, pattern or missing item" /></label>
          <label><span>Why it matters</span><textarea value={whyItMatters} onChange={(event) => setWhyItMatters(event.target.value)} placeholder="Operational risk or business impact" /></label>
          <label><span>Question / requested action</span><textarea value={recommendedAction} onChange={(event) => setRecommendedAction(event.target.value)} placeholder="Ask Odin what matters, what is missing, and what should happen next" /></label>
          <button type="submit" disabled={isLoading}>{isLoading ? "Asking Odin..." : "Ask Odin"}</button>
          {latestOdinResponse ? (
            <div className="ask-odin-result">
              <span>Latest Odin response</span>
              <strong>{latestOdinResponse.summary}</strong>
              <p>{latestOdinResponse.recommendation}</p>
              <small>Risk: {latestOdinResponse.risk}</small>
              {latestOdinResponse.draftMessage ? <small>Draft: {latestOdinResponse.draftMessage}</small> : null}
              <em>{latestOdinResponse.requiresApproval ? "Approval required before action." : "No sensitive action requested."} Confidence {latestOdinResponse.confidence}%.</em>
            </div>
          ) : null}
        </form>

        <div className="odin-item-list">
          <div className="odin-list-head">
            <div>
              <strong>Odin Alerts and Recommendations</strong>
              <small>Every item remains accountable: noticed, why it matters, recommendation, confidence, approval and status.</small>
            </div>
            <button type="button" onClick={loadOdin} disabled={isLoading}>{isLoading ? "Refreshing..." : "Refresh"}</button>
          </div>
          {visibleItems.map((item) => (
            <article className={`odin-item-card signal-${item.severity}`} key={item.id}>
              <div className="odin-item-head">
                <div>
                  <strong>{item.title}</strong>
                  <small>{odinItemTypeLabels[item.itemType]} | {item.region} | {formatDate(item.dueAt)}</small>
                </div>
                <div className="meta-row">
                  <Tag tone={item.severity}>{item.severity.toUpperCase()}</Tag>
                  <Tag tone={statusTone(item.status)}>{odinStatusLabels[item.status]}</Tag>
                </div>
              </div>
              {item.summary ? <p>{item.summary}</p> : null}
              <dl className="odin-item-detail-grid">
                <div><dt>Noticed</dt><dd>{item.noticed || "No noticed signal supplied yet."}</dd></div>
                <div><dt>Why it matters</dt><dd>{item.whyItMatters || "No risk note supplied yet."}</dd></div>
                <div><dt>Recommended action</dt><dd>{item.recommendedAction || "No recommended action supplied yet."}</dd></div>
                <div><dt>Confidence</dt><dd>{item.confidence}%</dd></div>
              </dl>
              <div className="odin-item-actions">
                <button type="button" onClick={() => updateItem(item.id, "approve")} disabled={isLoading}>Approve</button>
                <button type="button" onClick={() => updateItem(item.id, "done")} disabled={isLoading}>Mark Done</button>
                <button type="button" className="secondary-button" onClick={() => updateItem(item.id, "dismiss")} disabled={isLoading}>Dismiss</button>
                <button type="button" className="danger-button" onClick={() => updateItem(item.id, "reject")} disabled={isLoading}>Reject</button>
              </div>
            </article>
          ))}
          {!visibleItems.length ? <small className="admin-hint-message">No active Odin items. Cleared items remain in the database audit trail.</small> : null}
          {clearedItems.length ? <small className="admin-hint-message">{clearedItems.length} cleared Odin item{clearedItems.length === 1 ? "" : "s"} hidden from the active queue.</small> : null}
          <small className="admin-hint-message">{status}</small>
        </div>
      </section>

      <div className="odin-command-rhythm">
        <article className="odin-consent-gate"><span>Persistent memory active: each Odin request is stored against a session key so Odin can build context over time. Consent gate remains active for every action.</span></article>
        <article className="odin-consent-gate"><span>Direct access limited: Admin and National users can interact with Odin. Odin backend monitoring can still observe all regions and users through controlled APIs.</span></article>
        {odinCommandFeatures.map((feature) => <article key={feature}><span>{feature}</span></article>)}
        {(context?.operatingRhythm || []).map((item) => <article key={item}><span>{item}</span></article>)}
      </div>
    </div>
  );
}
