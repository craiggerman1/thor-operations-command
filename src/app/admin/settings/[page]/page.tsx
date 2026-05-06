import Link from "next/link";
import { notFound } from "next/navigation";
import { TocShell, PageIntro } from "@/components/TocShell";
import { AdminHintControls, FlowHeading, Panel, Tag } from "@/components/TocCards";
import { AdminAccessManager } from "@/components/AdminAccessManager";
import { AdminActionManager } from "@/components/AdminActionManager";
import { AdminCalendarManager } from "@/components/AdminCalendarManager";
import { AdminChatManager } from "@/components/AdminChatManager";
import { AdminComplianceManager } from "@/components/AdminComplianceManager";
import { AdminEquipmentManager } from "@/components/AdminEquipmentManager";
import { AdminHomeManager } from "@/components/AdminHomeManager";
import { AdminIntegrationSourceManager } from "@/components/AdminIntegrationSourceManager";
import { AdminProductivityManager } from "@/components/AdminProductivityManager";
import { AdminRegionHealthManager } from "@/components/AdminRegionHealthManager";
import { AdminSheetSourceManager } from "@/components/AdminSheetSourceManager";
import { AdminStaffManager } from "@/components/AdminStaffManager";
import { AdminStockCatalogManager } from "@/components/AdminStockCatalogManager";
import { AdminTodoManager } from "@/components/AdminTodoManager";
import { DirectorBroadcastControls, UrgentBroadcastControls } from "@/components/UrgentBroadcast";
import { OperationsNewsControls } from "@/components/OperationsNewsControls";
import { NationalActionRequests } from "@/components/NationalActionRequests";
import { StockOrderAdminReview } from "@/components/StockOrderAdminReview";
import { adminSettingStateDescriptions, adminSettingStateLabels, pageSettings } from "@/lib/admin-settings";

type PageProps = {
  params: Promise<{ page: string }>;
};

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
          <>
            <Panel wide eyebrow="Access control" title="Register users, access levels and region responsibility">
              <AdminAccessManager />
            </Panel>
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
          <>
            <Panel wide eyebrow="Staff Availability" title="Availability sheet source control">
              <AdminSheetSourceManager slug="staff-availability" label="Staff Availability" />
            </Panel>
            <Panel wide eyebrow="Staff entities" title="Staff register, regions, skills and protected contacts">
              <AdminStaffManager />
            </Panel>
          </>
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
