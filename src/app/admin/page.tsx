import { TocShell, PageIntro } from "@/components/TocShell";
import { Panel, Tag } from "@/components/TocCards";
import { adminUsers } from "@/lib/toc-data";
import { navigationItems, sessionProfiles } from "@/lib/access";

export default function AdminPage() {
  return (
    <TocShell>
      <PageIntro title="Admin" detail="User access, role permissions, region visibility and admin setup controls." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Admin command" title="User access and permissions" pill={`${adminUsers.length} demo users`}>
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
        <Panel wide eyebrow="Access model" title="Role visibility blueprint" pill="Build 0.054">
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
