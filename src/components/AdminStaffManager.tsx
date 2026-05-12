"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Tag } from "@/components/TocCards";
import { tocFetch } from "@/lib/toc-client-auth";
import { allRegions } from "@/lib/access";

type StaffEntity = {
  id: string;
  name: string;
  preferredName: string | null;
  regions: string[];
  primaryRegion: string;
  role: string;
  status: "active" | "inactive" | "watch";
  skills: string[];
  reliabilityNotes: string;
  preferredWindows: Record<string, unknown>;
  availabilitySheetName: string;
  inductionSheetName: string;
  contactVisibleToOdin?: boolean;
  contact?: {
    mobile: string | null;
    whatsapp: string | null;
    emergencyContact: Record<string, unknown>;
  };
  availability: {
    availableWindows: number;
    totalWindows: number;
  };
  inductions: {
    eligibleSites: string[];
  };
  source?: "database" | "availability_sheet";
};

type StaffDraft = {
  name: string;
  preferredName: string;
  role: string;
  status: "active" | "inactive" | "watch";
  regions: string[];
  primaryRegion: string;
  skills: string[];
  reliabilityNotes: string;
  availabilitySheetName: string;
  inductionSheetName: string;
  mobile: string;
  whatsapp: string;
  contactVisibleToOdin: boolean;
};

type StaffPayload = {
  connected: boolean;
  source: "database" | "availability_sheet";
  error: string | null;
  staff: StaffEntity[];
};

async function readStaffPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(response.ok ? "Staff database returned an empty response." : `Staff database request failed with no response body (${response.status}).`);
  }

  try {
    return JSON.parse(text) as StaffPayload;
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 140);
    throw new Error(preview ? `Staff database returned an unreadable response: ${preview}` : "Staff database returned an unreadable response.");
  }
}

const staffRegions = allRegions.filter((region) => region !== "National");
const staffSkillOptions = ["Wash Hand", "Driver", "Team Leader"];
const staffRoleOptions = ["Wash Hand", "Driver", "Team Leader", "Supervisor", "Manager"];

function blankDraft(): StaffDraft {
  return {
    name: "",
    preferredName: "",
    role: "Wash Hand",
    status: "active",
    regions: ["Brisbane"],
    primaryRegion: "Brisbane",
    skills: [],
    reliabilityNotes: "",
    availabilitySheetName: "",
    inductionSheetName: "",
    mobile: "",
    whatsapp: "",
    contactVisibleToOdin: true
  };
}

function normaliseRegions(regions: string[], primaryRegion: string) {
  const cleanRegions = Array.from(new Set(regions.filter((region) => staffRegions.includes(region))));
  const cleanPrimary = staffRegions.includes(primaryRegion) ? primaryRegion : cleanRegions[0] || "Brisbane";
  return Array.from(new Set([cleanPrimary, ...cleanRegions]));
}

function normaliseSkills(skills: string[]) {
  return staffSkillOptions.filter((skill) => skills.includes(skill));
}

function draftFromStaff(staff: StaffEntity): StaffDraft {
  const primaryRegion = staffRegions.includes(staff.primaryRegion) ? staff.primaryRegion : "Brisbane";
  return {
    name: staff.name,
    preferredName: staff.preferredName || "",
    role: staff.role || "Wash Hand",
    status: staff.status,
    regions: normaliseRegions(staff.regions, primaryRegion),
    primaryRegion,
    skills: normaliseSkills(staff.skills),
    reliabilityNotes: staff.reliabilityNotes,
    availabilitySheetName: staff.availabilitySheetName,
    inductionSheetName: staff.inductionSheetName,
    mobile: staff.contact?.mobile || "",
    whatsapp: staff.contact?.whatsapp || "",
    contactVisibleToOdin: staff.contactVisibleToOdin !== false
  };
}

function buildStaffPayload(action: "create" | "update", draft: StaffDraft, id?: string) {
  const regions = normaliseRegions(draft.regions, draft.primaryRegion);
  const primaryRegion = regions.includes(draft.primaryRegion) ? draft.primaryRegion : regions[0];

  return {
    action,
    id,
    name: draft.name.trim(),
    preferredName: draft.preferredName.trim(),
    role: draft.role.trim() || "Wash Hand",
    status: draft.status,
    regions,
    primaryRegion,
    skills: normaliseSkills(draft.skills),
    reliabilityNotes: draft.reliabilityNotes.trim(),
    availabilitySheetName: draft.availabilitySheetName.trim(),
    inductionSheetName: draft.inductionSheetName.trim(),
    mobile: draft.mobile.trim(),
    whatsapp: draft.whatsapp.trim(),
    contactVisibleToOdin: draft.contactVisibleToOdin
  };
}

async function fetchStaff() {
  const response = await tocFetch("/api/admin/staff", { cache: "no-store" });
  const payload = await readStaffPayload(response);
  if (!response.ok) throw new Error(payload.error || "Staff database read failed.");
  return payload;
}

