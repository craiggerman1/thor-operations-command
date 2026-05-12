"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { allRegions } from "@/lib/access";
import { tocFetch } from "@/lib/toc-client-auth";

type StaffRow = { id: string; name: string; role: string; status: string; skills: string[]; mobile: string; whatsapp: string; availabilitySheetName: string; inductionSheetName: string; notes: string; regions?: string[] };
type SiteRow = { id: string; clientName: string; siteName: string; address: string; requiredInduction: boolean; requiredCrewCount: number; notes: string; status: string; regions?: string[] };
type ScheduleRow = { id: string; siteId: string; siteLabel: string; scheduleName: string; startDate: string; endDate: string; jobTime: string; recurrence: string; recurrenceIntervalWeeks: number; requiredCrewCount: number; jobTitle: string; washAsset: string; notes: string; status: string; staffIds: string[]; regions?: string[] };
type InductionRow = { id: string; staffId: string; siteId: string; staffName: string; siteName: string; status: string; expiry: string };
type SetupPayload = {
  connected: boolean;
  error?: string;
  region: string;
  setup?: { completed_at?: string | null; force_run_next_login?: boolean | null };
  availabilitySource?: { spreadsheetUrl?: string; sourceName?: string } | null;
  staff: StaffRow[];
  sites: SiteRow[];
  schedules: ScheduleRow[];
  inductions: InductionRow[];
};
type AvailabilityFeed = { staff?: Array<{ name: string }> };

const skills = ["Wash Hand", "Driver", "Team Leader"];
const recurrences = ["None", "Daily", "Weekly", "Fortnightly", "4 weekly", "Custom"];
const inductionStatuses = ["", "Inducted", "Not Inducted", "Expired", "Expiring Soon", "Expiring This Month"];
const allRegionsLabel = "All regions";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function blankStaff(): Partial<StaffRow> {
  return { name: "", role: "Wash Hand", status: "active", skills: ["Wash Hand"], mobile: "", whatsapp: "", availabilitySheetName: "", inductionSheetName: "", notes: "" };
}

function blankSite(): Partial<SiteRow> {
  return { clientName: "", siteName: "", address: "", requiredInduction: true, requiredCrewCount: 2, notes: "", status: "active" };
}

function blankSchedule(): Partial<ScheduleRow> {
  return { siteId: "", scheduleName: "", startDate: today(), endDate: "", jobTime: "07:00", recurrence: "Weekly", recurrenceIntervalWeeks: 1, requiredCrewCount: 2, jobTitle: "Scheduled wash", washAsset: "", notes: "", status: "active", staffIds: [] };
}

function readSessionScope() {
  if (typeof window === "undefined") return "Brisbane";
  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.scope && session.scope !== "National" ? session.scope : "Brisbane";
  } catch {
    return "Brisbane";
  }
}

function readSessionRegions() {
  if (typeof window === "undefined") return ["Brisbane"];
  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    const regions = Array.isArray(session?.regions) ? session.regions.filter((region: string) => region && region !== "National") : [];
    const scope = session?.scope && session.scope !== "National" ? session.scope : "";
    return Array.from(new Set([scope, ...regions].filter(Boolean))).length ? Array.from(new Set([scope, ...regions].filter(Boolean))) : ["Brisbane"];
  } catch {
    return ["Brisbane"];
  }
}

function skillToggle(selected: string[] = [], skill: string) {
  return selected.includes(skill) ? selected.filter((item) => item !== skill) : [...selected, skill];
}

function roleFromSkills(selected: string[] = []) {
  if (selected.includes("Team Leader")) return "Team Leader";
  if (selected.includes("Driver")) return "Driver";
  return "Wash Hand";
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) throw new Error("TOC setup returned no response.");
  const payload = JSON.parse(text) as SetupPayload;
  if (!response.ok) throw new Error(payload.error || "TOC setup request failed.");
  return payload;
}

function rowRegions(row: { regions?: string[] }, fallback: string) {
  return row.regions?.length ? row.regions : [fallback];
}

function matchesSearch(parts: Array<unknown>, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return parts.filter(Boolean).join(" ").toLowerCase().includes(needle);
}

function cleanNameKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function OperationsSetupWizard({ adminMode = false, initialStep = 1 }: { adminMode?: boolean; initialStep?: number }) {
  const [region, setRegion] = useState(readSessionScope);
  const [step, setStep] = useState(initialStep);
  const [payload, setPayload] = useState<SetupPayload | null>(null);
  const [staffDraft, setStaffDraft] = useState<Partial<StaffRow>>(blankStaff);
  const [siteDraft, setSiteDraft] = useState<Partial<SiteRow>>(blankSite);
  const [scheduleDraft, setScheduleDraft] = useState<Partial<ScheduleRow>>(blankSchedule);
  const [availabilityUrl, setAvailabilityUrl] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");
  const [siteSearch, setSiteSearch] = useState("");
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [tableRegionFilter, setTableRegionFilter] = useState(allRegionsLabel);
  const [editingStaffId, setEditingStaffId] = useState("");
  const [editingStaffDraft, setEditingStaffDraft] = useState<Partial<StaffRow>>(blankStaff);
  const [editingSiteId, setEditingSiteId] = useState("");
  const [editingSiteDraft, setEditingSiteDraft] = useState<Partial<SiteRow>>(blankSite);
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [editingScheduleDraft, setEditingScheduleDraft] = useState<Partial<ScheduleRow>>(blankSchedule);
  const [availabilityRowsByRegion, setAvailabilityRowsByRegion] = useState<Record<string, string[]>>({});

  const regionOptions = useMemo(() => adminMode ? [allRegionsLabel, ...allRegions.filter((item) => item !== "National")] : readSessionRegions(), [adminMode]);
  const specificRegionOptions = useMemo(() => regionOptions.filter((item) => item !== allRegionsLabel), [regionOptions]);
  const allRegionMode = adminMode && region === allRegionsLabel;
  const staff = payload?.staff || [];
  const sites = payload?.sites || [];
  const schedules = payload?.schedules || [];
  const inductions = payload?.inductions || [];
  const selectedSite = sites.find((site) => site.id === scheduleDraft.siteId);
  const selectedEditingSite = sites.find((site) => site.id === editingScheduleDraft.siteId);
  const filteredStaff = useMemo(() => staff.filter((person) => {
    const regions = rowRegions(person, region);
    const sheetRows = regions.flatMap((item) => availabilityRowsByRegion[item] || []);
    const matchLabel = sheetRows.some((name) => cleanNameKey(name) === cleanNameKey(person.availabilitySheetName || person.name)) ? "matched" : "not matched";
    const regionMatch = tableRegionFilter === allRegionsLabel || regions.includes(tableRegionFilter);
    return regionMatch && matchesSearch([person.name, person.mobile, person.whatsapp, person.availabilitySheetName, matchLabel, person.role, person.skills.join(" "), regions.join(" "), person.notes], staffSearch);
  }), [staff, availabilityRowsByRegion, staffSearch, tableRegionFilter, region]);
  const filteredSites = useMemo(() => sites.filter((site) => {
    const regions = rowRegions(site, region);
    const regionMatch = tableRegionFilter === allRegionsLabel || regions.includes(tableRegionFilter);
    return regionMatch && matchesSearch([site.clientName, site.siteName, site.address, site.requiredCrewCount, regions.join(" "), site.notes], siteSearch);
  }), [sites, siteSearch, tableRegionFilter, region]);
  const filteredSchedules = useMemo(() => schedules.filter((schedule) => {
    const regions = rowRegions(schedule, region);
    const rosteredNames = staff.filter((person) => schedule.staffIds.includes(person.id)).map((person) => person.name).join(" ");
    const regionMatch = tableRegionFilter === allRegionsLabel || regions.includes(tableRegionFilter);
    return regionMatch && matchesSearch([schedule.siteLabel, schedule.jobTitle, schedule.washAsset, schedule.recurrence, rosteredNames, regions.join(" "), schedule.notes], scheduleSearch);
  }), [schedules, staff, scheduleSearch, tableRegionFilter, region]);

  async function load(nextRegion = region) {
    setMessage("");
    try {
      if (adminMode && nextRegion === allRegionsLabel) {
        const responses = await Promise.all(specificRegionOptions.map(async (item) => {
          const response = await tocFetch(`/api/operations-setup?region=${encodeURIComponent(item)}`, { cache: "no-store" });
          return readPayload(response);
        }));
        const combined: SetupPayload = {
          connected: responses.every((item) => item.connected),
          region: allRegionsLabel,
          setup: {},
          availabilitySource: null,
          staff: responses.flatMap((item) => item.staff.map((person) => ({ ...person, regions: rowRegions(person, item.region) }))),
          sites: responses.flatMap((item) => item.sites.map((site) => ({ ...site, regions: rowRegions(site, item.region) }))),
          schedules: responses.flatMap((item) => item.schedules.map((schedule) => ({ ...schedule, regions: rowRegions(schedule, item.region) }))),
          inductions: responses.flatMap((item) => item.inductions)
        };
        setPayload(combined);
        setAvailabilityUrl("");
        setTableRegionFilter(allRegionsLabel);
        void loadAvailabilityRows(specificRegionOptions);
        return;
      }
      const response = await tocFetch(`/api/operations-setup?region=${encodeURIComponent(nextRegion)}`, { cache: "no-store" });
      const nextPayload = await readPayload(response);
      setPayload(nextPayload);
      setAvailabilityUrl(nextPayload.availabilitySource?.spreadsheetUrl || "");
      setTableRegionFilter(nextRegion);
      void loadAvailabilityRows([nextRegion]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Setup data could not be loaded.");
    }
  }

  async function loadAvailabilityRows(regions: string[]) {
    const entries = await Promise.all(regions.map(async (item) => {
      try {
        const response = await tocFetch(`/api/staff-availability?scope=${encodeURIComponent(item)}&refresh=${Date.now()}`, { cache: "no-store" });
        const feed = await response.json() as AvailabilityFeed;
        return [item, (feed.staff || []).map((person) => person.name).filter(Boolean)] as const;
      } catch {
        return [item, []] as const;
      }
    }));
    setAvailabilityRowsByRegion((current) => ({ ...current, ...Object.fromEntries(entries) }));
  }

  useEffect(() => {
    void load(region);
  }, [region]);

  async function mutate(body: Record<string, unknown>, success: string) {
    if (allRegionMode) {
      setMessage("Select a specific region before adding or editing setup data.");
      return false;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await tocFetch("/api/operations-setup", { method: "POST", body: JSON.stringify({ ...body, region }) }, true);
      const nextPayload = await readPayload(response);
      setPayload(nextPayload);
      setMessage(success);
      window.dispatchEvent(new Event("toc.operationsSetup.updated"));
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Setup update failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedSkills = staffDraft.skills?.length ? staffDraft.skills : ["Wash Hand"];
    const ok = await mutate({ action: "upsertStaff", ...staffDraft, role: roleFromSkills(selectedSkills), skills: selectedSkills }, "Staff member saved to the region database.");
    if (ok) setStaffDraft(blankStaff());
  }

  function startStaffRowEdit(person: StaffRow) {
    if (allRegionMode) {
      setMessage("Select a specific region before editing staff rows.");
      return;
    }
    setEditingStaffId(person.id);
    setEditingStaffDraft({ ...person, skills: person.skills?.length ? person.skills : ["Wash Hand"] });
  }

  async function saveStaffRowEdit() {
    const selectedSkills = editingStaffDraft.skills?.length ? editingStaffDraft.skills : ["Wash Hand"];
    const ok = await mutate({ action: "upsertStaff", ...editingStaffDraft, role: roleFromSkills(selectedSkills), skills: selectedSkills }, "Staff row saved to the region database.");
    if (ok) {
      setEditingStaffId("");
      setEditingStaffDraft(blankStaff());
    }
  }

  async function removeStaffRow(person: StaffRow) {
    if (allRegionMode) return;
    const confirmed = window.confirm(`Remove ${person.name} from ${region}? Historical records stay in TOC, but this person will be removed from this region's setup, future schedules and future calendar assignments.`);
    if (!confirmed) return;
    const ok = await mutate({ action: "removeStaffFromRegion", id: person.id }, `${person.name} removed from ${region}.`);
    if (ok && editingStaffId === person.id) {
      setEditingStaffId("");
      setEditingStaffDraft(blankStaff());
    }
  }

  async function addSiteRow() {
    const ok = await mutate({ action: "upsertSite", ...siteDraft }, "Client site saved.");
    if (ok) setSiteDraft(blankSite());
  }

  function startSiteRowEdit(site: SiteRow) {
    if (allRegionMode) {
      setMessage("Select a specific region before editing client rows.");
      return;
    }
    setEditingSiteId(site.id);
    setEditingSiteDraft(site);
  }

  async function saveSiteRowEdit() {
    const ok = await mutate({ action: "upsertSite", ...editingSiteDraft }, "Client site row saved.");
    if (ok) {
      setEditingSiteId("");
      setEditingSiteDraft(blankSite());
    }
  }

  async function addScheduleRow() {
    const ok = await mutate({ action: "upsertSchedule", ...scheduleDraft, requiredCrewCount: scheduleDraft.requiredCrewCount || selectedSite?.requiredCrewCount || 2, generateCalendarJobs: true }, "Recurring job saved and pushed to Calendar.");
    if (ok) setScheduleDraft(blankSchedule());
  }

  function startScheduleRowEdit(schedule: ScheduleRow) {
    if (allRegionMode) {
      setMessage("Select a specific region before editing job rows.");
      return;
    }
    setEditingScheduleId(schedule.id);
    setEditingScheduleDraft(schedule);
  }

  async function saveScheduleRowEdit() {
    const ok = await mutate({
      action: "upsertSchedule",
      ...editingScheduleDraft,
      requiredCrewCount: editingScheduleDraft.requiredCrewCount || selectedEditingSite?.requiredCrewCount || 2,
      generateCalendarJobs: true
    }, "Recurring job row saved and Calendar regenerated.");
    if (ok) {
      setEditingScheduleId("");
      setEditingScheduleDraft(blankSchedule());
    }
  }

  async function saveInduction(staffRow: StaffRow, site: SiteRow, existing?: InductionRow, status = existing?.status || "", expiry = existing?.expiry || "") {
    await mutate({
      action: "upsertInduction",
      id: existing?.id,
      staffId: staffRow.id,
      siteId: site.id,
      staffName: staffRow.name,
      siteName: site.siteName,
      status,
      expiry
    }, `${staffRow.name} induction saved for ${site.siteName}.`);
  }

  async function saveAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate({ action: "saveAvailabilitySource", spreadsheetUrl: availabilityUrl, sourceName: `${region} Staff Availability` }, "Availability sheet linked for this region.");
  }

  async function completeSetup() {
    const ok = await mutate({ action: "completeSetup" }, "Operations setup completed. TOC is ready for this region.");
    if (ok) {
      sessionStorage.setItem(`toc.setup.dismissed.${region}`, "true");
      window.location.href = "/home";
    }
  }

  function findInduction(staffRow: StaffRow, site: SiteRow) {
    return inductions.find((item) => item.staffId === staffRow.id && item.siteId === site.id)
      || inductions.find((item) => item.staffName === staffRow.name && item.siteName === site.siteName);
  }

  function sheetMatchForStaff(person: StaffRow) {
    const names = rowRegions(person, region).flatMap((item) => availabilityRowsByRegion[item] || []);
    const expected = cleanNameKey(person.availabilitySheetName || person.name);
    return {
      matched: names.some((name) => cleanNameKey(name) === expected),
      count: names.length
    };
  }

  return (
    <div className="setup-wizard">
      <div className="setup-hero">
        <div>
          <span>Operations Setup Wizard</span>
          <h2>{region} command setup</h2>
          <p>Build the region source of truth once, then TOC turns it into staff visibility, jobs, inductions, calendar schedules and Odin context.</p>
        </div>
        <label>
          <span>Setup region</span>
          <select value={region} onChange={(event) => setRegion(event.target.value)} disabled={!adminMode && regionOptions.length === 1}>
            {regionOptions.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div className="setup-steps">
        {["Staff", "Clients & Jobs", "Inductions", "Availability", "Training"].map((label, index) => (
          <button className={step === index + 1 ? "active" : ""} type="button" onClick={() => setStep(index + 1)} key={label}>
            <span>{index + 1}</span>{label}
          </button>
        ))}
      </div>

      {step === 1 ? (
        <section className="setup-panel">
          <div className="setup-copy"><strong>Step 1. Staff</strong><p>Add every person who works in this region. Tick every skill that applies so Odin can match staff to roster needs without guessing.</p></div>
          <form className="setup-grid-form" onSubmit={saveStaff}>
            <input placeholder="Staff name" value={staffDraft.name || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, name: event.target.value }))} />
            <input placeholder="Mobile phone" value={staffDraft.mobile || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, mobile: event.target.value }))} />
            <input placeholder="WhatsApp / Telegram phone" value={staffDraft.whatsapp || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, whatsapp: event.target.value }))} />
            <input placeholder="Exact availability sheet name" value={staffDraft.availabilitySheetName || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, availabilitySheetName: event.target.value }))} />
            <div className="setup-checks setup-checks-wide">{skills.map((skill) => <label key={skill}><input type="checkbox" checked={(staffDraft.skills || []).includes(skill)} onChange={() => setStaffDraft((current) => ({ ...current, skills: skillToggle(current.skills, skill) }))} /> {skill}</label>)}</div>
            <input placeholder="Notes for Odin / manager" value={staffDraft.notes || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, notes: event.target.value }))} />
            <button disabled={saving || allRegionMode} type="submit">{staffDraft.id ? "Save Staff" : "Add Staff"}</button>
            {staffDraft.id ? <button type="button" onClick={() => setStaffDraft(blankStaff())}>Cancel Edit</button> : null}
          </form>
          {allRegionMode ? <div className="setup-empty">All regions is a filterable overview. Select a specific region above before adding or editing staff.</div> : null}
          <CollapsibleTable
            title="Current Staff"
            count={filteredStaff.length}
            total={staff.length}
            headers={["Staff name", "Phone", "Skills", "Availability row", "Sheet match", "Region", "Action"]}
            search={staffSearch}
            onSearchChange={setStaffSearch}
            regionFilter={tableRegionFilter}
            onRegionFilterChange={setTableRegionFilter}
            regionOptions={[allRegionsLabel, ...specificRegionOptions]}
          >
            <tbody>{filteredStaff.map((person, index) => {
              const isEditing = editingStaffId === person.id;
              const rowKey = `${person.id}-${rowRegions(person, region).join("-")}-${index}`;
              const match = sheetMatchForStaff(person);
              return (
                <tr key={rowKey} className={isEditing ? "setup-editing-row" : ""}>
                  <td>{isEditing ? <input value={editingStaffDraft.name || ""} onChange={(event) => setEditingStaffDraft((current) => ({ ...current, name: event.target.value }))} /> : person.name}</td>
                  <td>{isEditing ? <input value={editingStaffDraft.mobile || ""} onChange={(event) => setEditingStaffDraft((current) => ({ ...current, mobile: event.target.value }))} /> : person.mobile || "No phone"}</td>
                  <td>
                    {isEditing ? (
                      <div className="setup-checks setup-row-checks">
                        {skills.map((skill) => <label key={skill}><input type="checkbox" checked={(editingStaffDraft.skills || []).includes(skill)} onChange={() => setEditingStaffDraft((current) => ({ ...current, skills: skillToggle(current.skills, skill) }))} /> {skill}</label>)}
                      </div>
                    ) : person.skills.join(", ") || person.role}
                  </td>
                  <td>{isEditing ? <input value={editingStaffDraft.availabilitySheetName || ""} onChange={(event) => setEditingStaffDraft((current) => ({ ...current, availabilitySheetName: event.target.value }))} /> : person.availabilitySheetName || person.name}</td>
                  <td><span className={`setup-match-chip ${match.matched ? "matched" : "missing"}`}>{match.matched ? "Matched" : match.count ? "Not matched" : "No sheet"}</span></td>
                  <td><span className="setup-region-chip">{rowRegions(person, region).join(", ")}</span></td>
                  <td className="setup-row-actions">
                    {isEditing ? (
                      <>
                        <button type="button" disabled={saving} onClick={saveStaffRowEdit}>Save</button>
                        <button type="button" onClick={() => { setEditingStaffId(""); setEditingStaffDraft(blankStaff()); }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startStaffRowEdit(person)}>Edit</button>
                        <button className="setup-danger-button" type="button" disabled={saving || allRegionMode} onClick={() => removeStaffRow(person)}>Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
          </CollapsibleTable>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="setup-panel">
          <div className="setup-copy"><strong>Step 2. Clients and recurring jobs</strong><p>Type directly into the spreadsheet rows. Save client sites first, then create recurring jobs from those saved sites. Calendar is generated from the jobs table.</p></div>
          <CollapsibleTable
            title="Client Sites"
            count={filteredSites.length}
            total={sites.length}
            headers={["Client", "Site", "Address", "Crew", "Induction", "Notes", "Region", "Action"]}
            search={siteSearch}
            onSearchChange={setSiteSearch}
            regionFilter={tableRegionFilter}
            onRegionFilterChange={setTableRegionFilter}
            regionOptions={[allRegionsLabel, ...specificRegionOptions]}
          >
            <tbody>
              <tr className="setup-new-row">
                <td><input placeholder="Client name" value={siteDraft.clientName || ""} onChange={(event) => setSiteDraft((current) => ({ ...current, clientName: event.target.value }))} /></td>
                <td><input placeholder="Site name" value={siteDraft.siteName || ""} onChange={(event) => setSiteDraft((current) => ({ ...current, siteName: event.target.value }))} /></td>
                <td><input placeholder="Address" value={siteDraft.address || ""} onChange={(event) => setSiteDraft((current) => ({ ...current, address: event.target.value }))} /></td>
                <td><input type="number" min={0} max={20} value={siteDraft.requiredCrewCount || 2} onChange={(event) => setSiteDraft((current) => ({ ...current, requiredCrewCount: Number(event.target.value) }))} /></td>
                <td><label className="setup-cell-check"><input type="checkbox" checked={siteDraft.requiredInduction !== false} onChange={(event) => setSiteDraft((current) => ({ ...current, requiredInduction: event.target.checked }))} /> Required</label></td>
                <td><input placeholder="Notes" value={siteDraft.notes || ""} onChange={(event) => setSiteDraft((current) => ({ ...current, notes: event.target.value }))} /></td>
                <td><span className="setup-region-chip">{region}</span></td>
                <td><button disabled={saving || allRegionMode} type="button" onClick={addSiteRow}>Add Site</button></td>
              </tr>
              {filteredSites.map((site, index) => {
                const isEditing = editingSiteId === site.id;
                const draft = isEditing ? editingSiteDraft : site;
                return (
                  <tr key={`${site.id}-${index}`} className={isEditing ? "setup-editing-row" : ""}>
                    <td>{isEditing ? <input value={draft.clientName || ""} onChange={(event) => setEditingSiteDraft((current) => ({ ...current, clientName: event.target.value }))} /> : site.clientName}</td>
                    <td>{isEditing ? <input value={draft.siteName || ""} onChange={(event) => setEditingSiteDraft((current) => ({ ...current, siteName: event.target.value }))} /> : site.siteName}</td>
                    <td>{isEditing ? <input value={draft.address || ""} onChange={(event) => setEditingSiteDraft((current) => ({ ...current, address: event.target.value }))} /> : site.address || "-"}</td>
                    <td>{isEditing ? <input type="number" min={0} max={20} value={draft.requiredCrewCount || 2} onChange={(event) => setEditingSiteDraft((current) => ({ ...current, requiredCrewCount: Number(event.target.value) }))} /> : `${site.requiredCrewCount} crew`}</td>
                    <td>{isEditing ? <label className="setup-cell-check"><input type="checkbox" checked={draft.requiredInduction !== false} onChange={(event) => setEditingSiteDraft((current) => ({ ...current, requiredInduction: event.target.checked }))} /> Required</label> : site.requiredInduction ? "Required" : "Not required"}</td>
                    <td>{isEditing ? <input value={draft.notes || ""} onChange={(event) => setEditingSiteDraft((current) => ({ ...current, notes: event.target.value }))} /> : site.notes || "-"}</td>
                    <td><span className="setup-region-chip">{rowRegions(site, region).join(", ")}</span></td>
                    <td className="setup-row-actions">
                      {isEditing ? (
                        <>
                          <button type="button" disabled={saving} onClick={saveSiteRowEdit}>Save</button>
                          <button type="button" onClick={() => { setEditingSiteId(""); setEditingSiteDraft(blankSite()); }}>Cancel</button>
                        </>
                      ) : <button type="button" disabled={allRegionMode} onClick={() => startSiteRowEdit(site)}>Edit</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </CollapsibleTable>
          <CollapsibleTable
            title="Jobs Source"
            count={filteredSchedules.length}
            total={schedules.length}
            headers={["Site", "Job", "Asset", "Start", "Time", "Repeat", "Crew", "Staff", "Notes", "Region", "Action"]}
            search={scheduleSearch}
            onSearchChange={setScheduleSearch}
            regionFilter={tableRegionFilter}
            onRegionFilterChange={setTableRegionFilter}
            regionOptions={[allRegionsLabel, ...specificRegionOptions]}
          >
            <tbody>
              <tr className="setup-new-row">
                <td>
                  <select value={scheduleDraft.siteId || ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, siteId: event.target.value }))}>
                    <option value="">Choose site</option>
                    {sites.map((site) => <option value={site.id} key={site.id}>{site.clientName} - {site.siteName}</option>)}
                  </select>
                </td>
                <td><input placeholder="Job title" value={scheduleDraft.jobTitle || ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, jobTitle: event.target.value }))} /></td>
                <td><input placeholder="Unit / asset" value={scheduleDraft.washAsset || ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, washAsset: event.target.value }))} /></td>
                <td><input type="date" value={scheduleDraft.startDate || today()} onChange={(event) => setScheduleDraft((current) => ({ ...current, startDate: event.target.value }))} /></td>
                <td><input type="time" value={scheduleDraft.jobTime || "07:00"} onChange={(event) => setScheduleDraft((current) => ({ ...current, jobTime: event.target.value }))} /></td>
                <td><select value={scheduleDraft.recurrence || "Weekly"} onChange={(event) => setScheduleDraft((current) => ({ ...current, recurrence: event.target.value }))}>{recurrences.map((item) => <option key={item}>{item}</option>)}</select></td>
                <td><input type="number" min={0} max={20} value={scheduleDraft.requiredCrewCount || selectedSite?.requiredCrewCount || 2} onChange={(event) => setScheduleDraft((current) => ({ ...current, requiredCrewCount: Number(event.target.value) }))} /></td>
                <td>
                  <select multiple value={scheduleDraft.staffIds || []} onChange={(event) => setScheduleDraft((current) => ({ ...current, staffIds: Array.from(event.target.selectedOptions).map((option) => option.value) }))}>
                    {staff.map((person, index) => <option value={person.id} key={`${person.id}-${index}`}>{person.name}</option>)}
                  </select>
                </td>
                <td><input placeholder="Notes" value={scheduleDraft.notes || ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, notes: event.target.value }))} /></td>
                <td><span className="setup-region-chip">{region}</span></td>
                <td><button disabled={saving || allRegionMode || !scheduleDraft.siteId} type="button" onClick={addScheduleRow}>Add Job</button></td>
              </tr>
              {filteredSchedules.map((schedule, index) => {
                const isEditing = editingScheduleId === schedule.id;
                const draft = isEditing ? editingScheduleDraft : schedule;
                const rosteredNames = staff.filter((person) => schedule.staffIds.includes(person.id)).map((person) => person.name).join(", ");
                return (
                  <tr key={`${schedule.id}-${index}`} className={isEditing ? "setup-editing-row" : ""}>
                    <td>{isEditing ? (
                      <select value={draft.siteId || ""} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, siteId: event.target.value }))}>
                        <option value="">Choose site</option>
                        {sites.map((site) => <option value={site.id} key={site.id}>{site.clientName} - {site.siteName}</option>)}
                      </select>
                    ) : schedule.siteLabel}</td>
                    <td>{isEditing ? <input value={draft.jobTitle || ""} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, jobTitle: event.target.value }))} /> : schedule.jobTitle}</td>
                    <td>{isEditing ? <input value={draft.washAsset || ""} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, washAsset: event.target.value }))} /> : schedule.washAsset || "-"}</td>
                    <td>{isEditing ? <input type="date" value={draft.startDate || today()} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, startDate: event.target.value }))} /> : schedule.startDate}</td>
                    <td>{isEditing ? <input type="time" value={draft.jobTime || "07:00"} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, jobTime: event.target.value }))} /> : schedule.jobTime}</td>
                    <td>{isEditing ? <select value={draft.recurrence || "Weekly"} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, recurrence: event.target.value }))}>{recurrences.map((item) => <option key={item}>{item}</option>)}</select> : schedule.recurrence}</td>
                    <td>{isEditing ? <input type="number" min={0} max={20} value={draft.requiredCrewCount || selectedEditingSite?.requiredCrewCount || 2} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, requiredCrewCount: Number(event.target.value) }))} /> : `${schedule.requiredCrewCount} crew`}</td>
                    <td>{isEditing ? (
                      <select multiple value={draft.staffIds || []} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, staffIds: Array.from(event.target.selectedOptions).map((option) => option.value) }))}>
                        {staff.map((person, staffIndex) => <option value={person.id} key={`${person.id}-${staffIndex}`}>{person.name}</option>)}
                      </select>
                    ) : rosteredNames || "Unassigned"}</td>
                    <td>{isEditing ? <input value={draft.notes || ""} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, notes: event.target.value }))} /> : schedule.notes || "-"}</td>
                    <td><span className="setup-region-chip">{rowRegions(schedule, region).join(", ")}</span></td>
                    <td className="setup-row-actions">
                      {isEditing ? (
                        <>
                          <button type="button" disabled={saving || !editingScheduleDraft.siteId} onClick={saveScheduleRowEdit}>Save</button>
                          <button type="button" onClick={() => { setEditingScheduleId(""); setEditingScheduleDraft(blankSchedule()); }}>Cancel</button>
                        </>
                      ) : <button type="button" disabled={allRegionMode} onClick={() => startScheduleRowEdit(schedule)}>Edit</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </CollapsibleTable>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="setup-panel">
          <div className="setup-copy"><strong>Step 3. Site inductions</strong><p>Walk through each client site and confirm who is inducted, not inducted, expired or expiring.</p></div>
          <div className="setup-induction-grid">
            {!staff.length || !sites.some((site) => site.requiredInduction) ? <div className="setup-empty">Add staff and client sites with required inductions first, then this step becomes the site-by-site induction checklist.</div> : null}
            {sites.filter((site) => site.requiredInduction).flatMap((site) => staff.map((person) => {
              const existing = findInduction(person, site);
              return <InductionEditor key={`${person.id}-${site.id}`} person={person} site={site} existing={existing} onSave={saveInduction} />;
            }))}
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="setup-panel">
          <div className="setup-copy"><strong>Step 4. Staff availability</strong><p>Paste the editable Google Sheet link for this region. Staff can keep using the sheet, while TOC reads it live into the region view.</p></div>
          <form className="setup-grid-form" onSubmit={saveAvailability}>
            <input className="wide-input" placeholder="Google Sheet URL" value={availabilityUrl} onChange={(event) => setAvailabilityUrl(event.target.value)} />
            <button disabled={saving || allRegionMode} type="submit">Link Availability Sheet</button>
          </form>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="setup-panel training-panel">
          <strong>Step 5. TOC walkthrough</strong>
          <p>Staff holds your people list. Jobs is the source of truth for clients and recurring work. Calendar displays the generated schedule. Inductions confirms site readiness. Odin watches these sources and creates work when something needs attention.</p>
          <div className="training-cards">
            <article><span>1</span><strong>Keep Staff current</strong><small>Names, phone numbers and skills drive Odin roster logic.</small></article>
            <article><span>2</span><strong>Maintain Jobs</strong><small>Change customer schedules here, not directly in Calendar.</small></article>
            <article><span>3</span><strong>Close actions</strong><small>Managers should use Action Centre as the work close-out hub.</small></article>
          </div>
          <button disabled={saving || allRegionMode} type="button" onClick={completeSetup}>Complete Setup And Open TOC</button>
        </section>
      ) : null}

      <div className="setup-guide-footer">
        <button type="button" disabled={step <= 1} onClick={() => setStep((current) => Math.max(1, current - 1))}>Back</button>
        <div>
          <strong>Step {step} of 5</strong>
          <span>{["Staff setup", "Client jobs", "Site inductions", "Availability link", "TOC walkthrough"][step - 1]}</span>
          <i><em style={{ width: `${(step / 5) * 100}%` }} /></i>
        </div>
        {step < 5 ? <button type="button" onClick={() => setStep((current) => Math.min(5, current + 1))}>Next Step</button> : <button type="button" disabled={saving || allRegionMode} onClick={completeSetup}>Complete Setup</button>}
      </div>

      {message ? <div className="setup-message">{message}</div> : null}
    </div>
  );
}

