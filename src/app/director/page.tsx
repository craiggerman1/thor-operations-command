"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { DirectorBroadcastControls } from "@/components/UrgentBroadcast";
import { actionItems, productivitySites } from "@/lib/toc-data";

function getOpenTodoCount() {
  if (typeof window === "undefined") return 0;

  let count = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith("toc.todos.")) continue;

    try {
      const items = JSON.parse(localStorage.getItem(key) || "[]") as { done?: boolean }[];
      count += items.filter((item) => !item.done).length;
    } catch {
      count += 0;
    }
  }
  return count;
}

function getScoreFromOpenItems(openItems: number, penalty: number) {
  return Math.max(0, 100 - openItems * penalty);
}

function getTone(score: number) {
  if (score >= 90) return "green";
  if (score >= 75) return "amber";
  return "red";
}

export default function DirectorPage() {
  const [openTodoCount, setOpenTodoCount] = useState(0);
  const openActionItems = actionItems.filter((item) => item.status !== "Closed");
  const productivityScore = Math.round(productivitySites.reduce((total, site) => total + site.productivityScore, 0) / productivitySites.length);
  const complianceOpenItems = openActionItems.filter((item) => item.source === "Compliance").length;
  const actionScore = getScoreFromOpenItems(openActionItems.length, 8);
  const complianceScore = getScoreFromOpenItems(complianceOpenItems, 18);
  const todoScore = getScoreFromOpenItems(openTodoCount, 7);
  const overallScore = Math.round(productivityScore * 0.34 + complianceScore * 0.24 + actionScore * 0.25 + todoScore * 0.17);
  const overallTone = getTone(overallScore);

  useEffect(() => {
    function syncTodos() {
      setOpenTodoCount(getOpenTodoCount());
    }

    syncTodos();
    window.addEventListener("storage", syncTodos);
    window.addEventListener("toc.todos.updated", syncTodos);
    return () => {
      window.removeEventListener("storage", syncTodos);
      window.removeEventListener("toc.todos.updated", syncTodos);
    };
  }, []);

  return (
    <TocShell>
      <PageIntro title="Director" detail="High-level owner view of business health, efficiency, compliance and productivity." />
      <FlowHeading eyebrow="Director" title="Use this view for the overall health of the business without operational noise." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Director access" title="Owner health view" pill={`${overallScore}% overall`}>
          <div className="director-layout">
            <Link className={`director-scorecard actionable-card ${overallTone}`} href="/actions">
              <span>Overall position</span>
              <strong>{overallScore}%</strong>
              <small>Total nationwide position from open actions, site productivity and open manager To Do items.</small>
            </Link>
            <div className="director-signals">
              <Signal label="Productivity" value={`${productivityScore}%`} tone={getTone(productivityScore)} />
              <Signal label="Compliance" value={`${complianceScore}%`} tone={getTone(complianceScore)} />
              <Signal label="Manager To Do Items" value={openTodoCount.toString()} tone={openTodoCount ? "amber" : "green"} />
              <Signal label="Open Action Items" value={openActionItems.length.toString()} tone={openActionItems.length ? "amber" : "green"} />
            </div>
            <div className="director-brief">
              <div className="director-brief-item"><span className="brief-dot" /><strong>{openActionItems.length} national open action items currently influence the owner position.</strong></div>
              <div className="director-brief-item"><span className="brief-dot" /><strong><Tag tone={complianceScore >= 90 ? "green" : "amber"}>{complianceScore >= 90 ? "Stable" : "Watch"}</Tag> Compliance score is driven by open compliance action load.</strong></div>
            </div>
          </div>
        </Panel>
        <Panel wide eyebrow="Director message" title="A Message From The Director" pill="All users">
          <DirectorBroadcastControls />
        </Panel>
      </section>
    </TocShell>
  );
}

function Signal({ label, value, tone = "green" }: { label: string; value: string; tone?: "green" | "amber" | "red" }) {
  return <Link className={`director-signal actionable-card ${tone}`} href="/actions"><span>{label}</span><strong>{value}</strong><small>Open national action view</small></Link>;
}
