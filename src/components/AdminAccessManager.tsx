"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { assignableRegions, sessionProfiles, type AccessRole } from "@/lib/access";
import { Tag } from "@/components/TocCards";

type AdminAccessUser = {
  id: string;
  name: string;
  email?: string;
  reference: string;
  role: AccessRole;
  regions: string[];
  status: "Active" | "Disabled";
};

type AdminUserPatch = Partial<AdminAccessUser> & {
  password?: string;
};

const accessUsersKey = "toc.adminAccessUsers";

const initialAccessUsers: AdminAccessUser[] = [];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDatabaseUserId(id: string) {
  return uuidPattern.test(id);
}

function cleanUsers(users: AdminAccessUser[]) {
  return users.filter((user) => isDatabaseUserId(user.id));
}

function readAccessUsers() {
  if (typeof window === "undefined") return initialAccessUsers;

  try {
    const users = JSON.parse(localStorage.getItem(accessUsersKey) || "null") || initialAccessUsers;
    const clean = cleanUsers(users);
    if (clean.length !== users.length) localStorage.setItem(accessUsersKey, JSON.stringify(clean));
    return clean;
  } catch {
    return initialAccessUsers;
  }
}

async function fetchAccessUsers() {
  try {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || payload.connected === false) throw new Error(payload.error || "User database unavailable.");
    const users = (payload.users || []) as AdminAccessUser[];
    localStorage.setItem(accessUsersKey, JSON.stringify(users));
    return users;
  } catch {
    return readAccessUsers();
  }
}

function roleLabel(role: AccessRole) {
  if (role === "admin") return "Admin";
  if (role === "director") return "Director";
  return "Manager";
}

function normaliseRegionsForRole(role: AccessRole, regions: string[]) {
  const cleanRegions = Array.from(new Set(regions.filter(Boolean)));
  if (role === "director") return ["National"];
  if (role === "admin") return Array.from(new Set(["National", ...cleanRegions.filter((region) => region !== "National")]));
  if (cleanRegions.includes("National")) return ["National", ...cleanRegions.filter((region) => region !== "National")];
  return cleanRegions.length ? cleanRegions : ["Brisbane"];
}