async function mutateStaff(payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 18000);
  try {
    const response = await tocFetch("/api/admin/staff", {
      method: "POST",
      body: JSON.stringify(payload),
      signal: controller.signal
    }, true);
    const result = await readStaffPayload(response);
    if (!response.ok) throw new Error(result.error || "Staff database update failed.");
    return result;
  } finally {
    window.clearTimeout(timeout);
  }
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function StaffCheckGroup({
  legend,
  options,
  selected,
  onChange
}: {
  legend: string;
  options: string[];
  selected: string[];
  onChange: (nextValues: string[]) => void;
}) {
  return (
    <fieldset className="staff-check-group">
      <legend>{legend}</legend>
      <div className="staff-check-options">
        {options.map((option) => (
          <label className="staff-check-option" key={option}>
            <input
              checked={selected.includes(option)}
              type="checkbox"
              onChange={() => onChange(toggleValue(selected, option))}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function StaffEditor({
  draft,
  mode,
  disabled,
  onPatch,
  onSave,
  onDelete
}: {
  draft: StaffDraft;
  mode: "create" | "edit";
  disabled: boolean;
  onPatch: (patch: Partial<StaffDraft>) => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const regions = normaliseRegions(draft.regions, draft.primaryRegion);

  function patchPrimaryRegion(primaryRegion: string) {
    onPatch({ primaryRegion, regions: normaliseRegions(draft.regions, primaryRegion) });
  }

  return (
    <div className="staff-editor">
      <div className="staff-editor-main">
        <label><span>Name</span><input value={draft.name} onChange={(event) => onPatch({ name: event.target.value })} placeholder="Staff name" /></label>
        <label><span>Mobile</span><input value={draft.mobile} onChange={(event) => onPatch({ mobile: event.target.value })} placeholder="Phone number" /></label>
        <label>
          <span>Region</span>
          <select value={draft.primaryRegion} onChange={(event) => patchPrimaryRegion(event.target.value)}>
            {staffRegions.map((region) => <option key={region}>{region}</option>)}
          </select>
        </label>
        <label>
          <span>Role</span>
          <select value={draft.role} onChange={(event) => onPatch({ role: event.target.value })}>
            {staffRoleOptions.map((role) => <option key={role}>{role}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={draft.status} onChange={(event) => onPatch({ status: event.target.value as StaffDraft["status"] })}>
            <option value="active">Active</option>
            <option value="watch">Watch</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      <StaffCheckGroup
        legend="Skills"
        options={staffSkillOptions}
        selected={draft.skills}
        onChange={(skills) => onPatch({ skills: normaliseSkills(skills) })}
      />

      <details className="staff-advanced-details">
        <summary>Advanced mapping</summary>
        <div className="staff-editor-main">
          <label><span>Preferred name</span><input value={draft.preferredName} onChange={(event) => onPatch({ preferredName: event.target.value })} placeholder="Optional" /></label>
          <label><span>WhatsApp</span><input value={draft.whatsapp} onChange={(event) => onPatch({ whatsapp: event.target.value })} placeholder="If different" /></label>
          <label><span>Availability row</span><input value={draft.availabilitySheetName} onChange={(event) => onPatch({ availabilitySheetName: event.target.value })} placeholder="Exact sheet row name" /></label>
          <label><span>Induction row</span><input value={draft.inductionSheetName} onChange={(event) => onPatch({ inductionSheetName: event.target.value })} placeholder="Exact sheet row name" /></label>
        </div>
        <StaffCheckGroup
          legend="Extra regions"
          options={staffRegions}
          selected={regions}
          onChange={(nextRegions) => onPatch({ regions: normaliseRegions(nextRegions, draft.primaryRegion) })}
        />
        <label><span>Odin notes</span><textarea value={draft.reliabilityNotes} onChange={(event) => onPatch({ reliabilityNotes: event.target.value })} placeholder="Internal manager/Odin notes" /></label>
        <label className="admin-checkbox-row">
          <input type="checkbox" checked={draft.contactVisibleToOdin} onChange={(event) => onPatch({ contactVisibleToOdin: event.target.checked })} />
          <span>Allow Odin to read protected contact fields</span>
        </label>
      </details>

      <div className="admin-action-controls staff-editor-actions">
        <button type={mode === "create" ? "submit" : "button"} onClick={mode === "edit" ? onSave : undefined} disabled={disabled}>
          {disabled ? "Saving..." : mode === "create" ? "Add Staff Entity" : "Save Staff Entity"}
        </button>
        {onDelete ? <button className="danger-button" type="button" onClick={onDelete} disabled={disabled}>Delete Staff Entity</button> : null}
      </div>
    </div>
  );
}

export function AdminStaffManager() {
  const [staff, setStaff] = useState<StaffEntity[]>([]);
  const [draft, setDraft] = useState<StaffDraft>(blankDraft);
  const [editDrafts, setEditDrafts] = useState<Record<string, StaffDraft>>({});
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<StaffPayload["source"]>("database");
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const statusCounts = useMemo(() => ({
    active: staff.filter((person) => person.status === "active").length,
    watch: staff.filter((person) => person.status === "watch").length,
    inactive: staff.filter((person) => person.status === "inactive").length
  }), [staff]);

  useEffect(() => {
    fetchStaff()
      .then((payload) => {
        setStaff(payload.staff || []);
        setSource(payload.source || "database");
        setEditDrafts(Object.fromEntries((payload.staff || []).map((person) => [person.id, draftFromStaff(person)])));
        setMessage(payload.source === "database" ? "" : "Staff table is unavailable, showing sheet fallback records only.");
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setIsLoading(false));
  }, []);

  function updateDraft(patch: Partial<StaffDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateEditDraft(id: string, patch: Partial<StaffDraft>) {
    setEditDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] || blankDraft()),
        ...patch
      }
    }));
  }

  async function saveMutation(payload: Record<string, unknown>, successMessage: string, id: string) {
    setSavingId(id);
    setMessage("");
    try {
      const result = await mutateStaff(payload);
      setStaff(result.staff || []);
      setSource(result.source || "database");
      setEditDrafts(Object.fromEntries((result.staff || []).map((person) => [person.id, draftFromStaff(person)])));
      setMessage(successMessage);
      window.dispatchEvent(new Event("toc.staff.updated"));
      return true;
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "AbortError" ? "Staff save timed out before TOC responded. Please retry." : error instanceof Error ? error.message : "Staff update failed.");
      return false;
    } finally {
      setSavingId(null);
    }
  }

  async function registerStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setMessage("Staff name is required.");
      return;
    }
    const payload = buildStaffPayload("create", draft);
    const saved = await saveMutation(payload, `${payload.name} added to staff control.`, "new");
    if (saved) setDraft(blankDraft());
  }

  function saveStaff(person: StaffEntity) {
    const nextDraft = editDrafts[person.id] || draftFromStaff(person);
    if (!nextDraft.name.trim()) {
      setMessage("Staff name is required before saving.");
      return;
    }
    const payload = buildStaffPayload("update", nextDraft, person.id);
    void saveMutation(payload, `${payload.name} updated in staff control.`, person.id);
  }

  function deleteStaff(person: StaffEntity) {
    if (!window.confirm(`Delete ${person.name} from staff entities? This does not edit the Google Sheets.`)) return;
    void saveMutation({ action: "delete", id: person.id, name: person.name }, `${person.name} removed from staff entities.`, person.id);
  }

  return (
    <div className="admin-action-console staff-register-console">
      <form className="admin-action-form staff-register-form" onSubmit={registerStaff}>
        <div className="staff-register-header">
          <div>
            <strong>Staff Register</strong>
            <small>Fast TOC/Odin staff records: name, phone, region, role and skills.</small>
          </div>
          <Tag tone={source === "database" ? "green" : "amber"}>{source === "database" ? "Database linked" : "Sheet fallback"}</Tag>
        </div>
        <StaffEditor
          draft={draft}
          mode="create"
          disabled={savingId === "new"}
          onPatch={updateDraft}
          onSave={() => undefined}
        />
      </form>

      <div className="admin-action-list staff-register-list">
        <div className="admin-access-summary">
          <article><span>Staff entities</span><strong>{staff.length}</strong></article>
          <article><span>Active</span><strong>{statusCounts.active}</strong></article>
          <article><span>Watch</span><strong>{statusCounts.watch}</strong></article>
          <article><span>Inactive</span><strong>{statusCounts.inactive}</strong></article>
        </div>

        {isLoading ? <small className="admin-hint-message">Loading staff entities from TOC database...</small> : null}

        {staff.map((person) => {
          const personDraft = editDrafts[person.id] || draftFromStaff(person);
          const canSave = person.source !== "availability_sheet";
          return (
            <details className={`admin-action-card staff-entity-card ${person.status === "inactive" ? "disabled" : ""}`} key={person.id}>
              <summary className="admin-action-card-head staff-entity-summary">
                <div>
                  <strong>{person.name}</strong>
                  <small>{person.role} - {person.primaryRegion} - {person.id}</small>
                </div>
                <div className="meta-row">
                  <Tag tone={person.status === "active" ? "green" : person.status === "watch" ? "amber" : "blue"}>{person.status}</Tag>
                  <Tag>{person.contact?.mobile || "No phone"}</Tag>
                  <Tag tone={canSave ? "green" : "amber"}>{canSave ? "DB record" : "Sheet only"}</Tag>
                </div>
              </summary>
              <div className="staff-entity-body">
                <div className="staff-card-summary">
                  <span>{person.regions.join(", ") || "No region mapped"}</span>
                  <span>{person.skills.length ? person.skills.join(", ") : "No skills mapped"}</span>
                </div>
                {!canSave ? <small className="admin-hint-message">This is a sheet fallback record. Add it as a staff entity before editing protected details.</small> : null}
                <StaffEditor
                  draft={personDraft}
                  mode="edit"
                  disabled={!canSave || savingId === person.id}
                  onPatch={(patch) => updateEditDraft(person.id, patch)}
                  onSave={() => saveStaff(person)}
                  onDelete={canSave ? () => deleteStaff(person) : undefined}
                />
              </div>
            </details>
          );
        })}

        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
    </div>
  );
}
