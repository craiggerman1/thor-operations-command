"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { allRegions } from "@/lib/access";
import { THOR_ABCD_WEEKS, formatAbcdWeeks } from "@/lib/abcd-schedule";
import { clearTocClientCache, tocFetch } from "@/lib/toc-client-auth";

type StaffRow = { id: string; name: string; role: string; status: string; skills: string[]; mobile: string; whatsapp: string; availabilitySheetName: string; inductionSheetName: string; notes: string; regions?: string[] };
type SiteRow = { id: string; clientName: string; siteName: string; address: string; requiredInduction: boolean; requiredCrewCount: number; notes: string; status: string; regions?: string[] };
type ScheduleRow = { id: string; siteId: string; siteLabel: string; clientName: string; siteName: string; address: string; requiredInduction: boolean; scheduleName: string; startDate: string; endDate: string; jobTime: string; recurrence: string; recurrenceIntervalWeeks: number; abcdWeeks: string[]; requiredCrewCount: number; jobTitle: string; washAsset: string; notes: string; status: string; staffIds: string[]; regions?: string[]; scheduleIds?: string[]; sourceCount?: number };
type InductionRow = { id: string; staffId: string; siteId: string; staffName: string; siteName: string; status: string; expiry: string };
type RosterImportRow = {
  rowNumber: number;
  region: string;
  clientName: string;
  siteName: string;
  jobDay: string;
  startTime: string;
  resolvedStartDate: string;
  frequency: string;
  abcdWeeks: string[];
  staffRequired: number;
  rosteredStaff: string[];
  matchedStaff: Array<{ name: string; id: string }>;
  unmatchedStaff: string[];
  washAsset: string;
  status: "valid" | "warning" | "error";
  messages: string[];
  duplicateHint: string;
};
type RosterImportResult = {
  connected: boolean;
  mode: "preview" | "import";
  error?: string;
  summary: { totalRows: number; validRows: number; warningRows: number; errorRows: number; importableRows?: number; importedRows?: number; failedRows?: number; batchOffset?: number; batchLimit?: number; batchCount?: number; nextOffset?: number; remainingRows?: number; allRowsImported?: boolean };
  rows: RosterImportRow[];
  imported?: Array<{ rowNumber: number; siteId: string; scheduleId: string; calendarJobsCreated: number; calendarJobsUpdated: number }>;
  failed?: Array<{ rowNumber: number; error: string }>;
};
type RosterImportStatus = {
  tone: "blue" | "green" | "amber" | "red";
  title: string;
  detail: string;
};
type SetupPayload = {
  connected: boolean;
  error?: string;
  region: string;
  setup?: { completed_at?: string | null; force_run_next_login?: boolean | null };
  availabilitySource?: { spreadsheetUrl?: string; sourceName?: string } | null;
  inductionSource?: { spreadsheetUrl?: string; sourceName?: string } | null;
  staff: StaffRow[];
  sites: SiteRow[];
  schedules: ScheduleRow[];
  inductions: InductionRow[];
};
type AvailabilityFeed = { staff?: Array<{ name: string }> };
type InductionFeed = { staff?: Array<{ name: string }>; sites?: Array<{ name: string; region?: string }> };

