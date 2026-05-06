import Link from "next/link";
import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { adminSettingStateLabels, pageSettings, type AdminPageSetting } from "@/lib/admin-settings";

export const dynamic = "force-dynamic";

const coreControls = [
  {
    title: "Users and Access",
    eyebrow: "Security",
    href: "/admin/settings/admin-settings",
    detail: "Register users, reset passwords, assign roles and control region responsibility.",
    status: "Admin only"
  },
  {
    title: "Staff Register",
    eyebrow: "People",
    href: "/admin/settings/staff-availability",
    detail: "Manage staff entities, skills, regions, sheet links and protected contact fields.",
    status: "Database active"
  },
  {
    title: "National Requests",
    eyebrow: "Approvals",
    href: "/admin/settings/national-requests",
    detail: "Review manager close-outs, returned items, stock requests and national follow-up work.",
    status: "Live queue"
  },
  {
    title: "Global Messages",
    eyebrow: "Broadcasts",
    href: "/admin/settings/admin-settings",
    detail: "Control urgent alerts, Director messages, operational news and page hints.",
    status: "Live controls"
  }
];

const groups: Array<{ title: string; detail: string; slugs: string[] }> = [
  {
    title: "Operations Flow",
    detail: "Pages that drive manager work, health scoring, productivity and close-out action.",
    slugs: ["home", "action-centre", "region-health", "productivity", "equipment-servicing", "compliance", "calendar"]
  },
  {
    title: "People And Communication",
    detail: "Staff readiness, inductions, manager task routing and communication controls.",
    slugs: ["inductions", "staff-availability", "to-do", "chat"]
  },
  {
    title: "Requests And Integrations",
    detail: "Stock ordering, national review, Unity, Thor Portal jobsheets and admin system settings.",
    slugs: ["stock-orders", "national-requests", "asset-tracking", "jobsheets", "admin-settings"]
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
      <FlowHeading eyebrow="Admin Settings" title="Use this page as the settings hub. Open the relevant control area before changing live TOC behaviour." />

      <section className="admin-settings-hub">
        <Panel wide eyebrow="Priority controls" title="Core admin controls" pill="Admin only">
          <div className="admin-core-control-grid">
            {coreControls.map((control) => (
              <Link className="admin-core-control-card actionable-card" href={control.href} key={control.title}>
                <span className="eyebrow">{control.eyebrow}</span>
                <strong>{control.title}</strong>
                <p>{control.detail}</p>
                <Tag>{control.status}</Tag>
              </Link>
            ))}
          </div>
        </Panel>

        {groups.map((group) => (
          <Panel wide eyebrow="Page controls" title={group.title} pill={`${group.slugs.length} sections`} key={group.title}>
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
