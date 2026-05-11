import Link from "next/link";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { TocShell, PageIntro } from "@/components/TocShell";
import { AdminHintControls, FlowHeading, Panel, Tag } from "@/components/TocCards";
import { adminSettingStateDescriptions, adminSettingStateLabels, pageSettings } from "@/lib/admin-settings";

type PageProps = {
  params: Promise<{ page: string }>;
};

function SettingManagerLoading() {
  return <div className="settings-loading">Loading settings controls...</div>;
}

const AdminAccessManager = dynamic(() => import("@/components/AdminAccessManager").then((mod) => mod.AdminAccessManager), { loading: SettingManagerLoading });
const AdminActionManager = dynamic(() => import("@/components/AdminActionManager").then((mod) => mod.AdminActionManager), { loading: SettingManagerLoading });
const AdminCalendarManager = dynamic(() => import("@/components/AdminCalendarManager").then((mod) => mod.AdminCalendarManager), { loading: SettingManagerLoading });
const AdminChatManager = dynamic(() => import("@/components/AdminChatManager").then((mod) => mod.AdminChatManager), { loading: SettingManagerLoading });
const AdminComplianceManager = dynamic(() => import("@/components/AdminComplianceManager").then((mod) => mod.AdminComplianceManager), { loading: SettingManagerLoading });
const AdminEquipmentManager = dynamic(() => import("@/components/AdminEquipmentManager").then((mod) => mod.AdminEquipmentManager), { loading: SettingManagerLoading });
const AdminHomeManager = dynamic(() => import("@/components/AdminHomeManager").then((mod) => mod.AdminHomeManager), { loading: SettingManagerLoading });
const AdminIntegrationSourceManager = dynamic(() => import("@/components/AdminIntegrationSourceManager").then((mod) => mod.AdminIntegrationSourceManager), { loading: SettingManagerLoading });
const AdminOperationsMasterData = dynamic(() => import("@/components/AdminOperationsMasterData").then((mod) => mod.AdminOperationsMasterData), { loading: SettingManagerLoading });
const AdminProductivityManager = dynamic(() => import("@/components/AdminProductivityManager").then((mod) => mod.AdminProductivityManager), { loading: SettingManagerLoading });
const AdminRegionHealthManager = dynamic(() => import("@/components/AdminRegionHealthManager").then((mod) => mod.AdminRegionHealthManager), { loading: SettingManagerLoading });
const AdminSheetSourceManager = dynamic(() => import("@/components/AdminSheetSourceManager").then((mod) => mod.AdminSheetSourceManager), { loading: SettingManagerLoading });
const AdminStaffManager = dynamic(() => import("@/components/AdminStaffManager").then((mod) => mod.AdminStaffManager), { loading: SettingManagerLoading });
const AdminStockCatalogManager = dynamic(() => import("@/components/AdminStockCatalogManager").then((mod) => mod.AdminStockCatalogManager), { loading: SettingManagerLoading });
const AdminTodoManager = dynamic(() => import("@/components/AdminTodoManager").then((mod) => mod.AdminTodoManager), { loading: SettingManagerLoading });
const DirectorBroadcastControls = dynamic(() => import("@/components/UrgentBroadcast").then((mod) => mod.DirectorBroadcastControls), { loading: SettingManagerLoading });
const UrgentBroadcastControls = dynamic(() => import("@/components/UrgentBroadcast").then((mod) => mod.UrgentBroadcastControls), { loading: SettingManagerLoading });
const OperationsNewsControls = dynamic(() => import("@/components/OperationsNewsControls").then((mod) => mod.OperationsNewsControls), { loading: SettingManagerLoading });
const AdminAuditTrail = dynamic(() => import("@/components/AdminAuditTrail").then((mod) => mod.AdminAuditTrail), { loading: SettingManagerLoading });
const OdinConfidenceCentre = dynamic(() => import("@/components/OdinConfidenceCentre").then((mod) => mod.OdinConfidenceCentre), { loading: SettingManagerLoading });
const NationalActionRequests = dynamic(() => import("@/components/NationalActionRequests").then((mod) => mod.NationalActionRequests), { loading: SettingManagerLoading });
const StockOrderAdminReview = dynamic(() => import("@/components/StockOrderAdminReview").then((mod) => mod.StockOrderAdminReview), { loading: SettingManagerLoading });

