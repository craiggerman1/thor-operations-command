import { TocShell, PageIntro } from "@/components/TocShell";
import { AdminHintControls, FlowHeading, Panel, Tag } from "@/components/TocCards";
import { AdminAccessManager } from "@/components/AdminAccessManager";
import { StockOrderAdminReview } from "@/components/StockOrderAdminReview";
import { DirectorBroadcastControls, UrgentBroadcastControls } from "@/components/UrgentBroadcast";
import { approvedStockItems, compliance } from "@/lib/toc-data";
import { navigationItems, sessionProfiles } from "@/lib/access";

const accessRules = [
  {
    title: "Admin",
    scope: "National command + optional assigned regions",
    detail: "Full national view and control, Admin Settings access, user assignment control, and optional manager responsibility for one or more regions."
  },
  {
    title: "Manager",
    scope: "Assigned region or multiple assigned regions",
    detail: "Sees and acts on only the regions Admin assigns, including normal region responsibilities such as stock, compliance, productivity and chat."
  },
  {
    title: "Director",
    scope: "Owner overview",
    detail: "High-level business health view with Director message broadcast ability. No operational noise unless required."
  }
];

const permissionGroups = [
  { area: "National command", admin: "Full control", manager: "No", director: "Summary only" },
  { area: "Admin Settings", admin: "Full control", manager: "No", director: "No" },
  { area: "Assigned region work", admin: "When assigned", manager: "Full within assigned regions", director: "No" },
  { area: "Director message", admin: "View via Director page", manager: "Acknowledge only", director: "Create and redeploy" },
  { area: "Action close-out", admin: "Approve and control", manager: "Submit for national approval", director: "Summary only" }
];

export default function AdminPage() {
  return (
    <TocShell>
      <PageIntro title="Admin Settings" detail="Site settings, user access, permissions, region visibility and admin setup controls." />
      <FlowHeading eyebrow="Admin Settings" title="Use admin settings to manage access, permissions and reusable guidance for managers." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Guidance controls" title="Page hints" pill="Admin only" className="admin-hint-panel">
          <AdminHintControls />
        </Panel>
        <Panel wide eyebrow="Urgent broadcast" title="All-user alert banner" pill="Admin only">
          <UrgentBroadcastControls />
        </Panel>
        <Panel wide eyebrow="Director broadcast" title="Director message control" pill="Admin can disable">
          <DirectorBroadcastControls />
        </Panel>
        <Panel wide eyebrow="System tuning" title="TOC configuration switches" pill="Admin only">
          <div className="admin-settings-grid">
            <article className="admin-setting-card"><strong>Data feed mode</strong><small>Integration staging</small><span>Portal, Unity and Fleetio API/webhook feeds remain offline until database and API credentials are connected.</span></article>
            <article className="admin-setting-card"><strong>Build environment</strong><small>Protected Vercel production</small><span>Use the header development switcher to test access levels and region scope while TOC is being built.</span></article>
            <article className="admin-setting-card"><strong>Audit readiness</strong><small>Database planned</small><span>User, access, alert and setting changes will be logged once database-backed admin settings are connected.</span></article>
          </div>
        </Panel>
        <Panel wide eyebrow="Compliance setup" title="Admin-set compliance items" pill={`${compliance.length} active`}>
          <div className="admin-config-list">
            {compliance.map((item) => (
              <article className="admin-config-card" key={item.title}>
                <div><strong>{item.title}</strong><small>{item.region} - {item.type} - due {item.due}</small></div>
                <div className="meta-row"><Tag tone={item.severity}>{item.status}</Tag><Tag>Counts to Region Health</Tag></div>
              </article>
            ))}
          </div>
        </Panel>
        <Panel wide eyebrow="Stock setup" title="Approved stock order items" pill={`${approvedStockItems.length} approved`}>
          <div className="admin-config-grid">
            <div className="admin-config-list">
              {approvedStockItems.map((item) => <article className="admin-config-card" key={item}><strong>{item}</strong><small>Available in manager stock order dropdown</small></article>)}
            </div>
            <StockOrderAdminReview />
          </div>
        </Panel>
        <Panel wide eyebrow="Access control" title="Register users, access levels and region responsibility" pill="Admin only">
          <div className="access-rule-grid">
            {accessRules.map((rule) => (
              <article className="access-rule-card" key={rule.title}>
                <strong>{rule.title}</strong>
                <small>{rule.scope}</small>
                <p>{rule.detail}</p>
              </article>
            ))}
          </div>
          <AdminAccessManager />
        </Panel>
        <Panel wide eyebrow="Access model" title="Role visibility blueprint" pill="Build 0.113">
          <div className="role-blueprint-grid">
            {Object.values(sessionProfiles).map((profile) => {
              const pages = navigationItems.filter((item) => item.roles.includes(profile.role)).map((item) => item.label);
              return (
                <article className="role-blueprint-card" key={profile.role}>
                  <div>
                    <span className="eyebrow">{profile.scopeLabel}</span>
                    <h3>{profile.label}</h3>
                    <p>{profile.summary}</p>
                  </div>
                  <div className="role-page-list">
                    {profile.responsibilities.map((responsibility) => <Tag tone="green" key={responsibility}>{responsibility}</Tag>)}
                  </div>
                  <div className="role-page-list">
                    {pages.map((page) => <Tag key={page}>{page}</Tag>)}
                  </div>
                </article>
              );
            })}
          </div>
        </Panel>
        <Panel wide eyebrow="Permission map" title="Access level behaviour" pill="Database-ready">
          <div className="permission-matrix">
            <div className="permission-row header"><span>Area</span><span>Admin</span><span>Manager</span><span>Director</span></div>
            {permissionGroups.map((group) => (
              <div className="permission-row" key={group.area}>
                <strong>{group.area}</strong>
                <span>{group.admin}</span>
                <span>{group.manager}</span>
                <span>{group.director}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
