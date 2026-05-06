"use client";

import { useState } from "react";
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

  async function askOdin() {
    setIsSaving(true);
    setStatus("");
    try {
      const response = await tocFetch("/api/odin/items", {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          itemType,
          title: `Ask Odin: ${title}`,
          region,
          sourceType,
          sourceId,
          severity,
          summary,
          noticed: noticed || `TOC user requested Odin review for ${sourceType}.`,
          whyItMatters: whyItMatters || "Odin should assess operational risk, missing context and recommended follow-up.",
          recommendedAction: recommendedAction || "Review the record, create a clear recommendation, and wait for Craig/national approval before any sensitive action.",
          approvalRequired: true
        })
      }, true);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Odin request could not be created.");
      setStatus("Odin request created for review.");
      window.dispatchEvent(new Event("toc.odin.updated"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Odin request could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="ask-odin-control">
      <button type="button" onClick={askOdin} disabled={isSaving}>{isSaving ? "Asking Odin..." : "Ask Odin About This"}</button>
      {status ? <small>{status}</small> : null}
    </div>
  );
}

