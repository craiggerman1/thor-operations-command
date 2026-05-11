"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { assignableRegions, sessionProfiles, type AccessRole } from "@/lib/access";
import { Tag } from "@/components/TocCards";
import { getTocRequestHeaders } from "@/lib/toc-client-auth";

type AdminAccessUser = {
  id: string;
  name: string;
  email?: string;
  reference: string;
  mobile?: string;
  whatsapp?: string;
  role: AccessRole;
  regions: string[];
  status: "Active" | "Disabled";
};

type AdminUserPatch = Partial<AdminAccessUser> & {
  password?: string;
};

type AdminUserDraft = {
  email: string;
  reference: string;
  mobile: string;
  whatsapp: string;
  password: string;
  confirmPassword: string;
};

const accessUsersKey = "toc.adminAccessUsers";
const previewToolsEnabled = process.env.NEXT_PUBLIC_TOC_ENABLE_VIEW_AS === "true";

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
    const response = await fetch("/api/admin/users", { headers: await getTocRequestHeaders(), cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || payload.connected === false) throw new Error(payload.error || "User database unavailable.");
    const users = (payload.users || []) as AdminAccessUser[];
    localStorage.setItem(accessUsersKey, JSON.stringify(users));
    return users;
  } catch (error) {
    if (error instanceof Error) console.warn(error.message);
    return [];
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
  const [mobile, setMobile] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [reference, setReference] = useState("");
  const [role, setRole] = useState<AccessRole>("manager");
  const [regions, setRegions] = useState<string[]>(["Brisbane"]);
  const [status, setStatus] = useState("");
  const [databaseReady, setDatabaseReady] = useState(true);
  const [userDrafts, setUserDrafts] = useState<Record<string, AdminUserDraft>>({});

  useEffect(() => {
    void fetchAccessUsers().then((nextUsers) => {
      setUsers(nextUsers);
      setDatabaseReady(true);
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(accessUsersKey, JSON.stringify(users));
    setUserDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      users.forEach((user) => {
        if (!nextDrafts[user.id]) {
          nextDrafts[user.id] = {
            email: user.email || "",
            reference: user.reference,
            mobile: user.mobile || "",
            whatsapp: user.whatsapp || "",
            password: "",
            confirmPassword: ""
          };
        }
      });
      Object.keys(nextDrafts).forEach((userId) => {
        if (!users.some((user) => user.id === userId)) delete nextDrafts[userId];
      });
      return nextDrafts;
    });
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
    if (password !== confirmPassword) {
      setStatus("Temporary passwords do not match.");
      return;
    }

    const nextRegions = normaliseRegionsForRole(role, regions);
    setStatus(`Creating secure TOC login for ${cleanName}...`);
    void saveUserMutation({
      action: "create",
      name: cleanName,
      email: email.trim(),
      mobile: mobile.trim(),
      whatsapp: whatsapp.trim(),
      password,
      reference: reference.trim() || "No reference supplied",
      role,
      regions: nextRegions
    }).then((saved) => {
      if (!saved) return;
      setName("");
      setEmail("");
      setMobile("");
      setWhatsapp("");
      setPassword("");
      setConfirmPassword("");
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
      void saveUserMutation({ action: "update", ...nextUser, id: userId, ...(nextPassword ? { password: nextPassword } : {}) }).then((saved) => {
        if (saved) setStatus(`${nextUser.name} access updated.`);
      });
    }
  }

  function updateDraft(userId: string, patch: Partial<AdminUserDraft>) {
    const blankDraft = {
      email: "",
      reference: "",
      mobile: "",
      whatsapp: "",
      password: "",
      confirmPassword: ""
    };

    setUserDrafts((currentDrafts) => ({
      ...currentDrafts,
      [userId]: {
        ...blankDraft,
        ...(currentDrafts[userId] || {}),
        ...patch
      }
    }));
  }

  function getUserDraft(user: AdminAccessUser) {
    return userDrafts[user.id] || {
      email: user.email || "",
      reference: user.reference,
      mobile: user.mobile || "",
      whatsapp: user.whatsapp || "",
      password: "",
      confirmPassword: ""
    };
  }

  function saveUserDetails(user: AdminAccessUser) {
    const draft = getUserDraft(user);
    if (!draft.email.trim()) {
      setStatus("Email address is required for secure TOC login.");
      return;
    }

    updateUser(user.id, {
      email: draft.email.trim(),
      reference: draft.reference.trim() || "No reference supplied",
      mobile: draft.mobile.trim(),
      whatsapp: draft.whatsapp.trim()
    });
  }

  function resetUserPassword(user: AdminAccessUser) {
    const draft = getUserDraft(user);
    if (draft.password.length < 8) {
      setStatus("New temporary password must be at least 8 characters.");
      return;
    }
    if (draft.password !== draft.confirmPassword) {
      setStatus("Reset passwords do not match.");
      return;
    }

    updateUser(user.id, { password: draft.password });
    updateDraft(user.id, { password: "", confirmPassword: "" });
    setStatus(`Password reset issued for ${user.name}. They will be required to set a new password on next sign in.`);
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

    const confirmed = window.confirm(`Are you sure you want to deregister ${target.name}? This deletes the TOC profile and Supabase Auth login.`);
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
    if (!previewToolsEnabled) {
      setStatus("Preview User View is disabled in secure mode.");
      return;
    }

    const profile = sessionProfiles[user.role];
    const assignedRegions = normaliseRegionsForRole(user.role, user.regions);
    const scope = assignedRegions[0] || profile.regions[0] || "National";
    const nextSession = { role: profile.role, label: profile.label, scope, regions: assignedRegions, authMode: "preview" };

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
        headers: await getTocRequestHeaders(true),
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (response.ok && result.users) {
        setDatabaseReady(true);
        setUsers(result.users);
        localStorage.setItem(accessUsersKey, JSON.stringify(result.users));
        window.dispatchEvent(new Event("toc.adminUsers.updated"));
        return true;
      } else if (result.error) {
        setDatabaseReady(false);
        setStatus(result.error);
      }
    } catch {
      setDatabaseReady(false);
      setStatus("User access could not be saved to the secure database.");
    }
    return false;
  }

  return (
    <div className="admin-access-console">
      <form className="admin-user-form" onSubmit={registerUser}>
        <div>
          <strong>Register user</strong>
          <small>Create a secure TOC login, assign access level, assign region responsibility and preview the exact view.</small>
        </div>
        <label><span>Name</span><input value={name} placeholder="User name" onChange={(event) => setName(event.target.value)} /></label>
        <label><span>Email address</span><input type="email" value={email} placeholder="user@thormobile.com.au" onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>Mobile phone</span><input inputMode="tel" value={mobile} placeholder="Manager mobile for Odin escalation" onChange={(event) => setMobile(event.target.value)} /></label>
        <label><span>WhatsApp / Telegram phone</span><input inputMode="tel" value={whatsapp} placeholder="Optional manager contact number" onChange={(event) => setWhatsapp(event.target.value)} /></label>
        <label><span>Temporary password</span><input type="password" value={password} placeholder="Minimum 8 characters" onChange={(event) => setPassword(event.target.value)} /></label>
        <label><span>Confirm password</span><input type="password" value={confirmPassword} placeholder="Retype temporary password" onChange={(event) => setConfirmPassword(event.target.value)} /></label>
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
        <button type="submit">{databaseReady ? "Register User" : "Retry Secure Register"}</button>
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
            {previewToolsEnabled ? (
              <div className="admin-user-control-note">
                <strong>Preview User View</strong>
                <span>Development tool only. It changes your current session to this user role and region view so you can test what they see.</span>
              </div>
            ) : null}
            <div className="admin-user-edit-grid">
              {(() => {
                const draft = getUserDraft(user);
                return (
                  <>
              <label>
                <span>Email address</span>
                <input value={draft.email} placeholder="user@thormobile.com.au" onChange={(event) => updateDraft(user.id, { email: event.target.value })} />
              </label>
              <label>
                <span>User reference</span>
                <input value={draft.reference} onChange={(event) => updateDraft(user.id, { reference: event.target.value })} />
              </label>
              <label>
                <span>Mobile phone</span>
                <input inputMode="tel" value={draft.mobile} placeholder="Manager mobile for Odin escalation" onChange={(event) => updateDraft(user.id, { mobile: event.target.value })} />
              </label>
              <label>
                <span>WhatsApp / Telegram phone</span>
                <input inputMode="tel" value={draft.whatsapp} placeholder="Optional manager contact number" onChange={(event) => updateDraft(user.id, { whatsapp: event.target.value })} />
              </label>
              <div className="admin-user-security-box">
                <strong>Password reset</strong>
                <small>Issue a temporary password. User must change it on next sign in.</small>
                <input type="password" value={draft.password} placeholder="New temporary password" onChange={(event) => updateDraft(user.id, { password: event.target.value })} />
                <input type="password" value={draft.confirmPassword} placeholder="Confirm temporary password" onChange={(event) => updateDraft(user.id, { confirmPassword: event.target.value })} />
                <button type="button" onClick={() => resetUserPassword(user)}>Issue Password Reset</button>
              </div>
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
              <div className="admin-user-save-strip">
                <button type="button" onClick={() => saveUserDetails(user)}>Save Profile Details</button>
                <small>Role and region changes save immediately. Profile details and password reset use the buttons above.</small>
              </div>
                  </>
                );
              })()}
            </div>
            <div className="admin-user-actions">
              {previewToolsEnabled ? <button type="button" onClick={() => previewUser(user)}>Preview User View</button> : null}
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
