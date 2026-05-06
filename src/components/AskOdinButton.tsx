"use client";

import { useEffect, useState } from "react";
import { tocFetch } from "@/lib/toc-client-auth";
import type { Status } from "@/lib/toc-data";
import type { OdinItemType } from "@/lib/odin";

type AskOdinButtonProps = {
  sourceType: string;
  sourceId?: string;
  title: string;
  region: string;
  summary: string;
  noticed?: string;
  whyItMatters?: string;
  recommendedAction?: string;
  itemType?: OdinItemType;
  severity?: Status;
};

export function AskOdinButton({
  sourceType,
  sourceId,
  title,
  region,
  summary,
  noticed,
  whyItMatters,
  recommendedAction,
  itemType = "recommendation",
  severity = "blue"
}: AskOdinButtonProps) {
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [canAskOdin, setCanAskOdin] = useState(false);
  const [odinResult, setOdinResult] = useState<{
    summary: string;
    risk: string;
    recommendation: string;
    draftMessage: string;
    requiresApproval: boolean;
    confidence: number;
  } | null>(null);

  useEffect(() => {
    function syncPermission() {
      try {
        const session = JSON.parse(localStorage.getItem("toc.session") || "null");
        setCanAskOdin(session?.role === "admin" || (session?.role === "manager" && session?.scope === "National"));
      } catch {
        setCanAskOdin(false);
      }
    }

    syncPermission();
    window.addEventListener("storage", syncPermission);
    window.addEventListener("toc.scopechange", syncPermission);
    window.addEventListener("toc.sessionchange", syncPermission);
    return () => {
      window.removeEventListener("storage", syncPermission);
      window.removeEventListener("toc.scopechange", syncPermission);
      window.removeEventListener("toc.sessionchange", syncPermission);
    };
  }, []);

  async function askOdin() {
    setIsSaving(true);
    setStatus("");
    setOdinResult(null);
    try {
      const response = await tocFetch("/api/odin/ask", {
        method: "POST",
        body: JSON.stringify({
          sourceType,
          sourceId,
          title,
          region,
          prompt: recommendedAction || "Review this TOC record and recommend the safest operational next step.",
          context: {
            itemType,
            severity,
            summary,
            noticed: noticed || `TOC user requested Odin review for ${sourceType}.`,
            whyItMatters: whyItMatters || "Odin should assess operational risk, missing context and recommended follow-up.",
            recommendedAction: recommendedAction || "Review the record, create a clear recommendation, and wait for Craig/national approval before any sensitive action."
          }
        })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Odin request could not be completed.");
      setOdinResult(payload.response || null);
      setStatus(payload.gatewayConnected ? "Odin response logged for review." : "Odin memory logged. Gateway configuration is still required.");
      window.dispatchEvent(new Event("toc.odin.updated"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Odin request could not be completed.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!canAskOdin) return null;

  return (
    <div className="ask-odin-control">
      <button type="button" onClick={askOdin} disabled={isSaving}>{isSaving ? "Asking Odin..." : "Ask Odin About This"}</button>
      {status ? <small>{status}</small> : null}
      {odinResult ? (
        <div className="ask-odin-result">
          <span>Odin response</span>
          <strong>{odinResult.summary}</strong>
          <p>{odinResult.recommendation}</p>
          <small>Risk: {odinResult.risk}</small>
          {odinResult.draftMessage ? <small>Draft: {odinResult.draftMessage}</small> : null}
          <em>{odinResult.requiresApproval ? "Approval required before action." : "No sensitive action requested."} Confidence {odinResult.confidence}%.</em>
        </div>
      ) : null}
    </div>
  );
}