function CollapsibleTable({
  title,
  count,
  total,
  headers,
  search,
  onSearchChange,
  regionFilter,
  onRegionFilterChange,
  regionOptions,
  children
}: {
  title: string;
  count: number;
  total?: number;
  headers: string[];
  search: string;
  onSearchChange: (value: string) => void;
  regionFilter: string;
  onRegionFilterChange: (value: string) => void;
  regionOptions: string[];
  children: ReactNode;
}) {
  return (
    <details className="setup-table" open>
      <summary><strong>{title}</strong><span>{count}{typeof total === "number" && total !== count ? ` of ${total}` : ""} rows</span></summary>
      <div className="setup-table-tools">
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={`Filter ${title.toLowerCase()}`} />
        <select value={regionFilter} onChange={(event) => onRegionFilterChange(event.target.value)}>
          {regionOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div className="setup-table-scroll">
        <table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>{children}</table>
      </div>
    </details>
  );
}

function InductionEditor({ person, site, existing, onSave }: { person: StaffRow; site: SiteRow; existing?: InductionRow; onSave: (person: StaffRow, site: SiteRow, existing?: InductionRow, status?: string, expiry?: string) => void }) {
  const [status, setStatus] = useState(existing?.status || "");
  const [expiry, setExpiry] = useState(existing?.expiry || "");
  useEffect(() => {
    setStatus(existing?.status || "");
    setExpiry(existing?.expiry || "");
  }, [existing?.status, existing?.expiry]);
  return (
    <article className="setup-induction-card">
      <strong>{person.name}</strong>
      <small>{site.clientName} - {site.siteName}</small>
      <select value={status} onChange={(event) => setStatus(event.target.value)}>{inductionStatuses.map((item) => <option value={item} key={item}>{item || "Select status"}</option>)}</select>
      <input placeholder="Expiry date" value={expiry} onChange={(event) => setExpiry(event.target.value)} />
      <button type="button" onClick={() => onSave(person, site, existing, status, expiry)}>Save</button>
    </article>
  );
}
