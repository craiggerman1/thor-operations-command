"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { allRegions } from "@/lib/access";
import { tocFetch } from "@/lib/toc-client-auth";

type StaffRow = { id: string; name: string; role: string; status: string; skills: string[]; mobile: string; whatsapp: string; availabilitySheetName: string; inductionSheetName: string; notes: string };
type SiteRow = { id: string; clientName: string; siteName: string; address: string; requiredInduction: boolean; requiredCrewCount: number; notes: string; status: string };
type ScheduleRow = { id: string; siteId: string; siteLabel: string; scheduleName: string; startDate: string; endDate: string; jobTime: string; recurrence: string; recurrenceIntervalWeeks: number; requiredCrewCount: number; jobTitle: string; washAsset: string; notes: string; status: string; staffIds: string[] };
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

const skills = ["Wash Hand", "Driver", "Team Leader"];
const recurrences = ["None", "Daily", "Weekly", "Fortnightly", "4 weekly", "Custom"];
const inductionStatuses = ["", "Inducted", "Not Inducted", "Expired", "Expiring Soon", "Expiring This Month"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function blankStaff(): Partial<StaffRow> {
  return { name: "", role: "Wash Hand", status: "active", skills: ["Wash Hand"], mobile: "", whatsapp: "", notes: "" };
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

function skillToggle(selected: string[] = [], skill: string) {
  return selected.includes(skill) ? selected.filter((item) => item !== skill) : [...selected, skill];
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) throw new Error("TOC setup returned no response.");
  const payload = JSON.parse(text) as SetupPayload;
  if (!response.ok) throw new Error(payload.error || "TOC setup request failed.");
  return payload;
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

  const regionOptions = useMemo(() => allRegions.filter((item) => item !== "National"), []);
  const staff = payload?.staff || [];
  const sites = payload?.sites || [];
  const schedules = payload?.schedules || [];
  const inductions = payload?.inductions || [];
  const selectedSite = sites.find((site) => site.id === scheduleDraft.siteId);

  async function load(nextRegion = region) {
    setMessage("");
    try {
      const response = await tocFetch(`/api/operations-setup?region=${encodeURIComponent(nextRegion)}`, { cache: "no-store" });
      const nextPayload = await readPayload(response);
      setPayload(nextPayload);
      setAvailabilityUrl(nextPayload.availabilitySource?.spreadsheetUrl || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Setup data could not be loaded.");
    }
  }

  useEffect(() => {
    void load(region);
  }, [region]);

  async function mutate(body: Record<string, unknown>, success: string) {
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
    const ok = await mutate({ action: "upsertStaff", ...staffDraft }, "Staff member saved to the region database.");
    if (ok) setStaffDraft(blankStaff());
  }

  async function saveSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await mutate({ action: "upsertSite", ...siteDraft }, "Client site saved.");
    if (ok) setSiteDraft(blankSite());
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await mutate({ action: "upsertSchedule", ...scheduleDraft, requiredCrewCount: scheduleDraft.requiredCrewCount || selectedSite?.requiredCrewCount || 2, generateCalendarJobs: true }, "Recurring job saved and pushed to Calendar.");
    if (ok) setScheduleDraft(blankSchedule());
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
          <div className="setup-copy"><strong>Step 1. Staff</strong><p>Add every person who works in this region. Odin uses this for roster suggestions, escalation context and induction matching.</p></div>
          <form className="setup-grid-form" onSubmit={saveStaff}>
            <input placeholder="Staff name" value={staffDraft.name || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, name: event.target.value }))} />
            <input placeholder="Mobile phone" value={staffDraft.mobile || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, mobile: event.target.value }))} />
            <input placeholder="WhatsApp / Telegram phone" value={staffDraft.whatsapp || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, whatsapp: event.target.value }))} />
            <select value={staffDraft.role || "Wash Hand"} onChange={(event) => setStaffDraft((current) => ({ ...current, role: event.target.value }))}>
              {skills.map((skill) => <option key={skill}>{skill}</option>)}
            </select>
            <div className="setup-checks">{skills.map((skill) => <label key={skill}><input type="checkbox" checked={(staffDraft.skills || []).includes(skill)} onChange={() => setStaffDraft((current) => ({ ...current, skills: skillToggle(current.skills, skill) }))} /> {skill}</label>)}</div>
            <input placeholder="Notes for Odin / manager" value={staffDraft.notes || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, notes: event.target.value }))} />
            <button disabled={saving} type="submit">Add Staff</button>
          </form>
          <CollapsibleTable title="Current Staff" count={staff.length}>
            <tbody>{staff.map((person) => <tr key={person.id}><td>{person.name}</td><td>{person.mobile || "No phone"}</td><td>{person.skills.join(", ") || person.role}</td><td>{person.status}</td></tr>)}</tbody>
          </CollapsibleTable>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="setup-panel">
          <div className="setup-copy"><strong>Step 2. Clients and recurring jobs</strong><p>Create the client/site first, then add its recurring job schedule, rostered staff and wash asset. Calendar is generated from these jobs.</p></div>
          <form className="setup-grid-form" onSubmit={saveSite}>
            <input placeholder="Client name" value={siteDraft.clientName || ""} onChange={(event) => setSiteDraft((current) => ({ ...current, clientName: event.target.value }))} />
            <input placeholder="Site location / site name" value={siteDraft.siteName || ""} onChange={(event) => setSiteDraft((current) => ({ ...current, siteName: event.target.value }))} />
            <input placeholder="Address" value={siteDraft.address || ""} onChange={(event) => setSiteDraft((current) => ({ ...current, address: event.target.value }))} />
            <input type="number" min={0} max={20} value={siteDraft.requiredCrewCount || 2} onChange={(event) => setSiteDraft((current) => ({ ...current, requiredCrewCount: Number(event.target.value) }))} />
            <label><input type="checkbox" checked={siteDraft.requiredInduction !== false} onChange={(event) => setSiteDraft((current) => ({ ...current, requiredInduction: event.target.checked }))} /> Site induction required</label>
            <input placeholder="Site notes" value={siteDraft.notes || ""} onChange={(event) => setSiteDraft((current) => ({ ...current, notes: event.target.value }))} />
            <button disabled={saving} type="submit">Add Client Site</button>
          </form>
          <form className="setup-grid-form" onSubmit={saveSchedule}>
            <select value={scheduleDraft.siteId || ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, siteId: event.target.value }))}>
              <option value="">Choose client site</option>
              {sites.map((site) => <option value={site.id} key={site.id}>{site.clientName} - {site.siteName}</option>)}
            </select>
            <input placeholder="Job title" value={scheduleDraft.jobTitle || ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, jobTitle: event.target.value }))} />
            <input placeholder="Wash asset / unit" value={scheduleDraft.washAsset || ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, washAsset: event.target.value }))} />
            <input type="date" value={scheduleDraft.startDate || today()} onChange={(event) => setScheduleDraft((current) => ({ ...current, startDate: event.target.value }))} />
            <input type="time" value={scheduleDraft.jobTime || "07:00"} onChange={(event) => setScheduleDraft((current) => ({ ...current, jobTime: event.target.value }))} />
            <select value={scheduleDraft.recurrence || "Weekly"} onChange={(event) => setScheduleDraft((current) => ({ ...current, recurrence: event.target.value }))}>{recurrences.map((item) => <option key={item}>{item}</option>)}</select>
            <select multiple value={scheduleDraft.staffIds || []} onChange={(event) => setScheduleDraft((current) => ({ ...current, staffIds: Array.from(event.target.selectedOptions).map((option) => option.value) }))}>
              {staff.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}
            </select>
            <button disabled={saving} type="submit">Save Job And Generate Calendar</button>
          </form>
          <CollapsibleTable title="Jobs Source" count={schedules.length}>
            <tbody>{schedules.map((schedule) => <tr key={schedule.id}><td>{schedule.siteLabel}</td><td>{schedule.jobTitle}</td><td>{schedule.recurrence}</td><td>{schedule.washAsset || "No asset"}</td></tr>)}</tbody>
          </CollapsibleTable>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="setup-panel">
          <div className="setup-copy"><strong>Step 3. Site inductions</strong><p>Walk through each client site and confirm who is inducted, not inducted, expired or expiring.</p></div>
          <div className="setup-induction-grid">
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
            <button disabled={saving} type="submit">Link Availability Sheet</button>
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
          <button disabled={saving} type="button" onClick={completeSetup}>Complete Setup And Open TOC</button>
        </section>
      ) : null}

      {message ? <div className="setup-message">{message}</div> : null}
    </div>
  );
}

function CollapsibleTable({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <details className="setup-table" open>
      <summary><strong>{title}</strong><span>{count} rows</span></summary>
      <table><thead><tr><th>Name</th><th>Detail</th><th>Type</th><th>Status</th></tr></thead>{children}</table>
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
