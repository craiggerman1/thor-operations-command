"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Tag } from "@/components/TocCards";
import { allRegions } from "@/lib/access";
import { tocFetch } from "@/lib/toc-client-auth";

type SiteRow = {
  id: string;
  clientName: string;
  siteName: string;
  region: string;
  address: string;
  siteContactName: string;
  siteContactPhone: string;
  siteContactEmail: string;
  requiredInduction: boolean;
  requiredCrewCount: number;
  siteRules: string;
  hazards: string;
  notes: string;
  status: "active" | "inactive" | "watch";
};

type ScheduleRow = {
  id: string;
  siteId: string;
  siteLabel: string;
  region: string;
  scheduleName: string;
  startDate: string;
  endDate: string;
  jobTime: string;
  recurrence: string;
  recurrenceIntervalWeeks: number;
  requiredCrewCount: number;
  jobTitle: string;
  notes: string;
  status: "active" | "inactive";
  lastGeneratedUntil: string;
};

type StaffSummary = {
  id: string;
  name: string;
  role: string;
  status: string;
  mobile: string;
};

type MasterPayload = {
  connected: boolean;
  error: string | null;
  sites: SiteRow[];
  schedules: ScheduleRow[];
  staff: StaffSummary[];
};

type SiteDraft = Omit<SiteRow, "id"> & { id?: string };
type ScheduleDraft = Omit<ScheduleRow, "id" | "siteLabel" | "lastGeneratedUntil"> & { id?: string; lastGeneratedUntil?: string };

const regions = allRegions.filter((region) => region !== "National");
const recurrenceOptions = ["None", "Daily", "Weekly", "Fortnightly", "4 weekly", "Custom"];

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function blankSite(): SiteDraft {
  return {
    clientName: "",
    siteName: "",
    region: "Brisbane",
    address: "",
    siteContactName: "",
    siteContactPhone: "",
    siteContactEmail: "",
    requiredInduction: true,
    requiredCrewCount: 2,
    siteRules: "",
    hazards: "",
    notes: "",
    status: "active"
  };
}

function blankSchedule(siteId = ""): ScheduleDraft {
  return {
    siteId,
    region: "Brisbane",
    scheduleName: "",
    startDate: todayInput(),
    endDate: "",
    jobTime: "07:00",
    recurrence: "Weekly",
    recurrenceIntervalWeeks: 1,
    requiredCrewCount: 2,
    jobTitle: "Scheduled wash",
    notes: "",
    status: "active"
  };
}

async function readMasterPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) throw new Error(response.ok ? "Operations master returned an empty response." : `Operations master request failed (${response.status}).`);
  const payload = JSON.parse(text) as MasterPayload & { generation?: { created: number; generatedUntil: string } };
  if (!response.ok) throw new Error(payload.error || "Operations master request failed.");
  return payload;
}

async function fetchMasterData() {
  const response = await tocFetch("/api/admin/operations-master", { cache: "no-store" });
  return readMasterPayload(response);
}

async function mutateMasterData(body: Record<string, unknown>) {
  const response = await tocFetch("/api/admin/operations-master", {
    method: "POST",
    body: JSON.stringify(body)
  }, true);
  return readMasterPayload(response);
}

