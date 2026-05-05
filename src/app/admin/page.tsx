import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { AdminHintControls, FlowHeading, Panel, Tag } from "@/components/TocCards";
import { AdminAccessManager } from "@/components/AdminAccessManager";
import { DirectorBroadcastControls, UrgentBroadcastControls } from "@/components/UrgentBroadcast";
import { OperationsNewsControls } from "@/components/OperationsNewsControls";
import { adminSettingStateDescriptions, adminSettingStateLabels, pageSettings } from "@/lib/admin-settings";
import { getSupabaseRegionsStatus } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const databaseStatus = await getSupabaseRegionsStatus();

  return (
    <TocShell>
      <PageIntro title="Admin Settings" detail="Site settings, user access, permissions, region visibility and admin setup controls." />
      <FlowHeading eyebrow="Admin Settings" title="Use admin settings to manage access, permissions and reusable guidance for managers." />
      <section className="command-grid route-grid">
        <Panel
          wide
          eyebrow="Database connection"
          title="Supabase status"
          pill={databaseStatus.connected ? "Connected" : databaseStatus.configured ? "Check needed" : "Not configured"}
        >
          <div className="director-brief-item">
            <span className={`brief-dot ${databaseStatus.connected ? "" : "amber-dot"}`} />
            <strong>
              {databaseStatus.connected
                ? "TOC can read the Supabase regions table."
                : "TOC database connection is not confirmed yet."}
            </strong>
            <small>
              {databaseStatus.connected
                ? `${databaseStatus.regionCount} active regions loaded from Supabase.`
                : databaseStatus.message}
            </small>
          </div>
        </Panel>
        <Panel wide eyebrow="Security readiness" title="Production access hardening" pill="Auth pending">
          <div className="director-brief-item">
            <span className="brief-dot amber-dot" />
            <strong>Supabase Auth and Row Level Security are the next production security step.</strong>
            <small>Current TOC database endpoints are server-side and suitable for controlled development, but production field users need authenticated sessions, role-aware policies and per-user acknowledgement records before wider rollout.</small>
          </div>
        </Panel>
        <Panel wide eyebrow="Page settings" title="TOC page control sections" pill={`${pageSettings.length} pages`}>
          <div className="admin-page-settings-grid">
            {pageSettings.map((setting) => (
              <Link className="admin-page-setting-card actionable-card" href={`/admin/settings/${setting.slug}`} key={setting.page}>
                <div>
                  <strong>{setting.page}</strong>
                  <small>{setting.owner}</small>
                </div>
                <p>{setting.control}</p>
                <div className="meta-row"><Tag tone={setting.state === "Active" ? "green" : setting.state === "Ready" ? "amber" : "blue"}>{adminSettingStateLabels[setting.state]}</Tag></div>
              </Link>
            ))}
          </div>
          <div className="admin-state-legend">
            {(["Active", "Mapped", "Ready", "Next"] as const).map((state) => (
              <span key={state}><strong>{adminSettingStateLabels[state]}</strong>{adminSettingStateDescriptions[state]}</span>
            ))}
          </div>
        </Panel>
        <Panel wide eyebrow="Access control" title="Register users, access levels and region responsibility" pill="Admin only">
          <AdminAccessManager />
        </Panel>
        <Panel wide eyebrow="Guidance controls" title="Page hints" pill="Admin only" className="admin-hint-panel">
          <AdminHintControls />
        </Panel>
        <Panel wide eyebrow="Operations news" title="Title bar news control" pill="Admin only" className="admin-broadcast-panel">
          <OperationsNewsControls />
        </Panel>
        <Panel wide eyebrow="Urgent broadcast" title="Urgent notice control" pill="Admin only" className="admin-broadcast-panel">
          <UrgentBroadcastControls />
        </Panel>
        <Panel wide eyebrow="Director broadcast" title="Director message control" pill="Admin can disable" className="admin-broadcast-panel">
          <DirectorBroadcastControls />
        </Panel>
      </section>
    </TocShell>
  );
}
