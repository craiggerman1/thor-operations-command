import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { AdminHintControls, FlowHeading, Panel, Tag } from "@/components/TocCards";
import { AdminAccessManager } from "@/components/AdminAccessManager";
import { DirectorBroadcastControls, UrgentBroadcastControls } from "@/components/UrgentBroadcast";
import { OperationsNewsControls } from "@/components/OperationsNewsControls";
import { AdminAuditTrail } from "@/components/AdminAuditTrail";
import { adminSettingStateLabels, pageSettings } from "@/lib/admin-settings";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <TocShell>
      <PageIntro title="Admin Settings" detail="Site settings, user access, permissions, region visibility and admin setup controls." />
      <FlowHeading eyebrow="Admin Settings" title="Use admin settings to manage access, permissions and reusable guidance for managers." />
      <section className="command-grid route-grid">
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
        </Panel>
        <Panel wide eyebrow="Access control" title="Register users, access levels and region responsibility" pill="Admin only">
          <AdminAccessManager />
        </Panel>
        <Panel wide eyebrow="Audit trail" title="Odin, security and admin activity" pill="Live database">
          <AdminAuditTrail />
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
