"use client";

import { FormEvent, useEffect, useState } from "react";
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
};

type StaffDraft = {
  name: string;
  preferredName: string;
  role: string;
  status: "active" | "inactive" | "watch";
  regions: string[];
  primaryRegion: string;
  skills: string;
  reliabilityNotes: string;
  availabilitySheetName: string;
  inductionSheetName: string;
  mobile: string;
  whatsapp: string;
  contactVisibleToOdin: boolean;
};

const staffRegions = allRegions.filter((region) => region !== "National");

function blankDraft(): StaffDraft {
  return {
    name: "",
    preferredName: "",
    role: "Wash Hand",
    status: "active",
    regions: ["Brisbane"],
    primaryRegion: "Brisbane",
    skills: "",
    reliabilityNotes: "",
    availabilitySheetName: "",
    inductionSheetName: "",
    mobile: "",
    whatsapp: "",
    contactVisibleToOdin: true
  };
}

function draftFromStaff(staff: StaffEntity): StaffDraft {
  return {
    name: staff.name,
    preferredName: staff.preferredName || "",
    role: staff.role,
    status: staff.status,
    regions: staff.regions.filter((region) => region !== "National"),
    primaryRegion: staff.primaryRegion === "National" ? "Brisbane" : staff.primaryRegion,
    skills: staff.skills.join(", "),
    reliabilityNotes: staff.reliabilityNotes,
    availabilitySheetName: staff.availabilitySheetName,
    inductionSheetName: staff.inductionSheetName,
    mobile: staff.contact?.mobile || "",
    whatsapp: staff.contact?.whatsapp || "",
    contactVisibleToOdin: true
  };
}

