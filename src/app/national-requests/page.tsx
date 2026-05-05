"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { NationalActionRequests } from "@/components/NationalActionRequests";
import { StockOrderAdminReview } from "@/components/StockOrderAdminReview";

function getStoredScope() {
  if (typeof window === "undefined") return "National";

  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.scope || "National";
  } catch {
    return "National";
  }
}

export default function NationalRequestsPage() {
  const [scope, setScope] = useState("National");

  useEffect(() => {
    function syncScope(event?: Event) {
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : getStoredScope();
      setScope(nextScope);
    }

    syncScope();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    const refreshInterval = window.setInterval(syncScope, 15000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
    };
  }, []);

  return (
    <TocShell>
      <PageIntro title="National Requests" detail="National queue for manager requests, close-outs and follow-up items." />
      {scope === "National" ? (
        <>
          <FlowHeading eyebrow="National Requests" title="Review manager-submitted items, respond to stock requests and approve close-outs from one queue." />
          <section className="command-grid route-grid">
            <Panel wide eyebrow="Manager requests" title="Action close-outs awaiting national review">
              <NationalActionRequests />
            </Panel>
            <Panel wide eyebrow="Stock requests" title="Stock order requests from regions">
              <StockOrderAdminReview />
            </Panel>
          </section>
        </>
      ) : (
        <section className="command-grid route-grid">
          <Panel wide eyebrow="Restricted scope" title="National Requests is only available in National scope">
            <div className="empty-state">Switch the header region back to National to review manager close-outs and stock order requests.</div>
            <Link className="node-action" href="/home">Return Home</Link>
          </Panel>
        </section>
      )}
    </TocShell>
  );
}