const skills = ["Wash Hand", "Driver", "Team Leader"];
const allRegionsLabel = "All regions";
const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function today() {
  return formatLocalDate(new Date());
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateFromIso(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function dayFromDate(dateString?: string) {
  const date = dateString ? localDateFromIso(dateString) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return weekDays[(date.getDay() + 6) % 7] || "";
}

function nextDateForDay(dayName: string) {
  const dayIndex = weekDays.findIndex((day) => day === dayName);
  if (dayIndex < 0) return today();
  const targetNativeDay = (dayIndex + 1) % 7;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const offset = (targetNativeDay - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + offset);
  return formatLocalDate(date);
}

function blankStaff(): Partial<StaffRow> {
  return { name: "", role: "Wash Hand", status: "active", skills: ["Wash Hand"], mobile: "", whatsapp: "", availabilitySheetName: "", inductionSheetName: "", notes: "" };
}

function blankSchedule(): Partial<ScheduleRow> {
  return { siteId: "", siteLabel: "", clientName: "", siteName: "", address: "", requiredInduction: true, scheduleName: "", startDate: today(), endDate: "", jobTime: "07:00", recurrence: "Weekly", recurrenceIntervalWeeks: 1, abcdWeeks: [], requiredCrewCount: 2, jobTitle: "Scheduled wash", washAsset: "", notes: "", status: "active", staffIds: [] };
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

function readSessionCanManageAllSetup() {
  if (typeof window === "undefined") return false;
  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.role === "admin" || session?.scope === "National";
  } catch {
    return false;
  }
}

function readSessionRegions(canManageAllSetup: boolean) {
  if (typeof window === "undefined") return ["Brisbane"];
  if (!canManageAllSetup) return [readSessionScope()];
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

function weekToggle(selected: string[] = [], week: string) {
  return selected.includes(week) ? selected.filter((item) => item !== week) : [...selected, week];
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

function scheduleGroupKey(schedule: ScheduleRow) {
  return [
    rowRegions(schedule, "").join("|"),
    schedule.siteId || cleanNameKey(`${schedule.clientName} ${schedule.siteName}`),
    dayFromDate(schedule.startDate),
    schedule.jobTime,
    cleanNameKey(schedule.jobTitle || "Scheduled wash"),
    cleanNameKey(schedule.washAsset || ""),
    String(schedule.requiredCrewCount || 0),
    schedule.requiredInduction === false ? "no-induction" : "induction",
    [...(schedule.staffIds || [])].sort().join("|"),
    cleanNameKey(schedule.notes || "")
  ].join("::");
}

function mergeScheduleGroup(group: ScheduleRow[]) {
  const [first] = group;
  const allWeeks = Array.from(new Set(group.flatMap((schedule) => schedule.abcdWeeks || []))).filter(Boolean);
  const hasEveryWeekRow = group.some((schedule) => !schedule.abcdWeeks?.length);
  const scheduleIds = group.map((schedule) => schedule.id).filter(Boolean);
  return {
    ...first,
    id: scheduleIds[0] || first.id,
    scheduleIds,
    sourceCount: group.length,
    abcdWeeks: hasEveryWeekRow ? [] : THOR_ABCD_WEEKS.filter((week) => allWeeks.includes(week)),
    startDate: group.map((schedule) => schedule.startDate).sort()[0] || first.startDate
  };
}

function mergeSchedulesForDisplay(schedules: ScheduleRow[]) {
  const groups = new Map<string, ScheduleRow[]>();
  schedules.forEach((schedule) => {
    const key = scheduleGroupKey(schedule);
    groups.set(key, [...(groups.get(key) || []), schedule]);
  });
  return Array.from(groups.values()).map(mergeScheduleGroup);
}

export function OperationsSetupWizard({ adminMode = false, initialStep = 1 }: { adminMode?: boolean; initialStep?: number }) {
  const [region, setRegion] = useState(readSessionScope);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [step, setStep] = useState(initialStep);
  const [payload, setPayload] = useState<SetupPayload | null>(null);
  const [staffDraft, setStaffDraft] = useState<Partial<StaffRow>>(blankStaff);
  const [scheduleDraft, setScheduleDraft] = useState<Partial<ScheduleRow>>(blankSchedule);
  const [availabilityUrl, setAvailabilityUrl] = useState("");
  const [inductionUrl, setInductionUrl] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [useMobileAsWhatsapp, setUseMobileAsWhatsapp] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [tableRegionFilter, setTableRegionFilter] = useState(allRegionsLabel);
  const [editingStaffId, setEditingStaffId] = useState("");
  const [editingStaffDraft, setEditingStaffDraft] = useState<Partial<StaffRow>>(blankStaff);
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [editingScheduleDraft, setEditingScheduleDraft] = useState<Partial<ScheduleRow>>(blankSchedule);
  const [availabilityRowsByRegion, setAvailabilityRowsByRegion] = useState<Record<string, string[]>>({});
  const [inductionRowsByRegion, setInductionRowsByRegion] = useState<Record<string, string[]>>({});
  const [inductionSitesByRegion, setInductionSitesByRegion] = useState<Record<string, string[]>>({});
  const [rosterImportFile, setRosterImportFile] = useState<File | null>(null);
  const [rosterImportResult, setRosterImportResult] = useState<RosterImportResult | null>(null);
  const [rosterImportBusy, setRosterImportBusy] = useState(false);
  const [rosterImportStatus, setRosterImportStatus] = useState<RosterImportStatus | null>(null);

  const canManageAllSetup = useMemo(() => adminMode && readSessionCanManageAllSetup(), [adminMode, sessionVersion]);
  const regionOptions = useMemo(() => canManageAllSetup ? [allRegionsLabel, ...allRegions.filter((item) => item !== "National")] : readSessionRegions(false), [canManageAllSetup, sessionVersion]);
  const specificRegionOptions = useMemo(() => regionOptions.filter((item) => item !== allRegionsLabel), [regionOptions]);
  const allRegionMode = canManageAllSetup && region === allRegionsLabel;
  const staff = payload?.staff || [];
  const schedules = payload?.schedules || [];
  const inductions = payload?.inductions || [];
  const filteredStaff = useMemo(() => staff.filter((person) => {
    const regions = rowRegions(person, region);
    const sheetRows = regions.flatMap((item) => availabilityRowsByRegion[item] || []);
    const matchLabel = sheetRows.some((name) => cleanNameKey(name) === cleanNameKey(person.availabilitySheetName || person.name)) ? "matched" : "not matched";
    const regionMatch = tableRegionFilter === allRegionsLabel || regions.includes(tableRegionFilter);
    return regionMatch && matchesSearch([person.name, person.mobile, person.whatsapp, person.availabilitySheetName, matchLabel, person.role, person.skills.join(" "), regions.join(" "), person.notes], staffSearch);
  }), [staff, availabilityRowsByRegion, staffSearch, tableRegionFilter, region]);
  const displaySchedules = useMemo(() => mergeSchedulesForDisplay(schedules), [schedules]);
  const filteredSchedules = useMemo(() => displaySchedules.filter((schedule) => {
    const regions = rowRegions(schedule, region);
    const rosteredNames = staff.filter((person) => schedule.staffIds.includes(person.id)).map((person) => person.name).join(" ");
    const inductionMatch = siteMatchForSchedule(schedule);
    const inductionLabel = schedule.requiredInduction ? (inductionMatch.matched ? "induction site matched" : inductionMatch.hasLinkedSource ? "induction site not matched" : "induction sheet not linked") : "induction not required";
    const regionMatch = tableRegionFilter === allRegionsLabel || regions.includes(tableRegionFilter);
    return regionMatch && matchesSearch([schedule.siteLabel, schedule.clientName, schedule.siteName, schedule.jobTitle, schedule.washAsset, schedule.recurrence, formatAbcdWeeks(schedule.abcdWeeks || []), rosteredNames, inductionLabel, regions.join(" "), schedule.notes], scheduleSearch);
  }), [displaySchedules, staff, scheduleSearch, tableRegionFilter, region, inductionSitesByRegion, inductionUrl, payload?.inductionSource?.spreadsheetUrl]);

  async function load(nextRegion = region) {
    setMessage("");
    try {
      if (canManageAllSetup && nextRegion === allRegionsLabel) {
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
        setInductionUrl("");
        setTableRegionFilter(allRegionsLabel);
        void loadAvailabilityRows(specificRegionOptions);
        void loadInductionRows(specificRegionOptions);
        return;
      }
      const response = await tocFetch(`/api/operations-setup?region=${encodeURIComponent(nextRegion)}`, { cache: "no-store" });
      const nextPayload = await readPayload(response);
      setPayload(nextPayload);
      setAvailabilityUrl(nextPayload.availabilitySource?.spreadsheetUrl || "");
      setInductionUrl(nextPayload.inductionSource?.spreadsheetUrl || "");
      setTableRegionFilter(nextRegion);
      void loadAvailabilityRows([nextRegion]);
      void loadInductionRows([nextRegion]);
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

  async function loadInductionRows(regions: string[]) {
    const entries = await Promise.all(regions.map(async (item) => {
      try {
        const response = await tocFetch(`/api/inductions?scope=${encodeURIComponent(item)}&refresh=${Date.now()}`, { cache: "no-store" });
        const feed = await response.json() as InductionFeed;
        return [item, {
          staff: (feed.staff || []).map((person) => person.name).filter(Boolean),
          sites: (feed.sites || []).map((site) => site.name).filter(Boolean)
        }] as const;
      } catch {
        return [item, { staff: [] as string[], sites: [] as string[] }] as const;
      }
    }));
    setInductionRowsByRegion((current) => ({ ...current, ...Object.fromEntries(entries.map(([item, value]) => [item, value.staff])) }));
    setInductionSitesByRegion((current) => ({ ...current, ...Object.fromEntries(entries.map(([item, value]) => [item, value.sites])) }));
  }

  useEffect(() => {
    void load(region);
  }, [region]);

  useEffect(() => {
    if (!regionOptions.includes(region)) setRegion(regionOptions[0] || "Brisbane");
  }, [region, regionOptions]);

  useEffect(() => {
    function syncSessionAccess() {
      setSessionVersion((current) => current + 1);
      if (!readSessionCanManageAllSetup()) setRegion(readSessionScope());
    }

    window.addEventListener("toc.sessionchange", syncSessionAccess);
    window.addEventListener("toc.scopechange", syncSessionAccess);
    window.addEventListener("storage", syncSessionAccess);
    return () => {
      window.removeEventListener("toc.sessionchange", syncSessionAccess);
      window.removeEventListener("toc.scopechange", syncSessionAccess);
      window.removeEventListener("storage", syncSessionAccess);
    };
  }, []);

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
      if (body.action === "saveAvailabilitySource" || body.action === "saveInductionSource") {
        window.dispatchEvent(new Event("toc.sheetSourceSettings.updated"));
      }
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Setup update failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addStaffRow() {
    const selectedSkills = staffDraft.skills?.length ? staffDraft.skills : ["Wash Hand"];
    const ok = await mutate({
      action: "upsertStaff",
      ...staffDraft,
      whatsapp: useMobileAsWhatsapp ? staffDraft.mobile : staffDraft.whatsapp,
      useMobileAsWhatsapp,
      role: roleFromSkills(selectedSkills),
      skills: selectedSkills
    }, "Staff member saved to the region database.");
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
    const ok = await mutate({
      action: "upsertStaff",
      ...editingStaffDraft,
      whatsapp: useMobileAsWhatsapp ? editingStaffDraft.mobile : editingStaffDraft.whatsapp,
      useMobileAsWhatsapp,
      role: roleFromSkills(selectedSkills),
      skills: selectedSkills
    }, "Staff row saved to the region database.");
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

  async function toggleMobileAsWhatsapp(checked: boolean) {
    setUseMobileAsWhatsapp(checked);
    if (checked) {
      setStaffDraft((current) => ({ ...current, whatsapp: current.mobile || current.whatsapp || "" }));
      setEditingStaffDraft((current) => ({ ...current, whatsapp: current.mobile || current.whatsapp || "" }));
      const ok = await mutate({ action: "syncRegionWhatsappFromMobile" }, "WhatsApp numbers copied from mobile numbers for this region.");
      if (!ok) setUseMobileAsWhatsapp(false);
    }
  }

  async function addScheduleRow() {
    const ok = await mutate({ action: "upsertClientJob", ...scheduleDraft, recurrence: "Weekly", recurrenceIntervalWeeks: 1, requiredCrewCount: scheduleDraft.requiredCrewCount || 2 }, "Client job saved and pushed to Calendar.");
    if (ok) setScheduleDraft(blankSchedule());
  }

  async function submitRosterImport(mode: "preview" | "import") {
    if (!rosterImportFile) {
      setMessage("Choose a roster import file first.");
      return;
    }
    const batchSize = 20;
    setRosterImportBusy(true);
    setMessage("");
    setRosterImportStatus({
      tone: "blue",
      title: mode === "preview" ? "Checking roster workbook" : "Saving roster workbook",
      detail: mode === "preview"
        ? "Reading every uploaded row and checking region, client, site and staff matches."
        : "Writing valid rows to Recurring Client Jobs, linking normal staff and regenerating Calendar jobs."
    });
    try {
      const sendRosterImportBatch = async (batchMode: "preview" | "import", batchOffset = 0) => {
        const formData = new FormData();
        formData.append("file", rosterImportFile);
        formData.append("mode", batchMode);
        formData.append("region", allRegionMode ? "National" : region);
        if (batchMode === "import") {
          formData.append("batchOffset", String(batchOffset));
          formData.append("batchLimit", String(batchSize));
        }
        const response = await tocFetch("/api/operations-setup/roster-import", { method: "POST", body: formData });
        const payload = await response.json() as RosterImportResult;
        if (!response.ok) throw new Error(payload.error || "Roster import failed.");
        return payload;
      };

      if (mode === "import") {
        let offset = 0;
        let expected = rosterImportResult?.summary.importableRows || 0;
        let previewRows = rosterImportResult?.rows || [];
        const importedRows: RosterImportResult["imported"] = [];
        const failedRows: RosterImportResult["failed"] = [];
        let latestPayload: RosterImportResult | null = null;

        do {
          setRosterImportStatus({
            tone: "blue",
            title: "Saving roster workbook",
            detail: expected
              ? `Saving rows ${offset + 1}-${Math.min(offset + batchSize, expected)} of ${expected}. This keeps large imports stable and prevents timeout.`
              : "Starting roster import in stable batches."
          });
          latestPayload = await sendRosterImportBatch("import", offset);
          if (!expected) expected = latestPayload.summary.importableRows || 0;
          if (!previewRows.length) previewRows = latestPayload.rows || [];
          importedRows.push(...(latestPayload.imported || []));
          failedRows.push(...(latestPayload.failed || []));
          offset = latestPayload.summary.nextOffset ?? offset + (latestPayload.summary.batchCount || batchSize);
          setRosterImportResult({
            ...latestPayload,
            rows: previewRows.length ? previewRows : latestPayload.rows,
            imported: importedRows,
            failed: failedRows,
            summary: {
              ...latestPayload.summary,
              importedRows: importedRows.length,
              failedRows: failedRows.length,
              allRowsImported: expected ? offset >= expected && !failedRows.length : latestPayload.summary.allRowsImported
            }
          });
        } while (expected && offset < expected && latestPayload?.summary.remainingRows !== 0);

        clearTocClientCache();
        setRosterImportStatus({
          tone: "blue",
          title: "Refreshing TOC job tables",
          detail: "Import saved. Reloading Recurring Client Jobs now so the full uploaded roster is visible immediately."
        });
        await load(region);
        clearTocClientCache();
        window.dispatchEvent(new Event("toc.operationsSetup.updated"));
        window.dispatchEvent(new Event("toc.calendar.updated"));
        const failed = failedRows.length;
        const imported = importedRows.length;
        const finalExpected = expected || latestPayload?.summary.importableRows || 0;
        const finalPayload = latestPayload || rosterImportResult;
        if (finalPayload) {
          setRosterImportResult({
            ...finalPayload,
            rows: previewRows.length ? previewRows : finalPayload.rows,
            imported: importedRows,
            failed: failedRows,
            summary: {
              ...finalPayload.summary,
              importedRows: imported,
              failedRows: failed,
              allRowsImported: imported === finalExpected && failed === 0
            }
          });
        }
        setRosterImportStatus(failed
          ? {
              tone: "amber",
              title: "Roster import completed with row issues",
              detail: `${imported}/${finalExpected} importable rows saved. ${failed} row issue${failed === 1 ? "" : "s"} need review below.`
            }
          : {
              tone: "green",
              title: "Roster import saved successfully",
              detail: `All ${imported}/${finalExpected} importable rows saved to Recurring Client Jobs and pushed to Calendar. The table below has been refreshed.`
            });
        setMessage(failed
          ? `Roster import completed with ${failed} row issue${failed === 1 ? "" : "s"}. ${imported}/${finalExpected} rows saved. Review the failed row message before relying on the roster.`
          : `Roster import verified. All ${imported}/${finalExpected} importable rows saved to Recurring Client Jobs and pushed to Calendar.`);
      } else {
        const payload = await sendRosterImportBatch("preview");
        setRosterImportResult(payload);
        setRosterImportStatus(payload.summary.errorRows
          ? {
              tone: "red",
              title: "Roster preview found errors",
              detail: `${payload.summary.errorRows} row${payload.summary.errorRows === 1 ? "" : "s"} need fixing before TOC can safely import this workbook.`
            }
          : {
              tone: "green",
              title: "Roster preview ready",
              detail: `${payload.summary.totalRows} uploaded row${payload.summary.totalRows === 1 ? "" : "s"} checked. ${payload.summary.importableRows || 0} can be imported.`
            });
        setMessage(payload.summary.errorRows ? "Roster preview found issues to fix before import." : "Roster preview is ready to import.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Roster import failed.";
      setRosterImportStatus({ tone: "red", title: "Roster import stopped", detail: errorMessage });
      setMessage(errorMessage);
    } finally {
      setRosterImportBusy(false);
    }
  }

  function startScheduleRowEdit(schedule: ScheduleRow) {
    if (allRegionMode) {
      setMessage("Select a specific region before editing job rows.");
      return;
    }
    setEditingScheduleId(schedule.id);
    setEditingScheduleDraft({ ...schedule, scheduleIds: schedule.scheduleIds?.length ? schedule.scheduleIds : [schedule.id] });
  }

  async function saveScheduleRowEdit() {
    const scheduleIds = editingScheduleDraft.scheduleIds?.length ? editingScheduleDraft.scheduleIds : editingScheduleDraft.id ? [editingScheduleDraft.id] : [];
    const ok = await mutate({
      action: "upsertClientJob",
      ...editingScheduleDraft,
      id: scheduleIds[0] || editingScheduleDraft.id,
      recurrence: "Weekly",
      recurrenceIntervalWeeks: 1,
      requiredCrewCount: editingScheduleDraft.requiredCrewCount || 2
    }, "Recurring job row saved and Calendar regenerated.");
    if (ok && scheduleIds.length > 1) {
      await mutate({ action: "deleteClientJobs", ids: scheduleIds.slice(1) }, "Duplicate ABCD schedule rows merged into one recurring job.");
    }
    if (ok) {
      setEditingScheduleId("");
      setEditingScheduleDraft(blankSchedule());
    }
  }

  async function deleteScheduleRow(schedule: ScheduleRow) {
    if (allRegionMode) return;
    const scheduleIds = schedule.scheduleIds?.length ? schedule.scheduleIds : [schedule.id];
    const confirmed = window.confirm(`Delete ${schedule.clientName || schedule.siteLabel} - ${schedule.jobTitle}? Future generated Calendar jobs for ${scheduleIds.length > 1 ? "these merged recurring schedules" : "this recurring schedule"} will be removed. Past Calendar history will remain.`);
    if (!confirmed) return;
    const ok = scheduleIds.length > 1
      ? await mutate({ action: "deleteClientJobs", ids: scheduleIds }, "Merged recurring jobs deleted and future Calendar jobs removed.")
      : await mutate({ action: "deleteClientJob", id: schedule.id }, "Recurring job deleted and future Calendar jobs removed.");
    if (ok && editingScheduleId === schedule.id) {
      setEditingScheduleId("");
      setEditingScheduleDraft(blankSchedule());
    }
  }

  async function deleteAllScheduleRows() {
    if (allRegionMode) return;
    const confirmed = window.confirm(`Delete all recurring jobs for ${region}? Future generated Calendar jobs for this region will be removed. Past Calendar history will remain.`);
    if (!confirmed) return;
    const ok = await mutate({ action: "deleteAllClientJobs" }, "All recurring jobs for this region were deleted and future Calendar jobs removed.");
    if (ok) {
      setEditingScheduleId("");
      setEditingScheduleDraft(blankSchedule());
      setRosterImportResult(null);
      window.dispatchEvent(new Event("toc.calendar.updated"));
    }
  }

  async function saveAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await mutate({ action: "saveAvailabilitySource", spreadsheetUrl: availabilityUrl, sourceName: `${region} Staff Availability` }, "Availability sheet linked for this region.");
    if (ok) {
      clearTocClientCache();
      void loadAvailabilityRows([region]);
    }
  }

  async function saveInductionSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await mutate({ action: "saveInductionSource", spreadsheetUrl: inductionUrl, sourceName: `${region} Staff Inductions` }, "Induction sheet linked for this region.");
    if (ok) void loadInductionRows([region]);
  }

  async function completeSetup() {
    const ok = await mutate({ action: "completeSetup" }, "Operations setup completed. TOC is ready for this region.");
    if (ok) {
      sessionStorage.setItem(`toc.setup.dismissed.${region}`, "true");
      window.location.href = "/home";
    }
  }

  function sheetMatchForStaff(person: StaffRow) {
    const names = rowRegions(person, region).flatMap((item) => availabilityRowsByRegion[item] || []);
    const expected = cleanNameKey(person.availabilitySheetName || person.name);
    const hasLinkedSource = Boolean(availabilityUrl || payload?.availabilitySource?.spreadsheetUrl);
    return {
      matched: names.some((name) => cleanNameKey(name) === expected),
      count: names.length,
      hasLinkedSource
    };
  }

  function inductionMatchForStaff(person: StaffRow) {
    const names = rowRegions(person, region).flatMap((item) => inductionRowsByRegion[item] || []);
    const expected = cleanNameKey(person.inductionSheetName || person.name);
    const hasLinkedSource = Boolean(inductionUrl || payload?.inductionSource?.spreadsheetUrl);
    return {
      matched: names.some((name) => cleanNameKey(name) === expected),
      count: names.length,
      hasLinkedSource
    };
  }

  function siteMatchForSchedule(schedule: ScheduleRow) {
    const names = rowRegions(schedule, region).flatMap((item) => inductionSitesByRegion[item] || []);
    const siteCandidates = [
      schedule.siteName,
      schedule.siteLabel,
      `${schedule.clientName} - ${schedule.siteName}`,
      `${schedule.clientName} ${schedule.siteName}`
    ].filter(Boolean).map((value) => cleanNameKey(String(value)));
    const hasLinkedSource = Boolean(inductionUrl || payload?.inductionSource?.spreadsheetUrl);
    return {
      matched: names.some((name) => siteCandidates.includes(cleanNameKey(name))),
      count: names.length,
      hasLinkedSource
    };
  }

  return (
    <div className="setup-wizard">
      <div className="setup-hero">
        <div>
          <span>Operations Setup</span>
          <h2>{region} command setup</h2>
          <p>Build the region source of truth once, then TOC turns it into staff visibility, jobs, inductions, calendar schedules and Odin context.</p>
        </div>
        <label>
          <span>Setup region</span>
          {canManageAllSetup ? (
            <select value={region} onChange={(event) => setRegion(event.target.value)}>
              {regionOptions.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          ) : <strong className="setup-region-readonly">{region}</strong>}
        </label>
      </div>

      <div className="setup-steps">
        {["Staff", "Clients & Jobs", "Inductions", "Training"].map((label, index) => (
          <button className={step === index + 1 ? "active" : ""} type="button" onClick={() => setStep(index + 1)} key={label}>
            <span>{index + 1}</span>{label}
          </button>
        ))}
      </div>

      {step === 1 ? (
        <section className="setup-panel">
          <div className="setup-copy"><strong>Step 1. Staff and availability source</strong><p>Link the staff availability sheet, then maintain the region staff list directly in the table. The availability row must match the name in the Google Sheet so Odin can join staff, availability, jobs and inductions correctly.</p></div>
          <form className="setup-source-row" onSubmit={saveAvailability}>
            <div>
              <span>Staff availability Google Sheet</span>
              <input placeholder="Paste this region's staff availability Google Sheet URL" value={availabilityUrl} onChange={(event) => setAvailabilityUrl(event.target.value)} />
            </div>
            <button disabled={saving || allRegionMode} type="submit">Link Sheet</button>
          </form>
          <label className="setup-option-row">
            <input type="checkbox" checked={useMobileAsWhatsapp} disabled={saving || allRegionMode} onChange={(event) => void toggleMobileAsWhatsapp(event.target.checked)} />
            <span>
              <strong>Use mobile numbers as WhatsApp numbers for this region</strong>
              <small>Copies each staff mobile into the WhatsApp field so Odin can use the correct contact channel when needed.</small>
            </span>
          </label>
          {allRegionMode ? <div className="setup-empty">All regions is a filterable overview. Select a specific region above before adding or editing staff.</div> : null}
          <CollapsibleTable
            title="Current Staff"
            count={filteredStaff.length}
            total={staff.length}
            headers={["Staff name", "Mobile", "WhatsApp", "Skills", "Availability row", "Sheet match", "Notes", "Region", "Action"]}
            search={staffSearch}
            onSearchChange={setStaffSearch}
            regionFilter={tableRegionFilter}
            onRegionFilterChange={setTableRegionFilter}
            regionOptions={[allRegionsLabel, ...specificRegionOptions]}
          >
            <tbody>
              <tr className="setup-new-row">
                <td><input placeholder="Staff name" value={staffDraft.name || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, name: event.target.value }))} /></td>
                <td><input placeholder="Mobile" value={staffDraft.mobile || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, mobile: event.target.value, whatsapp: useMobileAsWhatsapp ? event.target.value : current.whatsapp }))} /></td>
                <td><input placeholder="WhatsApp / Telegram" value={useMobileAsWhatsapp ? staffDraft.mobile || "" : staffDraft.whatsapp || ""} disabled={useMobileAsWhatsapp} onChange={(event) => setStaffDraft((current) => ({ ...current, whatsapp: event.target.value }))} /></td>
                <td><div className="setup-checks setup-row-checks">{skills.map((skill) => <label key={skill}><input type="checkbox" checked={(staffDraft.skills || []).includes(skill)} onChange={() => setStaffDraft((current) => ({ ...current, skills: skillToggle(current.skills, skill) }))} /> {skill}</label>)}</div></td>
                <td><input placeholder="Exact sheet name" value={staffDraft.availabilitySheetName || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, availabilitySheetName: event.target.value }))} /></td>
                <td><span className="setup-match-chip pending">{availabilityUrl ? "Ready to match" : "Link sheet"}</span></td>
                <td><input placeholder="Odin notes" value={staffDraft.notes || ""} onChange={(event) => setStaffDraft((current) => ({ ...current, notes: event.target.value }))} /></td>
                <td><span className="setup-region-chip">{region}</span></td>
                <td><button disabled={saving || allRegionMode || !staffDraft.name} type="button" onClick={addStaffRow}>Add Staff</button></td>
              </tr>
              {filteredStaff.map((person, index) => {
              const isEditing = editingStaffId === person.id;
              const rowKey = `${person.id}-${rowRegions(person, region).join("-")}-${index}`;
              const match = sheetMatchForStaff(person);
              const matchLabel = match.matched ? "Matched" : match.count ? "Not matched" : match.hasLinkedSource ? "Sheet linked" : "No sheet";
              const matchClass = match.matched ? "matched" : match.hasLinkedSource && !match.count ? "pending" : "missing";
              return (
                <tr key={rowKey} className={isEditing ? "setup-editing-row" : ""}>
                  <td>{isEditing ? <input value={editingStaffDraft.name || ""} onChange={(event) => setEditingStaffDraft((current) => ({ ...current, name: event.target.value }))} /> : person.name}</td>
                  <td>{isEditing ? <input value={editingStaffDraft.mobile || ""} onChange={(event) => setEditingStaffDraft((current) => ({ ...current, mobile: event.target.value, whatsapp: useMobileAsWhatsapp ? event.target.value : current.whatsapp }))} /> : person.mobile || "No phone"}</td>
                  <td>{isEditing ? <input value={useMobileAsWhatsapp ? editingStaffDraft.mobile || "" : editingStaffDraft.whatsapp || ""} disabled={useMobileAsWhatsapp} onChange={(event) => setEditingStaffDraft((current) => ({ ...current, whatsapp: event.target.value }))} /> : person.whatsapp || (useMobileAsWhatsapp ? person.mobile : "") || "-"}</td>
                  <td>
                    {isEditing ? (
                      <div className="setup-checks setup-row-checks">
                        {skills.map((skill) => <label key={skill}><input type="checkbox" checked={(editingStaffDraft.skills || []).includes(skill)} onChange={() => setEditingStaffDraft((current) => ({ ...current, skills: skillToggle(current.skills, skill) }))} /> {skill}</label>)}
                      </div>
                    ) : person.skills.join(", ") || person.role}
                  </td>
                  <td>{isEditing ? <input value={editingStaffDraft.availabilitySheetName || ""} onChange={(event) => setEditingStaffDraft((current) => ({ ...current, availabilitySheetName: event.target.value }))} /> : person.availabilitySheetName || person.name}</td>
                  <td><span className={`setup-match-chip ${matchClass}`}>{matchLabel}</span></td>
                  <td>{isEditing ? <input value={editingStaffDraft.notes || ""} onChange={(event) => setEditingStaffDraft((current) => ({ ...current, notes: event.target.value }))} /> : person.notes || "-"}</td>
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
          <div className="setup-copy"><strong>Step 2. Clients and recurring jobs</strong><p>This table is the region jobs source. Add the client, site, day, time, ABCD cycle, normal rostered staff and unit in one row. TOC saves the client/site, links the normal staff roster, and regenerates the Calendar from this source table.</p></div>
          <div className="setup-import-panel">
            <div>
              <span className="eyebrow">Bulk roster import</span>
              <strong>Upload a TOC roster workbook</strong>
              <p>Download the Excel-compatible CSV template, fill one row per recurring client job, preview matches, then confirm import. TOC will create client sites, recurring jobs, staff links and Calendar entries.</p>
            </div>
            <div className="setup-import-actions">
              <a href="/api/operations-setup/roster-template">Download Template</a>
              <input type="file" accept=".csv" onChange={(event) => {
                setRosterImportFile(event.target.files?.[0] || null);
                setRosterImportResult(null);
                setRosterImportStatus(null);
              }} />
              <button type="button" disabled={rosterImportBusy || !rosterImportFile} onClick={() => submitRosterImport("preview")}>{rosterImportBusy ? "Working..." : "Preview Upload"}</button>
              <button type="button" disabled={rosterImportBusy || !rosterImportResult || rosterImportResult.summary.errorRows > 0} onClick={() => submitRosterImport("import")}>{rosterImportBusy ? "Saving..." : "Confirm Import"}</button>
              <button className="setup-danger-button" type="button" disabled={saving || allRegionMode || !schedules.length} onClick={deleteAllScheduleRows}>Delete All Jobs</button>
            </div>
            {rosterImportStatus ? (
              <div className={`setup-import-status ${rosterImportStatus.tone}`} role="status" aria-live="polite">
                <strong>{rosterImportStatus.title}</strong>
                <span>{rosterImportStatus.detail}</span>
              </div>
            ) : null}
            {rosterImportResult ? (
              <div className="setup-import-preview">
                <div className="setup-import-summary">
                  <span>{rosterImportResult.summary.totalRows} rows</span>
                  <span>{rosterImportResult.summary.validRows} valid</span>
                  <span>{rosterImportResult.summary.warningRows} update warnings</span>
                  <span>{rosterImportResult.summary.errorRows} errors</span>
                  {typeof rosterImportResult.summary.importableRows === "number" ? <span>{rosterImportResult.summary.importableRows} importable</span> : null}
                  {rosterImportResult.imported ? <span>{rosterImportResult.imported.length} imported</span> : null}
                  {rosterImportResult.failed?.length ? <span>{rosterImportResult.failed.length} failed</span> : null}
                  {rosterImportResult.summary.allRowsImported ? <span>All rows saved</span> : null}
                </div>
                <div className="setup-table-scroll compact">
                  <table>
                    <thead><tr><th>Row</th><th>Status</th><th>Region</th><th>Client</th><th>Site</th><th>Day</th><th>Time</th><th>ABCD</th><th>Staff</th><th>Messages</th></tr></thead>
                    <tbody>
                      {rosterImportResult.rows.map((row) => (
                        <tr key={`import-${row.rowNumber}`} className={row.status === "error" ? "setup-import-error" : row.status === "warning" ? "setup-import-warning" : ""}>
                          <td>{row.rowNumber}</td>
                          <td>{row.status}</td>
                          <td>{row.region}</td>
                          <td>{row.clientName}</td>
                          <td>{row.siteName}</td>
                          <td>{row.jobDay || dayFromDate(row.resolvedStartDate)}</td>
                          <td>{row.startTime}</td>
                          <td>{formatAbcdWeeks(row.abcdWeeks || [])}</td>
                          <td>{row.matchedStaff.length}/{row.rosteredStaff.length || 0}</td>
                          <td>{[...row.messages, row.duplicateHint].filter(Boolean).join(" ")}</td>
                        </tr>
                      ))}
                      {rosterImportResult.failed?.map((row) => (
                        <tr key={`import-failed-${row.rowNumber}`} className="setup-import-error">
                          <td>{row.rowNumber}</td>
                          <td>failed</td>
                          <td colSpan={7}>Import failed after preview validation.</td>
                          <td>{row.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <small>Showing all {rosterImportResult.rows.length} uploaded rows so the workbook can be checked before import.</small>
              </div>
            ) : null}
          </div>
          <CollapsibleTable
            title="Recurring Client Jobs"
            count={filteredSchedules.length}
            total={displaySchedules.length}
            headers={["Client", "Site", "Address", "Unit", "Day", "Time", "ABCD", "Crew", "Normal staff", "Induction required", "Induction site match", "Notes", "Region", "Action"]}
            search={scheduleSearch}
            onSearchChange={setScheduleSearch}
            regionFilter={tableRegionFilter}
            onRegionFilterChange={setTableRegionFilter}
            regionOptions={[allRegionsLabel, ...specificRegionOptions]}
          >
            <tbody>
              <tr className="setup-new-row">
                <td><input placeholder="Client" value={scheduleDraft.clientName || ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, clientName: event.target.value, scheduleName: current.scheduleName || `${event.target.value} - ${current.siteName || ""}`.trim() }))} /></td>
                <td><input placeholder="Site / depot" value={scheduleDraft.siteName || ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, siteName: event.target.value, scheduleName: current.scheduleName || `${current.clientName || ""} - ${event.target.value}`.trim() }))} /></td>
                <td><input placeholder="Address" value={scheduleDraft.address || ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, address: event.target.value }))} /></td>
                <td><input placeholder="Unit" value={scheduleDraft.washAsset || ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, washAsset: event.target.value }))} /></td>
                <td><DayPicker value={dayFromDate(scheduleDraft.startDate || today())} onChange={(day) => setScheduleDraft((current) => ({ ...current, startDate: nextDateForDay(day) }))} /></td>
                <td><input type="time" value={scheduleDraft.jobTime || "07:00"} onChange={(event) => setScheduleDraft((current) => ({ ...current, jobTime: event.target.value }))} /></td>
                <td><AbcdWeekPicker value={scheduleDraft.abcdWeeks || []} onChange={(abcdWeeks) => setScheduleDraft((current) => ({ ...current, abcdWeeks }))} /></td>
                <td><input type="number" min={0} max={20} value={scheduleDraft.requiredCrewCount || 2} onChange={(event) => setScheduleDraft((current) => ({ ...current, requiredCrewCount: Number(event.target.value) }))} /></td>
                <td><StaffPicker staff={staff} value={scheduleDraft.staffIds || []} onChange={(staffIds) => setScheduleDraft((current) => ({ ...current, staffIds }))} /></td>
                <td><label className="setup-cell-check"><input type="checkbox" checked={scheduleDraft.requiredInduction !== false} onChange={(event) => setScheduleDraft((current) => ({ ...current, requiredInduction: event.target.checked }))} /> Required</label></td>
                <td><span className={`setup-match-chip ${inductionUrl ? "pending" : "missing"}`}>{inductionUrl ? "Ready to match" : "Link induction sheet"}</span></td>
                <td><input placeholder="Notes" value={scheduleDraft.notes || ""} onChange={(event) => setScheduleDraft((current) => ({ ...current, notes: event.target.value }))} /></td>
                <td><span className="setup-region-chip">{region}</span></td>
                <td><button disabled={saving || allRegionMode || !scheduleDraft.clientName || !scheduleDraft.siteName} type="button" onClick={addScheduleRow}>Add Job</button></td>
              </tr>
              {filteredSchedules.map((schedule, index) => {
                const isEditing = editingScheduleId === schedule.id;
                const draft = isEditing ? editingScheduleDraft : schedule;
                const rosteredNames = staff.filter((person) => schedule.staffIds.includes(person.id)).map((person) => person.name).join(", ");
                const match = siteMatchForSchedule(schedule);
                const matchLabel = !schedule.requiredInduction ? "Not required" : match.matched ? "Matched" : match.count ? "Not matched" : match.hasLinkedSource ? "Sheet linked" : "No sheet";
                const matchClass = !schedule.requiredInduction ? "pending" : match.matched ? "matched" : match.hasLinkedSource && !match.count ? "pending" : "missing";
                return (
                  <tr key={`${schedule.id}-${index}`} className={isEditing ? "setup-editing-row" : ""}>
                    <td>{isEditing ? <input value={draft.clientName || ""} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, clientName: event.target.value }))} /> : <span>{schedule.clientName || schedule.siteLabel.split(" - ")[0]}{schedule.sourceCount && schedule.sourceCount > 1 ? <small className="setup-merged-note">Merged {schedule.sourceCount}</small> : null}</span>}</td>
                    <td>{isEditing ? <input value={draft.siteName || ""} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, siteName: event.target.value }))} /> : schedule.siteName || schedule.siteLabel.split(" - ").slice(1).join(" - ")}</td>
                    <td>{isEditing ? <input value={draft.address || ""} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, address: event.target.value }))} /> : schedule.address || "-"}</td>
                    <td>{isEditing ? <input value={draft.washAsset || ""} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, washAsset: event.target.value }))} /> : schedule.washAsset || "-"}</td>
                    <td>{isEditing ? <DayPicker value={dayFromDate(draft.startDate || today())} onChange={(day) => setEditingScheduleDraft((current) => ({ ...current, startDate: nextDateForDay(day) }))} /> : dayFromDate(schedule.startDate) || schedule.startDate}</td>
                    <td>{isEditing ? <input type="time" value={draft.jobTime || "07:00"} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, jobTime: event.target.value }))} /> : schedule.jobTime}</td>
                    <td>{isEditing ? <AbcdWeekPicker value={draft.abcdWeeks || []} onChange={(abcdWeeks) => setEditingScheduleDraft((current) => ({ ...current, abcdWeeks }))} /> : <span className="setup-abcd-summary">{formatAbcdWeeks(schedule.abcdWeeks || [])}</span>}</td>
                    <td>{isEditing ? <input type="number" min={0} max={20} value={draft.requiredCrewCount || 2} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, requiredCrewCount: Number(event.target.value) }))} /> : `${schedule.requiredCrewCount} crew`}</td>
                    <td>{isEditing ? <StaffPicker staff={staff} value={draft.staffIds || []} onChange={(staffIds) => setEditingScheduleDraft((current) => ({ ...current, staffIds }))} /> : rosteredNames || "Unassigned"}</td>
                    <td>{isEditing ? <label className="setup-cell-check"><input type="checkbox" checked={draft.requiredInduction !== false} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, requiredInduction: event.target.checked }))} /> Required</label> : schedule.requiredInduction ? "Required" : "Not required"}</td>
                    <td><span className={`setup-match-chip ${matchClass}`}>{matchLabel}</span></td>
                    <td>{isEditing ? <input value={draft.notes || ""} onChange={(event) => setEditingScheduleDraft((current) => ({ ...current, notes: event.target.value }))} /> : schedule.notes || "-"}</td>
                    <td><span className="setup-region-chip">{rowRegions(schedule, region).join(", ")}</span></td>
                    <td className="setup-row-actions">
                      {isEditing ? (
                        <>
                          <button type="button" disabled={saving || !editingScheduleDraft.clientName || !editingScheduleDraft.siteName} onClick={saveScheduleRowEdit}>Save</button>
                          <button type="button" onClick={() => { setEditingScheduleId(""); setEditingScheduleDraft(blankSchedule()); }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button type="button" disabled={allRegionMode} onClick={() => startScheduleRowEdit(schedule)}>Edit</button>
                          <button type="button" className="setup-danger-button" disabled={allRegionMode || saving} onClick={() => deleteScheduleRow(schedule)}>Delete</button>
                        </>
                      )}
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
          <div className="setup-copy"><strong>Step 3. Site inductions</strong><p>Link the induction Google Sheet and match each TOC staff profile to the exact row name in that sheet. Managers update actual induction status and expiry dates in the source Google Sheet.</p></div>
          <form className="setup-source-row" onSubmit={saveInductionSource}>
            <div>
              <span>Staff inductions Google Sheet</span>
              <input placeholder="Paste this region's induction register Google Sheet URL" value={inductionUrl} onChange={(event) => setInductionUrl(event.target.value)} />
            </div>
            <button disabled={saving || allRegionMode} type="submit">Link Sheet</button>
          </form>
          <CollapsibleTable
            title="Induction Name Sync"
            count={filteredStaff.length}
            total={staff.length}
            headers={["Staff name", "Induction row", "Sheet match", "Region", "Action"]}
            search={staffSearch}
            onSearchChange={setStaffSearch}
            regionFilter={tableRegionFilter}
            onRegionFilterChange={setTableRegionFilter}
            regionOptions={[allRegionsLabel, ...specificRegionOptions]}
          >
            <tbody>{filteredStaff.map((person, index) => {
              const isEditing = editingStaffId === person.id;
              const match = inductionMatchForStaff(person);
              const matchLabel = match.matched ? "Matched" : match.count ? "Not matched" : match.hasLinkedSource ? "Sheet linked" : "No sheet";
              const matchClass = match.matched ? "matched" : match.hasLinkedSource && !match.count ? "pending" : "missing";
              return (
                <tr key={`${person.id}-induction-${index}`} className={isEditing ? "setup-editing-row" : ""}>
                  <td>{person.name}</td>
                  <td>{isEditing ? <input value={editingStaffDraft.inductionSheetName || ""} onChange={(event) => setEditingStaffDraft((current) => ({ ...current, inductionSheetName: event.target.value }))} /> : person.inductionSheetName || person.name}</td>
                  <td><span className={`setup-match-chip ${matchClass}`}>{matchLabel}</span></td>
                  <td><span className="setup-region-chip">{rowRegions(person, region).join(", ")}</span></td>
                  <td className="setup-row-actions">
                    {isEditing ? (
                      <>
                        <button type="button" disabled={saving} onClick={saveStaffRowEdit}>Save</button>
                        <button type="button" onClick={() => { setEditingStaffId(""); setEditingStaffDraft(blankStaff()); }}>Cancel</button>
                      </>
                    ) : <button type="button" disabled={allRegionMode} onClick={() => startStaffRowEdit(person)}>Edit Row Name</button>}
                  </td>
                </tr>
              );
            })}</tbody>
          </CollapsibleTable>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="setup-panel training-panel">
          <strong>Step 4. TOC walkthrough</strong>
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
          <strong>Step {step} of 4</strong>
          <span>{["Staff setup", "Client jobs", "Site inductions", "TOC walkthrough"][step - 1]}</span>
          <i><em style={{ width: `${(step / 4) * 100}%` }} /></i>
        </div>
        {step < 4 ? <button type="button" onClick={() => setStep((current) => Math.min(4, current + 1))}>Next Step</button> : <button type="button" disabled={saving || allRegionMode} onClick={completeSetup}>Complete Setup</button>}
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
  defaultOpen = true,
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
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="setup-table" open={defaultOpen}>
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

function StaffPicker({ staff, value, onChange }: { staff: StaffRow[]; value: string[]; onChange: (staffIds: string[]) => void }) {
  function toggleStaff(staffId: string) {
    onChange(value.includes(staffId) ? value.filter((item) => item !== staffId) : [...value, staffId]);
  }

  if (!staff.length) return <span className="setup-staff-empty">Add staff in Step 1 first</span>;

  return (
    <div className="setup-staff-picker">
      {staff.map((person, index) => {
        const selected = value.includes(person.id);
        const displayName = person.name || person.availabilitySheetName || person.inductionSheetName || "Unnamed staff";
        const skillsLabel = person.skills?.length ? person.skills.join(", ") : person.role || "Staff";
        return (
          <label className={selected ? "selected" : ""} title={displayName} key={`${person.id}-staff-picker-${index}`}>
            <input type="checkbox" checked={selected} onChange={() => toggleStaff(person.id)} />
            <span>{displayName}</span>
            <small>{skillsLabel}</small>
          </label>
        );
      })}
    </div>
  );
}

function DayPicker({ value, onChange }: { value: string; onChange: (day: string) => void }) {
  return (
    <div className="setup-day-picker" title="Choose the weekday for this recurring job. TOC stores the next matching date and generates Calendar jobs from it.">
      {weekDays.map((day) => {
        const selected = value === day;
        return (
          <label key={`setup-day-${day}`} className={selected ? "selected" : ""}>
            <input type="checkbox" checked={selected} onChange={() => onChange(day)} />
            <span>{day.slice(0, 3)}</span>
          </label>
        );
      })}
    </div>
  );
}

function AbcdWeekPicker({ value, onChange }: { value: string[]; onChange: (weeks: string[]) => void }) {
  return (
    <div className="setup-abcd-picker" title="Leave all blank to run every ABCD week. Select A/B/C/D to limit this recurring job to those Thor weeks.">
      {THOR_ABCD_WEEKS.map((week) => {
        const selected = value.includes(week);
        return (
          <label key={`abcd-${week}`} className={selected ? "selected" : ""}>
            <input type="checkbox" checked={selected} onChange={() => onChange(weekToggle(value, week))} />
            <span>{week}</span>
          </label>
        );
      })}
      {!value.length ? <small>Every</small> : null}
    </div>
  );
}
