"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";

type BriefType = "morning" | "midday" | "end_of_day";

type OdinBrief = {
  id: string;
  briefDate: string;
  briefType: BriefType | "weekly";
  region: string;
  title: string;
  summary: string;
  severity: "blue" | "amber" | "red";
  priorityItems: Array<{ title?: string; region?: string; severity?: string; recommendedAction?: string; href?: string }>;
  metrics: Record<string, number>;
  updatedAt: string;
};

const rhythmTypes: Array<{ type: BriefType; label: string }> = [
  { type: "morning", label: "Morning Brief" },
  { type: "midday", label: "Midday Check" },
  { type: "end_of_day", label: "End-of-Day Closeout" }
];

function getStoredScope() {
  if (typeof window === "undefined") return "National";
  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.scope || "National";
  } catch {
    return "National";
  }
}

function latestByType(briefs: OdinBrief[], type: BriefType) {
  return briefs.find((brief) => brief.briefType === type);
}

function formatUpdated(value?: string) {
  if (!value) return "Not generated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function OdinDailyRhythmPanel() {
  const [scope, setScope] = useState("National");
  const [briefs, setBriefs] = useState<OdinBrief[]>([]);
  const [status, setStatus] = useState("Loading Odin daily rhythm...");
  const [activeType, setActiveType] = useState<BriefType | null>(null);
  const isNationalScope = scope === "National";

  async function loadBriefs(nextScope = getStoredScope()) {
    if (nextScope !== "National") {
      setBriefs([]);
      setStatus("Daily rhythm is available in National scope.");
      return;
    }

    try {
      const response = await tocFetch("/api/odin/briefs?region=National&limit=12", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.connected === false) throw new Error(payload.error || "Odin briefs unavailable.");
      setBriefs((payload.briefs || []) as OdinBrief[]);
      setStatus(payload.briefs?.length ? `${payload.briefs.length} brief records loaded.` : "No brief records generated yet.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Odin daily rhythm could not be loaded.");
      setBriefs([]);
    }
  }

  async function generateBrief(type: BriefType) {
    setActiveType(type);
    setStatus("Generating Odin brief...");
    try {
      const response = await tocFetch("/api/odin/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", briefType: type, region: "National" })
      });
      const payload = await response.json();
      if (!response.ok || payload.connected === false) throw new Error(payload.error || "Brief could not be generated.");
      setStatus(`${payload.brief?.title || "Brief"} generated.`);
      await loadBriefs("National");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Brief could not be generated.");
    } finally {
      setActiveType(null);
    }
  }

  useEffect(() => {
    function syncScope(event?: Event) {
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : getStoredScope();
      setScope(nextScope);
      void loadBriefs(nextScope);
    }

    syncScope();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    return () => {
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
    };
  }, []);

  if (!isNationalScope) return null;

  return (
    <div className="odin-rhythm-console">
      {rhythmTypes.map((item) => {
        const brief = latestByType(briefs, item.type);
        return (
          <article className={`odin-rhythm-card ${brief?.severity || "blue"}`} key={item.type}>
            <div className="odin-rhythm-head">
              <div>
                <span className="eyebrow">Odin rhythm</span>
                <strong>{item.label}</strong>
                <small>{formatUpdated(brief?.updatedAt)}</small>
              </div>
              <Tag tone={brief?.severity || "blue"}>{brief?.severity || "ready"}</Tag>
            </div>
            <p>{brief?.summary || "No brief generated for this rhythm yet."}</p>
            {brief?.priorityItems?.length ? (
              <div className="odin-rhythm-priorities">
                {brief.priorityItems.slice(0, 3).map((priority, index) => (
                  <Link href={priority.href || "/actions"} key={`${brief.id}-${index}`}>
                    <strong>{priority.title || "Priority item"}</strong>
                    <small>{priority.recommendedAction || "Open the linked TOC area."}</small>
                  </Link>
                ))}
              </div>
            ) : null}
            <button type="button" onClick={() => generateBrief(item.type)} disabled={activeType === item.type}>
              {activeType === item.type ? "Generating..." : `Generate ${item.label}`}
            </button>
          </article>
        );
      })}
      <small className="admin-hint-message">{status}</small>
    </div>
  );
}
