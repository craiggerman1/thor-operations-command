"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { assignableRegions, sessionProfiles, type AccessRole } from "@/lib/access";
import { Tag } from "@/components/TocCards";

type AdminAccessUser = {
  id: string;
  name: string;
  reference: string;
  role: AccessRole;
  regions: string[];
  status: "Active" | "Disabled";
};

const accessUsersKey = "toc.adminAccessUsers";

const initialAccessUsers: AdminAccessUser[] = [
  { id: "TOC-ADMIN", name: "Admin User", reference: "Admin profile", role: "admin", regions: ["National", "Brisbane"], status: "Active" },
  { id: "TOC-DIRECTOR", name: "Director User", reference: "Owner profile", role: "director", regions: ["National"], status: "Active" },
  { id: "TOC-MANAGER", name: "Manager User", reference: "Manager profile", role: "manager", regions: ["Sydney", "Workshop"], status: "Active" }
];

function readAccessUsers() {
  if (typeof window === "undefined") return initialAccessUsers;

  try {
    return JSON.parse(localStorage.getItem(accessUsersKey) || "null") || initialAccessUsers;
  } catch {
    return initialAccessUsers;
  }
}

async function fetchAccessUsers() {
  try {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const payload = await response.json();
    return (payload.users || []) as AdminAccessUser[];
  } catch {
    return readAccessUsers();
  }
}

function roleLabel(role: AccessRole) {
  if (role === "admin") return "Admin";
  if (role === "director") return "Director";
  return "Manager";
}

function createUserId(name: string) {
  const cleaned = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `TOC-${cleaned || Date.now()}`;
}

