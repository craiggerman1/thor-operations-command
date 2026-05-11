import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { adminSettingStateLabels, pageSettings, type AdminPageSetting } from "@/lib/admin-settings";

export const dynamic = "force-dynamic";

const groups: Array<{ title: string; detail: string; slugs: string[] }> = [
  {
    title: "Access And System",
    detail: "Security, users, staff records, global messages, audit history and Odin confidence.",
    slugs: ["user-access", "staff-register", "messages", "audit-trail", "odin-confidence"]
  },
  {
    title: "Operations Flow",
    detail: "Settings that control the main manager workflow, scoring and day-to-day operational pages.",
    slugs: ["home", "action-centre", "region-health", "productivity", "equipment-servicing", "compliance", "calendar"]
  },
  {
    title: "People And Communication",
    detail: "Staff readiness source feeds, induction source feeds, shared task routing and manager communication controls.",
    slugs: ["staff-availability", "inductions", "to-do", "chat"]
  },
  {
    title: "Requests And Integrations",
    detail: "National review queues, stock control, GPS/Unity and Thor Portal jobsheet source settings.",
    slugs: ["national-requests", "stock-orders", "asset-tracking", "jobsheets"]
  }
];

function settingBySlug(slug: string) {
  return pageSettings.find((setting) => setting.slug === slug);
}

function stateTone(state: AdminPageSetting["state"]) {
  return state === "Active" ? "green" : state === "Ready" ? "amber" : "blue";
}

function SettingCard({ setting }: { setting: AdminPageSetting }) {
  return (
    <Link className="admin-page-setting-card actionable-card compact-setting-card" href={`/admin/settings/${setting.slug}`}>
      <div>
        <strong>{setting.page}</strong>
        <small>{setting.owner}</small>
      </div>
      <p>{setting.control}</p>
      <div className="meta-row">
        <Tag tone={stateTone(setting.state)}>{adminSettingStateLabels[setting.state]}</Tag>
      </div>
    </Link>
  );
}

export default function AdminPage() {
  return (
    <TocShell>
      <PageIntro title="Admin Settings" detail="Central settings hub for TOC access, page controls, staff, broadcasts and operational configuration." />
      <FlowHeading eyebrow="Admin Settings" title="Open the exact settings area you need, then change the live TOC control from that page." />

      <section className="admin-settings-hub">
        {groups.map((group) => (
          <Panel wide eyebrow="Settings group" title={group.title} pill={`${group.slugs.length} controls`} key={group.title}>
            <div className="admin-settings-group-head">
              <p>{group.detail}</p>
            </div>
            <div className="admin-page-settings-grid compact-page-settings-grid">
              {group.slugs.map(settingBySlug).filter(Boolean).map((setting) => (
                <SettingCard setting={setting as AdminPageSetting} key={(setting as AdminPageSetting).slug} />
              ))}
            </div>
          </Panel>
        ))}
      </section>
    </TocShell>
  );
}
