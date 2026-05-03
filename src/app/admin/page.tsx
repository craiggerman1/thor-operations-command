import { TocShell, PageIntro } from "@/components/TocShell";
import { AdminHintControls, FlowHeading, Panel, Tag } from "@/components/TocCards";
import { AdminAccessManager } from "@/components/AdminAccessManager";
import { StockOrderAdminReview } from "@/components/StockOrderAdminReview";
import { DirectorBroadcastControls, UrgentBroadcastControls } from "@/components/UrgentBroadcast";
import { approvedStockItems, compliance } from "@/lib/toc-data";
import { navigationItems } from "@/lib/access";

const pageSettings = [
  { page: "Home", owner: "Command signals and go-live pathway", control: "Set which national signals, roadmap items and Director scorecard items appear on Home.", state: "Mapped" },
  { page: "Action Centre", owner: "Action item workflow", control: "Create directives, assign due dates, set priority type and review manager close-out submissions.", state: "Next" },
  { page: "Region Health", owner: "Region scoring", control: "Tune region health scoring from open actions, compliance load and productivity score inputs.", state: "Mapped" },
  { page: "Compliance", owner: "Compliance action setup", control: "Set compliance actions, due dates, target regions and whether items count into Region Health.", state: "Active" },
  { page: "Inductions", owner: "Induction source and site mapping", control: "Manage read-only sheet source, site-region mapping and induction status display rules.", state: "Mapped" },
  { page: "Stock Orders", owner: "Stock catalogue and order review", control: "Approve orderable items, review requests, update tracking and manage national responses.", state: "Active" },
  { page: "Productivity", owner: "Productivity scoring", control: "Configure site score sources, manager response requirements and national review rules.", state: "Mapped" },
  { page: "Asset Tracking", owner: "Unity GPS integration", control: "Connect GPS asset feeds, map assets to regions and configure status visibility.", state: "Ready" },
  { page: "Calendar", owner: "Schedule control", control: "Manage calendar source, operating-week display, recurring job rules and regional schedule visibility.", state: "Mapped" },
  { page: "Staff Availability", owner: "Availability feed", control: "Manage read-only sheet source, availability windows, display status rules and region relevance.", state: "Mapped" },
  { page: "Equipment Servicing", owner: "Service feed integration", control: "Connect odometer/hour data, map assets to regions and define service alert thresholds.", state: "Ready" },
  { page: "Chat", owner: "Manager communications", control: "Set manager chat audiences, meeting links and future database-backed communication rules.", state: "Mapped" },
  { page: "Admin Settings", owner: "TOC control room", control: "Register users, assign access levels, assign regions, tune page settings and manage global notices.", state: "Active" },
  { page: "Jobsheets", owner: "Thor Portal integration", control: "Connect jobsheet feed, approval queue visibility and manager action routing.", state: "Ready" },
  { page: "To Do", owner: "Personal and shared tasks", control: "Configure shared task routing, importance handling and future user-specific persistence.", state: "Mapped" }
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
            <article className="admin-setting-card"><strong>Data feed mode</strong><small>Offline</small><span>Portal, Unity and Fleetio API/webhook feeds are controlled from this admin area once credentials are connected.</span></article>
            <article className="admin-setting-card"><strong>Build environment</strong><small>Protected Vercel production</small><span>Use the header development switcher to test access levels and region scope while TOC is being built.</span></article>
            <article className="admin-setting-card"><strong>Audit readiness</strong><small>Database required</small><span>User, access, alert and setting changes will be logged through database-backed admin settings.</span></article>
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
          <AdminAccessManager />
        </Panel>
        <Panel wide eyebrow="Page settings" title="TOC page control sections" pill={`${navigationItems.length} pages`}>
          <div className="admin-page-settings-grid">
            {pageSettings.map((setting) => (
              <article className="admin-page-setting-card" key={setting.page}>
                <div>
                  <strong>{setting.page}</strong>
                  <small>{setting.owner}</small>
                </div>
                <p>{setting.control}</p>
                <div className="meta-row"><Tag tone={setting.state === "Active" ? "green" : setting.state === "Ready" ? "amber" : "blue"}>{setting.state}</Tag></div>
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