export function AdminAccessManager() {
  const [users, setUsers] = useState<AdminAccessUser[]>(initialAccessUsers);
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [role, setRole] = useState<AccessRole>("manager");
  const [regions, setRegions] = useState<string[]>(["Brisbane"]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void fetchAccessUsers().then((nextUsers) => setUsers(nextUsers.length ? nextUsers : readAccessUsers()));
  }, []);

  useEffect(() => {
    localStorage.setItem(accessUsersKey, JSON.stringify(users));
  }, [users]);

  const activeUsers = useMemo(() => users.filter((user) => user.status === "Active").length, [users]);

  function toggleFormRegion(region: string) {
    setRegions((current) => {
      if (current.includes(region)) {
        const next = current.filter((item) => item !== region);
        return next.length ? next : [region];
      }

      return [...current, region];
    });
  }

  function registerUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    const nextRegions = role === "director" ? ["National"] : role === "admin" ? ["National", ...regions.filter((region) => region !== "National")] : regions;
    const nextUser: AdminAccessUser = {
      id: createUserId(cleanName),
      name: cleanName,
      reference: reference.trim() || "No reference supplied",
      role,
      regions: nextRegions,
      status: "Active"
    };

    setUsers((current) => [nextUser, ...current]);
    void saveUserMutation({ action: "create", name: cleanName, reference: nextUser.reference, role: nextUser.role, regions: nextUser.regions });
    setName("");
    setReference("");
    setRole("manager");
    setRegions(["Brisbane"]);
    setStatus(`${cleanName} registered for ${roleLabel(nextUser.role)} access.`);
  }

  function updateUser(userId: string, patch: Partial<AdminAccessUser>) {
    const target = users.find((user) => user.id === userId);
    const nextUser = target ? { ...target, ...patch } : null;
    setUsers((current) => current.map((user) => user.id === userId ? { ...user, ...patch } : user));
    if (nextUser) void saveUserMutation({ action: "update", ...nextUser, id: userId });
  }

  function updateUserRole(user: AdminAccessUser, nextRole: AccessRole) {
    const nextRegions = nextRole === "director" ? ["National"] : nextRole === "admin" ? Array.from(new Set(["National", ...user.regions.filter((region) => region !== "National")])) : user.regions.filter((region) => region !== "National");
    updateUser(user.id, { role: nextRole, regions: nextRegions.length ? nextRegions : ["Brisbane"] });
  }

  function toggleUserRegion(user: AdminAccessUser, region: string) {
    const currentRegions = user.regions.filter((item) => item !== "National");
    const nextRegions = currentRegions.includes(region)
      ? currentRegions.filter((item) => item !== region)
      : [...currentRegions, region];

    if (user.role === "director") return;
    updateUser(user.id, { regions: user.role === "admin" ? ["National", ...(nextRegions.length ? nextRegions : [region])] : nextRegions.length ? nextRegions : [region] });
  }

  function deregisterUser(userId: string) {
    const target = users.find((user) => user.id === userId);
    if (!target) return;

    const confirmed = window.confirm(`Are you sure you want to deregister ${target.name}?`);
    if (!confirmed) return;

    setUsers((current) => current.filter((user) => user.id !== userId));
    void saveUserMutation({ action: "delete", id: userId });
    setStatus(`${target.name} deregistered.`);
  }

  function toggleStatus(user: AdminAccessUser) {
    updateUser(user.id, { status: user.status === "Active" ? "Disabled" : "Active" });
  }

  function previewUser(user: AdminAccessUser) {
    const profile = sessionProfiles[user.role];
    const scope = user.regions[0] || profile.regions[0] || "National";
    const nextSession = { role: profile.role, label: profile.label, scope };

    localStorage.setItem("toc.session", JSON.stringify(nextSession));
    document.body.dataset.access = profile.role;
    window.dispatchEvent(new CustomEvent("toc.sessionchange", { detail: nextSession }));
    window.dispatchEvent(new CustomEvent("toc.scopechange", { detail: { scope } }));
    setStatus(`Previewing ${user.name} as ${roleLabel(user.role)} - ${scope}.`);
  }

  async function saveUserMutation(payload: Record<string, unknown>) {
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (response.ok && result.users) {
        setUsers(result.users);
        localStorage.setItem(accessUsersKey, JSON.stringify(result.users));
      } else if (result.error) {
        setStatus(result.error);
      }
    } catch {
      setStatus("User access saved locally, but database update failed.");
    }
  }

  return (
    <div className="admin-access-console">
      <form className="admin-user-form" onSubmit={registerUser}>
        <div>
          <strong>Register user</strong>
          <small>Create a staged TOC user profile, assign access level, assign region responsibility and preview the exact view.</small>
        </div>
        <label><span>Name</span><input value={name} placeholder="User name" onChange={(event) => setName(event.target.value)} /></label>
        <label><span>User reference</span><input value={reference} placeholder="Employee ID or internal reference" onChange={(event) => setReference(event.target.value)} /></label>
        <label>
          <span>Access level</span>
          <select value={role} onChange={(event) => setRole(event.target.value as AccessRole)}>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="director">Director</option>
          </select>
        </label>
        <fieldset disabled={role === "director"}>
          <legend>Assigned region responsibility</legend>
          {assignableRegions.map((region) => <label key={region}><input checked={regions.includes(region)} type="checkbox" onChange={() => toggleFormRegion(region)} /> {region}</label>)}
        </fieldset>
        <small>Admin always keeps national command control. Managers only see assigned regions. Director remains an owner overview role.</small>
        <button type="submit">Register User</button>
      </form>

      <div className="admin-access-list">
        <div className="admin-access-summary">
          <article><span>Total users</span><strong>{users.length}</strong></article>
          <article><span>Active</span><strong>{activeUsers}</strong></article>
          <article><span>Access levels</span><strong>3</strong></article>
        </div>
        {users.map((user) => (
          <article className={`admin-user-card ${user.status === "Disabled" ? "disabled" : ""}`} key={user.id}>
            <div className="admin-user-head">
              <div><strong>{user.name}</strong><small>{user.reference} - {user.id}</small></div>
              <div className="meta-row"><Tag>{roleLabel(user.role)}</Tag><Tag tone={user.status === "Active" ? "green" : "amber"}>{user.status}</Tag></div>
            </div>
            <div className="admin-user-edit-grid">
              <label>
                <span>Access level</span>
                <select value={user.role} onChange={(event) => updateUserRole(user, event.target.value as AccessRole)}>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="director">Director</option>
                </select>
              </label>
              <div>
                <span className="field-label">Assigned regions</span>
                <div className="admin-region-picker">
                  {assignableRegions.map((region) => (
                    <button
                      className={user.regions.includes(region) ? "selected" : ""}
                      disabled={user.role === "director"}
                      key={region}
                      type="button"
                      onClick={() => toggleUserRegion(user, region)}
                    >
                      {region}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="admin-user-actions">
              <button type="button" onClick={() => previewUser(user)}>Preview User View</button>
              <button type="button" onClick={() => toggleStatus(user)}>{user.status === "Active" ? "Disable User" : "Reactivate User"}</button>
              <button className="danger-button" type="button" onClick={() => deregisterUser(user.id)}>Deregister User</button>
            </div>
          </article>
        ))}
        {status ? <small className="admin-hint-message">{status}</small> : null}
      </div>
    </div>
  );
}