export function AdminOperationsMasterData() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [staff, setStaff] = useState<StaffSummary[]>([]);
  const [siteDraft, setSiteDraft] = useState<SiteDraft>(blankSite);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>(blankSchedule);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const activeSites = useMemo(() => sites.filter((site) => site.status !== "inactive"), [sites]);
  const activeSchedules = useMemo(() => schedules.filter((schedule) => schedule.status !== "inactive"), [schedules]);

  function applyPayload(payload: MasterPayload) {
    setSites(payload.sites || []);
    setSchedules(payload.schedules || []);
    setStaff(payload.staff || []);
  }

  useEffect(() => {
    fetchMasterData()
      .then(applyPayload)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  function patchSite(patch: Partial<SiteDraft>) {
    setSiteDraft((current) => ({ ...current, ...patch }));
  }

  function patchSchedule(patch: Partial<ScheduleDraft>) {
    setScheduleDraft((current) => ({ ...current, ...patch }));
  }

  function editSite(site: SiteRow) {
    setEditingSiteId(site.id);
    setSiteDraft({ ...site });
  }

  function editSchedule(schedule: ScheduleRow) {
    setEditingScheduleId(schedule.id);
    setScheduleDraft({
      id: schedule.id,
      siteId: schedule.siteId,
      region: schedule.region,
      scheduleName: schedule.scheduleName,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      jobTime: schedule.jobTime,
      recurrence: schedule.recurrence,
      recurrenceIntervalWeeks: schedule.recurrenceIntervalWeeks,
      requiredCrewCount: schedule.requiredCrewCount,
      jobTitle: schedule.jobTitle,
      notes: schedule.notes,
      status: schedule.status,
      lastGeneratedUntil: schedule.lastGeneratedUntil
    });
  }

  async function saveSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!siteDraft.clientName.trim() || !siteDraft.siteName.trim()) {
      setMessage("Client name and site name are required.");
      return;
    }
    setIsSaving(true);
    setMessage("");
    try {
      const payload = await mutateMasterData({ action: "upsertSite", ...siteDraft, id: editingSiteId || undefined });
      applyPayload(payload);
      setSiteDraft(blankSite());
      setEditingSiteId(null);
      setMessage("Customer/site register saved.");
      window.dispatchEvent(new Event("toc.operationsMaster.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Customer/site could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scheduleDraft.siteId) {
      setMessage("Choose a customer/site before saving a schedule.");
      return;
    }
    setIsSaving(true);
    setMessage("");
    try {
      const payload = await mutateMasterData({ action: "upsertSchedule", ...scheduleDraft, id: editingScheduleId || undefined });
      applyPayload(payload);
      setScheduleDraft(blankSchedule(scheduleDraft.siteId));
      setEditingScheduleId(null);
      setMessage("Site schedule saved.");
      window.dispatchEvent(new Event("toc.operationsMaster.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Schedule could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveSite(id: string) {
    if (!window.confirm("Archive this customer/site? Existing calendar jobs will remain.")) return;
    setMessage("");
    try {
      const payload = await mutateMasterData({ action: "archiveSite", id });
      applyPayload(payload);
      setMessage("Customer/site archived.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Site could not be archived.");
    }
  }

  async function archiveSchedule(id: string) {
    if (!window.confirm("Archive this schedule? Existing calendar jobs will remain.")) return;
    setMessage("");
    try {
      const payload = await mutateMasterData({ action: "archiveSchedule", id });
      applyPayload(payload);
      setMessage("Schedule archived.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Schedule could not be archived.");
    }
  }

  async function generateJobs(id: string) {
    setMessage("");
    try {
      const payload = await mutateMasterData({ action: "generateScheduleJobs", id });
      applyPayload(payload);
      setMessage(payload.generation ? `Generated ${payload.generation.created} calendar jobs through ${payload.generation.generatedUntil}.` : "Schedule checked. No new calendar jobs needed.");
      window.dispatchEvent(new Event("toc.calendar.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calendar jobs could not be generated.");
    }
  }

  function chooseScheduleSite(siteId: string) {
    const site = sites.find((item) => item.id === siteId);
    patchSchedule({
      siteId,
      region: site?.region || scheduleDraft.region,
      requiredCrewCount: site?.requiredCrewCount || scheduleDraft.requiredCrewCount
    });
  }

  return (
    <div className="admin-master-data">
      <div className="admin-access-summary">
        <article><span>Customer/sites</span><strong>{sites.length}</strong></article>
        <article><span>Active sites</span><strong>{activeSites.length}</strong></article>
        <article><span>Recurring schedules</span><strong>{activeSchedules.length}</strong></article>
        <article><span>Staff records</span><strong>{staff.length}</strong></article>
      </div>

      <section className="master-data-grid">
        <form className="master-data-sheet" onSubmit={saveSite}>
          <div className="master-data-head">
            <div>
              <strong>Customer / Site Register</strong>
              <small>National source of truth for each regional customer site.</small>
            </div>
            <Tag tone="green">Database table</Tag>
          </div>
          <div className="master-row master-row-head">
            <span>Client</span><span>Site</span><span>Region</span><span>Crew</span><span>Contact</span><span>Status</span>
          </div>
          <div className="master-row">
            <input value={siteDraft.clientName} onChange={(event) => patchSite({ clientName: event.target.value })} placeholder="Linfox" />
            <input value={siteDraft.siteName} onChange={(event) => patchSite({ siteName: event.target.value })} placeholder="Brisbane DC" />
            <select value={siteDraft.region} onChange={(event) => patchSite({ region: event.target.value })}>{regions.map((region) => <option key={region}>{region}</option>)}</select>
            <input type="number" min="0" max="20" value={siteDraft.requiredCrewCount} onChange={(event) => patchSite({ requiredCrewCount: Number(event.target.value) })} />
            <input value={siteDraft.siteContactName} onChange={(event) => patchSite({ siteContactName: event.target.value })} placeholder="Site contact" />
            <select value={siteDraft.status} onChange={(event) => patchSite({ status: event.target.value as SiteDraft["status"] })}>
              <option value="active">Active</option>
              <option value="watch">Watch</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <details className="master-data-details">
            <summary>Site rules, address and contact details</summary>
            <div className="admin-action-grid">
              <label><span>Address</span><input value={siteDraft.address} onChange={(event) => patchSite({ address: event.target.value })} /></label>
              <label><span>Phone</span><input value={siteDraft.siteContactPhone} onChange={(event) => patchSite({ siteContactPhone: event.target.value })} /></label>
              <label><span>Email</span><input value={siteDraft.siteContactEmail} onChange={(event) => patchSite({ siteContactEmail: event.target.value })} /></label>
            </div>
            <label className="admin-checkbox-row"><input type="checkbox" checked={siteDraft.requiredInduction} onChange={(event) => patchSite({ requiredInduction: event.target.checked })} /><span>Site induction required</span></label>
            <label><span>Site rules</span><textarea value={siteDraft.siteRules} onChange={(event) => patchSite({ siteRules: event.target.value })} /></label>
            <label><span>Hazards</span><textarea value={siteDraft.hazards} onChange={(event) => patchSite({ hazards: event.target.value })} /></label>
            <label><span>Notes</span><textarea value={siteDraft.notes} onChange={(event) => patchSite({ notes: event.target.value })} /></label>
          </details>
          <div className="admin-action-controls">
            <button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : editingSiteId ? "Save Site" : "Add Site"}</button>
            {editingSiteId ? <button type="button" onClick={() => { setEditingSiteId(null); setSiteDraft(blankSite()); }}>Cancel Edit</button> : null}
          </div>
        </form>

        <form className="master-data-sheet" onSubmit={saveSchedule}>
          <div className="master-data-head">
            <div>
              <strong>Recurring Site Schedule</strong>
              <small>Creates calendar jobs from the site register when required.</small>
            </div>
            <Tag tone="blue">Calendar linked</Tag>
          </div>
          <div className="master-row master-row-head">
            <span>Site</span><span>Start</span><span>Time</span><span>Repeat</span><span>Crew</span><span>Status</span>
          </div>
          <div className="master-row">
            <select value={scheduleDraft.siteId} onChange={(event) => chooseScheduleSite(event.target.value)}>
              <option value="">Choose site</option>
              {activeSites.map((site) => <option value={site.id} key={site.id}>{site.clientName} - {site.siteName}</option>)}
            </select>
            <input type="date" value={scheduleDraft.startDate} onChange={(event) => patchSchedule({ startDate: event.target.value })} />
            <input value={scheduleDraft.jobTime} onChange={(event) => patchSchedule({ jobTime: event.target.value })} placeholder="07:00" />
            <select value={scheduleDraft.recurrence} onChange={(event) => patchSchedule({ recurrence: event.target.value })}>{recurrenceOptions.map((item) => <option key={item}>{item}</option>)}</select>
            <input type="number" min="0" max="20" value={scheduleDraft.requiredCrewCount} onChange={(event) => patchSchedule({ requiredCrewCount: Number(event.target.value) })} />
            <select value={scheduleDraft.status} onChange={(event) => patchSchedule({ status: event.target.value as ScheduleDraft["status"] })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="admin-action-grid">
            <label><span>Schedule name</span><input value={scheduleDraft.scheduleName} onChange={(event) => patchSchedule({ scheduleName: event.target.value })} placeholder="Friday night wash" /></label>
            <label><span>Job title</span><input value={scheduleDraft.jobTitle} onChange={(event) => patchSchedule({ jobTitle: event.target.value })} /></label>
            <label><span>Region</span><select value={scheduleDraft.region} onChange={(event) => patchSchedule({ region: event.target.value })}>{regions.map((region) => <option key={region}>{region}</option>)}</select></label>
            {scheduleDraft.recurrence === "Custom" ? <label><span>Every weeks</span><input type="number" min="1" max="52" value={scheduleDraft.recurrenceIntervalWeeks} onChange={(event) => patchSchedule({ recurrenceIntervalWeeks: Number(event.target.value) })} /></label> : null}
          </div>
          <label><span>Schedule notes</span><textarea value={scheduleDraft.notes} onChange={(event) => patchSchedule({ notes: event.target.value })} /></label>
          <div className="admin-action-controls">
            <button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : editingScheduleId ? "Save Schedule" : "Add Schedule"}</button>
            {editingScheduleId ? <button type="button" onClick={() => { setEditingScheduleId(null); setScheduleDraft(blankSchedule(scheduleDraft.siteId)); }}>Cancel Edit</button> : null}
          </div>
        </form>
      </section>

      <section className="master-data-list">
        <div className="master-data-head">
          <div>
            <strong>Live master rows</strong>
            <small>Edit rows like a compact spreadsheet. Archived rows stop being operational defaults.</small>
          </div>
        </div>
        <div className="master-table">
          <div className="master-table-row master-table-head"><span>Type</span><span>Name</span><span>Region</span><span>Key detail</span><span>Actions</span></div>
          {sites.map((site) => (
            <div className="master-table-row" key={`site-${site.id}`}>
              <span>Site</span>
              <strong>{site.clientName} - {site.siteName}</strong>
              <span>{site.region}</span>
              <span>{site.requiredCrewCount} crew - {site.requiredInduction ? "Induction required" : "No induction flag"}</span>
              <span className="master-row-actions"><button type="button" onClick={() => editSite(site)}>Edit</button><button type="button" className="danger-button" onClick={() => void archiveSite(site.id)}>Archive</button></span>
            </div>
          ))}
          {schedules.map((schedule) => (
            <div className="master-table-row" key={`schedule-${schedule.id}`}>
              <span>Schedule</span>
              <strong>{schedule.scheduleName || schedule.jobTitle}</strong>
              <span>{schedule.region}</span>
              <span>{schedule.siteLabel} - {schedule.recurrence} - {schedule.jobTime}</span>
              <span className="master-row-actions"><button type="button" onClick={() => editSchedule(schedule)}>Edit</button><button type="button" onClick={() => void generateJobs(schedule.id)}>Generate Jobs</button><button type="button" className="danger-button" onClick={() => void archiveSchedule(schedule.id)}>Archive</button></span>
            </div>
          ))}
        </div>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </section>
    </div>
  );
}