async function fetchStaff() {
  const response = await tocFetch("/api/admin/staff", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Staff database read failed.");
  return (payload.staff || []) as StaffEntity[];
}

async function mutateStaff(payload: Record<string, unknown>) {
  const response = await tocFetch("/api/admin/staff", {
    method: "POST",
    body: JSON.stringify(payload)
  }, true);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Staff database update failed.");
  return (result.staff || []) as StaffEntity[];
}

export function AdminStaffManager() {
  const [staff, setStaff] = useState<StaffEntity[]>([]);
  const [draft, setDraft] = useState<StaffDraft>(blankDraft);
  const [editDrafts, setEditDrafts] = useState<Record<string, StaffDraft>>({});
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchStaff()
      .then((nextStaff) => {
        setStaff(nextStaff);
        setEditDrafts(Object.fromEntries(nextStaff.map((person) => [person.id, draftFromStaff(person)])));
      })
      .catch((error: Error) => setMessage(error.message));
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

  function toggleRegion(currentRegions: string[], region: string) {
    const nextRegions = currentRegions.includes(region)
      ? currentRegions.filter((item) => item !== region)
      : [...currentRegions, region];
    return nextRegions.length ? nextRegions : [region];
  }

  async function saveMutation(payload: Record<string, unknown>, successMessage: string) {
    setIsSaving(true);
    setMessage("");
    try {
      const nextStaff = await mutateStaff(payload);
      setStaff(nextStaff);
      setEditDrafts(Object.fromEntries(nextStaff.map((person) => [person.id, draftFromStaff(person)])));
      setMessage(successMessage);
      window.dispatchEvent(new Event("toc.staff.updated"));
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Staff update failed.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function registerStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setMessage("Staff name is required.");
      return;
    }
    const saved = await saveMutation({
      action: "create",
      ...draft,
      skills: draft.skills
    }, `${draft.name} added to staff control.`);
    if (saved) setDraft(blankDraft());
  }

  function saveStaff(person: StaffEntity) {
    const nextDraft = editDrafts[person.id] || draftFromStaff(person);
    void saveMutation({
      action: "update",
      id: person.id,
      ...nextDraft,
      skills: nextDraft.skills
    }, `${nextDraft.name} updated.`);
  }

  function deleteStaff(person: StaffEntity) {
    if (!window.confirm(`Delete ${person.name} from staff entities? This does not edit the Google Sheets.`)) return;
    void saveMutation({ action: "delete", id: person.id, name: person.name }, `${person.name} removed from staff entities.`);
  }

  return (
    <div className="admin-action-console">
      <form className="admin-action-form" onSubmit={registerStaff}>
        <div>
          <strong>Register staff entity</strong>
          <small>Creates the TOC/Odin staff record and links it to sheet names. TOC does not edit Google Sheets.</small>
        </div>
        <div className="admin-action-grid">
          <label><span>Name</span><input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="Staff name" /></label>
          <label><span>Preferred name</span><input value={draft.preferredName} onChange={(event) => updateDraft({ preferredName: event.target.value })} placeholder="Optional" /></label>
          <label><span>Role</span><input value={draft.role} onChange={(event) => updateDraft({ role: event.target.value })} /></label>
          <label>
            <span>Status</span>
            <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as StaffDraft["status"] })}>
              <option value="active">Active</option>
              <option value="watch">Watch</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label>
            <span>Primary region</span>
            <select value={draft.primaryRegion} onChange={(event) => updateDraft({ primaryRegion: event.target.value })}>
              {staffRegions.map((region) => <option key={region}>{region}</option>)}
            </select>
          </label>
          <label><span>Skills</span><input value={draft.skills} onChange={(event) => updateDraft({ skills: event.target.value })} placeholder="Team leader, pressure washing" /></label>
          <label><span>Availability sheet name</span><input value={draft.availabilitySheetName} onChange={(event) => updateDraft({ availabilitySheetName: event.target.value })} placeholder="Sheet row name" /></label>
          <label><span>Induction sheet name</span><input value={draft.inductionSheetName} onChange={(event) => updateDraft({ inductionSheetName: event.target.value })} placeholder="Sheet row name" /></label>
          <label><span>Mobile</span><input value={draft.mobile} onChange={(event) => updateDraft({ mobile: event.target.value })} placeholder="Protected" /></label>
          <label><span>WhatsApp</span><input value={draft.whatsapp} onChange={(event) => updateDraft({ whatsapp: event.target.value })} placeholder="Protected" /></label>
        </div>
        <fieldset>
          <legend>Assigned regions</legend>
          {staffRegions.map((region) => (
            <label key={region}>
              <input checked={draft.regions.includes(region)} type="checkbox" onChange={() => updateDraft({ regions: toggleRegion(draft.regions, region) })} /> {region}
            </label>
          ))}
        </fieldset>
        <label><span>Reliability/status notes</span><textarea value={draft.reliabilityNotes} onChange={(event) => updateDraft({ reliabilityNotes: event.target.value })} placeholder="Internal manager/Odin notes" /></label>
        <label className="admin-checkbox-row">
          <input type="checkbox" checked={draft.contactVisibleToOdin} onChange={(event) => updateDraft({ contactVisibleToOdin: event.target.checked })} />
          <span>Allow Odin service to read protected contact fields</span>
        </label>
        <button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Add Staff Entity"}</button>
      </form>

      <div className="admin-action-list">
        <div className="admin-access-summary">
          <article><span>Staff entities</span><strong>{staff.length}</strong></article>
          <article><span>Active</span><strong>{staff.filter((person) => person.status === "active").length}</strong></article>
          <article><span>Watch</span><strong>{staff.filter((person) => person.status === "watch").length}</strong></article>
        </div>
        {staff.map((person) => {
          const personDraft = editDrafts[person.id] || draftFromStaff(person);
          return (
            <article className={`admin-action-card ${person.status === "inactive" ? "disabled" : ""}`} key={person.id}>
              <div className="admin-action-card-head">
                <div>
                  <strong>{person.name}</strong>
                  <small>{person.role} - {person.primaryRegion} - {person.id}</small>
                </div>
                <div className="meta-row">
                  <Tag tone={person.status === "active" ? "green" : person.status === "watch" ? "amber" : "blue"}>{person.status}</Tag>
                  <Tag>{person.availability.availableWindows}/{person.availability.totalWindows || 0} windows</Tag>
                  <Tag tone={person.inductions.eligibleSites.length ? "green" : "amber"}>{person.inductions.eligibleSites.length} inductions</Tag>
                </div>
              </div>
              <div className="admin-action-grid">
                <label><span>Name</span><input value={personDraft.name} onChange={(event) => updateEditDraft(person.id, { name: event.target.value })} /></label>
                <label><span>Preferred name</span><input value={personDraft.preferredName} onChange={(event) => updateEditDraft(person.id, { preferredName: event.target.value })} /></label>
                <label><span>Role</span><input value={personDraft.role} onChange={(event) => updateEditDraft(person.id, { role: event.target.value })} /></label>
                <label>
                  <span>Status</span>
                  <select value={personDraft.status} onChange={(event) => updateEditDraft(person.id, { status: event.target.value as StaffDraft["status"] })}>
                    <option value="active">Active</option>
                    <option value="watch">Watch</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label>
                  <span>Primary region</span>
                  <select value={personDraft.primaryRegion} onChange={(event) => updateEditDraft(person.id, { primaryRegion: event.target.value })}>
                    {staffRegions.map((region) => <option key={region}>{region}</option>)}
                  </select>
                </label>
                <label><span>Skills</span><input value={personDraft.skills} onChange={(event) => updateEditDraft(person.id, { skills: event.target.value })} /></label>
                <label><span>Availability sheet name</span><input value={personDraft.availabilitySheetName} onChange={(event) => updateEditDraft(person.id, { availabilitySheetName: event.target.value })} /></label>
                <label><span>Induction sheet name</span><input value={personDraft.inductionSheetName} onChange={(event) => updateEditDraft(person.id, { inductionSheetName: event.target.value })} /></label>
                <label><span>Mobile</span><input value={personDraft.mobile} onChange={(event) => updateEditDraft(person.id, { mobile: event.target.value })} /></label>
                <label><span>WhatsApp</span><input value={personDraft.whatsapp} onChange={(event) => updateEditDraft(person.id, { whatsapp: event.target.value })} /></label>
              </div>
              <fieldset>
                <legend>Assigned regions</legend>
                {staffRegions.map((region) => (
                  <label key={region}>
                    <input checked={personDraft.regions.includes(region)} type="checkbox" onChange={() => updateEditDraft(person.id, { regions: toggleRegion(personDraft.regions, region) })} /> {region}
                  </label>
                ))}
              </fieldset>
              <label><span>Reliability/status notes</span><textarea value={personDraft.reliabilityNotes} onChange={(event) => updateEditDraft(person.id, { reliabilityNotes: event.target.value })} /></label>
              <label className="admin-checkbox-row">
                <input type="checkbox" checked={personDraft.contactVisibleToOdin} onChange={(event) => updateEditDraft(person.id, { contactVisibleToOdin: event.target.checked })} />
                <span>Allow Odin service to read protected contact fields</span>
              </label>
              <div className="admin-action-controls">
                <button type="button" onClick={() => saveStaff(person)} disabled={isSaving}>Save Staff Entity</button>
                <button className="danger-button" type="button" onClick={() => deleteStaff(person)} disabled={isSaving}>Delete Staff Entity</button>
              </div>
            </article>
          );
        })}
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
    </div>
  );
}