export function AdminAccessManager() {
  const [users, setUsers] = useState<AdminAccessUser[]>(initialAccessUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reference, setReference] = useState("");
  const [role, setRole] = useState<AccessRole>("manager");
  const [regions, setRegions] = useState<string[]>(["Brisbane"]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void fetchAccessUsers().then(setUsers);
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
    if (!email.trim()) {
      setStatus("Email address is required for secure TOC login.");
      return;
    }
    if (password.length < 8) {
      setStatus("Temporary password must be at least 8 characters.");
      return;
    }

    const nextRegions = normaliseRegionsForRole(role, regions);
    setStatus(`Creating secure TOC login for ${cleanName}...`);
    void saveUserMutation({
      action: "create",
      name: cleanName,
      email: email.trim(),
      password,
      reference: reference.trim() || "No reference supplied",
      role,
      regions: nextRegions
    }).then((saved) => {
      if (!saved) return;
      setName("");
      setEmail("");
      setPassword("");
      setReference("");
      setRole("manager");
      setRegions(["Brisbane"]);
      setStatus(`${cleanName} registered for ${roleLabel(role)} access.`);
    });
  }

  function updateUser(userId: string, patch: AdminUserPatch) {
    const target = users.find((user) => user.id === userId);
    const { password: nextPassword, ...userPatch } = patch;
    const nextUser = target ? { ...target, ...userPatch } : null;
    setUsers((current) => current.map((user) => user.id === userId ? { ...user, ...userPatch } : user));
    if (nextUser) {
      if (!isDatabaseUserId(userId)) {
        setStatus("This legacy development user has been removed. Register the user again to create a live database profile.");
        setUsers((current) => current.filter((user) => user.id !== userId));
        return;
      }
      void saveUserMutation({ action: "update", ...nextUser, id: userId, ...(nextPassword ? { password: nextPassword } : {}) });
    }
  }

  function updateUserRole(user: AdminAccessUser, nextRole: AccessRole) {
    updateUser(user.id, { role: nextRole, regions: normaliseRegionsForRole(nextRole, user.regions) });
  }

  function toggleUserRegion(user: AdminAccessUser, region: string) {
    if (user.role === "director") return;
    if (user.role === "admin" && region === "National") return;

    const nextRegions = user.regions.includes(region)
      ? user.regions.filter((item) => item !== region)
      : [...user.regions, region];

    updateUser(user.id, { regions: normaliseRegionsForRole(user.role, nextRegions) });
  }

  function deregisterUser(userId: string) {
    const target = users.find((user) => user.id === userId);
    if (!target) return;

    const confirmed = window.confirm(`Are you sure you want to deregister ${target.name}?`);
    if (!confirmed) return;

    setUsers((current) => current.filter((user) => user.id !== userId));
    if (isDatabaseUserId(userId)) {
      void saveUserMutation({ action: "delete", id: userId });
    }
    setStatus(`${target.name} deregistered.`);
  }

  function toggleStatus(user: AdminAccessUser) {
    updateUser(user.id, { status: user.status === "Active" ? "Disabled" : "Active" });
  }

  function previewUser(user: AdminAccessUser) {
    const profile = sessionProfiles[user.role];
    const assignedRegions = normaliseRegionsForRole(user.role, user.regions);
    const scope = assignedRegions[0] || profile.regions[0] || "National";
    const nextSession = { role: profile.role, label: profile.label, scope, regions: assignedRegions };

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
        window.dispatchEvent(new Event("toc.adminUsers.updated"));
        return true;
      } else if (result.error) {
        setStatus(result.error);
      }
    } catch {
      setStatus("User access could not be saved to the secure database.");
    }
    return false;
  }

  return (
    <div className="admin-access-console">
      <form className="admin-user-form" onSubmit={registerUser}>
        <div>
          <strong>Register user</strong>
          <small>Create a staged TOC user profile, assign access level, assign region responsibility and preview the exact view.</small>
        </div>
        <label><span>Name</span><input value={name} placeholder="User name" onChange={(event) => setName(event.target.value)} /></label>
        <label><span>Email address</span><input type="email" value={email} placeholder="user@thormobile.com.au" onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>Temporary password</span><input type="password" value={password} placeholder="Minimum 8 characters" onChange={(event) => setPassword(event.target.value)} /></label>
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
        <small>Admin always keeps national command control. Managers only see assigned regions, including National if assigned. Director remains an owner overview role. Passwords are created in Supabase Auth and are not displayed again.</small>
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
              <div className="admin-user-title"><strong>{user.name}</strong><small>{user.email ? `${user.email} - ` : ""}{user.reference} - {isDatabaseUserId(user.id) ? user.id : "Legacy local profile"}</small></div>
              <div className="meta-row"><Tag>{roleLabel(user.role)}</Tag><Tag tone={user.status === "Active" ? "green" : "amber"}>{user.status}</Tag></div>
            </div>
            <div className="admin-user-edit-grid">
              <label>
                <span>Email address</span>
                <input defaultValue={user.email || ""} placeholder="user@thormobile.com.au" onBlur={(event) => updateUser(user.id, { email: event.target.value })} />
              </label>
              <label>
                <span>User reference</span>
                <input defaultValue={user.reference} onBlur={(event) => updateUser(user.id, { reference: event.target.value || "No reference supplied" })} />
              </label>
              <label>
                <span>Reset password</span>
                <input type="password" placeholder="New temporary password" onBlur={(event) => {
                  const nextPassword = event.target.value;
                  if (!nextPassword) return;
                  updateUser(user.id, { password: nextPassword });
                  event.target.value = "";
                }} />
              </label>
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
                      disabled={user.role === "director" || (user.role === "admin" && region === "National")}
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
