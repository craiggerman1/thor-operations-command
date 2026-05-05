import Link from "next/link";
import { notFound } from "next/navigation";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { AdminActionManager } from "@/components/AdminActionManager";
import { approvedStockItems, compliance } from "@/lib/toc-data";
import { pageSettings } from "@/lib/admin-settings";

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
        <Panel wide eyebrow={setting.owner} title={setting.page} pill={setting.state}>
          <div className="admin-setting-detail">
            <p>{setting.control}</p>
            <div className="meta-row">
              <Tag tone={setting.state === "Active" ? "green" : setting.state === "Ready" ? "amber" : "blue"}>{setting.state}</Tag>
              <Tag>Admin controlled</Tag>
            </div>
            <Link className="node-action" href="/admin">Back to Admin Settings</Link>
          </div>
        </Panel>
        {setting.slug === "stock-orders" ? (
          <Panel wide eyebrow="Stock Orders" title="Stock catalogue and order review">
            <div className="admin-config-list compact-config-list">
              {approvedStockItems.map((item) => (
                <article className="admin-config-card" key={item}>
                  <strong>{item}</strong>
                  <small>Available in manager stock order dropdown</small>
                </article>
              ))}
            </div>
          </Panel>
        ) : null}
        {setting.slug === "action-centre" ? (
          <Panel wide eyebrow="Action Centre" title="Admin-issued action directives">
            <AdminActionManager />
          </Panel>
        ) : null}
        {setting.slug === "compliance" ? (
          <Panel wide eyebrow="Compliance" title="Admin-set compliance items">
            <div className="admin-config-list compact-config-list">
              {compliance.map((item) => (
                <article className="admin-config-card" key={item.title}>
                  <div><strong>{item.title}</strong><small>{item.region} - {item.type} - due {item.due}</small></div>
                  <div className="meta-row"><Tag tone={item.severity}>{item.status}</Tag><Tag>Counts to Region Health</Tag></div>
                </article>
              ))}
            </div>
          </Panel>
        ) : null}
      </section>
    </TocShell>
  );
}