export default async function AdminPageSettingDetail({ params }: PageProps) {
  const { page } = await params;
  const setting = pageSettings.find((item) => item.slug === page);

  if (!setting) notFound();

  return (
    <TocShell>
      <PageIntro title="Admin Settings" detail={`${setting.page} settings.`} />
      <FlowHeading eyebrow="Page Settings" title={`${setting.page} control settings`} />
      <section className="command-grid route-grid">
        <Panel wide eyebrow={setting.owner} title={setting.page} pill={adminSettingStateLabels[setting.state]}>
          <div className="admin-setting-detail">
            <p>{setting.control}</p>
            <div className="meta-row">
              <Tag tone={setting.state === "Active" ? "green" : setting.state === "Ready" ? "amber" : "blue"}>{adminSettingStateLabels[setting.state]}</Tag>
              <Tag>Admin controlled</Tag>
            </div>
            <small>{adminSettingStateDescriptions[setting.state]}</small>
            <Link className="node-action" href="/admin">Back to Admin Settings</Link>
          </div>
        </Panel>
        {setting.slug === "admin-settings" ? (
          <Panel wide eyebrow="Admin Settings" title="Settings hub">
            <div className="admin-setting-detail">
              <p>Admin controls have been separated into dedicated settings pages so each control area stays clear and manageable.</p>
              <div className="meta-row">
                <Link className="node-action" href="/admin/settings/user-access">User Access</Link>
                <Link className="node-action" href="/admin/settings/staff-register">Staff Register</Link>
                <Link className="node-action" href="/admin/settings/operations-master">Operations Master Data</Link>
                <Link className="node-action" href="/admin/settings/messages">Messages And Hints</Link>
                <Link className="node-action" href="/admin/settings/audit-trail">Audit Trail</Link>
              </div>
            </div>
          </Panel>
        ) : null}
        {setting.slug === "user-access" ? (
          <Panel wide eyebrow="Access control" title="Register users, access levels and region responsibility">
            <AdminAccessManager />
          </Panel>
        ) : null}
        {setting.slug === "staff-register" ? (
          <Panel wide eyebrow="Staff entities" title="Staff register, regions, skills and protected contacts">
            <AdminStaffManager />
          </Panel>
        ) : null}
        {setting.slug === "operations-master" ? (
          <Panel wide eyebrow="Operations master data" title="Customer/site register and recurring schedules">
            <AdminOperationsMasterData />
          </Panel>
        ) : null}
        {setting.slug === "messages" ? (
          <>
            <Panel wide eyebrow="Guidance controls" title="Page hints">
              <AdminHintControls />
            </Panel>
            <Panel wide eyebrow="Operations news" title="Title bar news control">
              <OperationsNewsControls />
            </Panel>
            <Panel wide eyebrow="Urgent broadcast" title="Urgent notice control">
              <UrgentBroadcastControls />
            </Panel>
            <Panel wide eyebrow="Director broadcast" title="Director message control">
              <DirectorBroadcastControls />
            </Panel>
          </>
        ) : null}
        {setting.slug === "audit-trail" ? (
          <Panel wide eyebrow="Audit trail" title="Odin, security and admin activity">
            <AdminAuditTrail />
          </Panel>
        ) : null}
        {setting.slug === "odin-confidence" ? (
          <Panel wide eyebrow="Odin Confidence" title="Data quality and routing trust">
            <OdinConfidenceCentre />
          </Panel>
        ) : null}
        {setting.slug === "national-requests" ? (
          <>
            <Panel wide eyebrow="Manager requests" title="Action close-outs awaiting national review">
              <NationalActionRequests />
            </Panel>
            <Panel wide eyebrow="Stock requests" title="Stock order requests from regions">
              <StockOrderAdminReview />
            </Panel>
          </>
        ) : null}
        {setting.slug === "stock-orders" ? (
          <Panel wide eyebrow="Stock Orders" title="Stock catalogue and order review">
            <AdminStockCatalogManager />
          </Panel>
        ) : null}
        {setting.slug === "home" ? (
          <Panel wide eyebrow="Home" title="Command entry and roadmap control">
            <AdminHomeManager />
          </Panel>
        ) : null}
        {setting.slug === "action-centre" ? (
          <Panel wide eyebrow="Action Centre" title="Admin-issued action directives">
            <AdminActionManager />
          </Panel>
        ) : null}
        {setting.slug === "compliance" ? (
          <Panel wide eyebrow="Compliance" title="Admin-set compliance items">
            <AdminComplianceManager />
          </Panel>
        ) : null}
        {setting.slug === "equipment-servicing" ? (
          <Panel wide eyebrow="Equipment Servicing" title="Equipment register and service action control">
            <AdminEquipmentManager />
          </Panel>
        ) : null}
        {setting.slug === "productivity" ? (
          <Panel wide eyebrow="Productivity" title="Site productivity source control">
            <AdminProductivityManager />
          </Panel>
        ) : null}
        {setting.slug === "calendar" ? (
          <Panel wide eyebrow="Calendar" title="Schedule job source control">
            <AdminCalendarManager />
          </Panel>
        ) : null}
        {setting.slug === "chat" ? (
          <Panel wide eyebrow="Chat" title="Manager communication control">
            <AdminChatManager />
          </Panel>
        ) : null}
        {setting.slug === "to-do" ? (
          <Panel wide eyebrow="To Do" title="Manager task routing control">
            <AdminTodoManager />
          </Panel>
        ) : null}
        {setting.slug === "region-health" ? (
          <Panel wide eyebrow="Region Health" title="Scoreboard scoring control">
            <AdminRegionHealthManager />
          </Panel>
        ) : null}
        {setting.slug === "asset-tracking" ? (
          <Panel wide eyebrow="Asset Tracking" title="Unity GPS source control">
            <AdminIntegrationSourceManager slug="asset-tracking" label="Asset Tracking" />
          </Panel>
        ) : null}
        {setting.slug === "jobsheets" ? (
          <Panel wide eyebrow="Jobsheets" title="Thor Portal source control">
            <AdminIntegrationSourceManager slug="jobsheets" label="Jobsheets" />
          </Panel>
        ) : null}
        {setting.slug === "staff-availability" ? (
          <Panel wide eyebrow="Staff Availability" title="Availability sheet source control">
            <AdminSheetSourceManager slug="staff-availability" label="Staff Availability" />
          </Panel>
        ) : null}
        {setting.slug === "inductions" ? (
          <Panel wide eyebrow="Inductions" title="Induction sheet source control">
            <AdminSheetSourceManager slug="inductions" label="Inductions" />
          </Panel>
        ) : null}
      </section>
    </TocShell>
  );
}
