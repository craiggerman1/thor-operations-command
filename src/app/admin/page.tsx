import { TocShell, PageIntro } from "@/components/TocShell";
import { AdminHintControls, FlowHeading, Panel, Tag } from "@/components/TocCards";
import { StockOrderAdminReview } from "@/components/StockOrderAdminReview";
import { UrgentBroadcastControls } from "@/components/UrgentBroadcast";
import { adminUsers, approvedStockItems, compliance } from "@/lib/toc-data";
import { navigationItems, sessionProfiles } from "@/lib/access";

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
        <Panel wide eyebrow="Admin command" title="User access and permissions" pill={`${adminUsers.length} access profiles`}>
          <div className="admin-layout">
            <form className="admin-user-form">
              <label><span>Name</span><input placeholder="User name" /></label>
              <label><span>User reference</span><input placeholder="Demo user reference" /></label>
              <label><span>Access level</span><select defaultValue="manager"><option>Manager</option><option>Workshop</option><option>National Ops</option><option>Director</option><option>Admin</option></select></label>
              <fieldset><legend>Regions visible</legend><label><input type="checkbox" /> Brisbane</label><label><input type="checkbox" /> Sydney</label><label><input type="checkbox" /> Melbourne</label><label><input type="checkbox" /> Workshop</label></fieldset>
              <button type="button">Create user access</button>
            </form>
            <div className="admin-user-list">
              {adminUsers.map((user) => (
                <article className="admin-user-card" key={user.id}>
                  <div><strong>{user.name}</strong><small>User ID: {user.id}</small></div>
                  <div className="meta-row"><Tag>{user.role}</Tag><Tag tone="green">{user.regions}</Tag></div>
                  <small>Can use: {user.permissions}</small>
                </article>
              ))}
            </div>
          </div>
        </Panel>
        <Panel wide eyebrow="Access model" title="Role visibility blueprint" pill="Build 0.101">
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
                    {pages.map((page) => <Tag key={page}>{page}</Tag>)}
                  </div>
                </article>
              );
            })}
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
