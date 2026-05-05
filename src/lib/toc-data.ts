export type Status = "green" | "amber" | "red" | "blue";

export type CalendarJob = {
  id?: string;
  time: string;
  location: string;
  site: string;
  crew: string;
  job: string;
  status: string;
  notes: string;
  severity: Status;
  recurrence?: string;
  recurrenceDetail?: string;
  recurrenceIntervalWeeks?: number;
};

export type CalendarDay = {
  day: string;
  date: string;
  month: string;
  week: string;
  today?: boolean;
  jobs: CalendarJob[];
};

export type Metric = {
  label: string;
  value: string;
  detail: string;
  status: Status;
  href: string;
};

export type CommandSignal = {
  title: string;
  source: string;
  severity: Status;
  owner: string;
  action: string;
  href: string;
  detail: string;
};

export type ActionItemSeed = {
  id: string;
  title: string;
  source: string;
  directive: "National Ops Directive" | "Scheduled Directive" | "To Do";
  region: string;
  severity: Status;
  dueDate: string;
  href: string;
  detail: string;
  status: string;
  closeFlow: string;
  closeActions: string[];
};

export const metrics: Metric[] = [];

export const commandSignals: CommandSignal[] = [];

export const actionItems: ActionItemSeed[] = [];

export const commandPathways = [
  { step: "1", label: "Action Centre", href: "/actions", detail: "Start here when something needs action, ownership, escalation or clearing." },
  { step: "2", label: "Region Health", href: "/overview", detail: "Check whether each state is healthy enough to run the day without surprises." },
  { step: "3", label: "Compliance", href: "/compliance", detail: "Confirm induction, safety and site-readiness issues are complete and green." },
  { step: "4", label: "Inductions", href: "/inductions", detail: "Check staff induction status by site before assigning work." },
  { step: "5", label: "Stock Orders", href: "/stock-orders", detail: "Raise supply needs early before chemicals, PPE or parts block the work." },
  { step: "6", label: "Productivity", href: "/operations", detail: "Review productivity queues, rollover counts, site actions and manager responses." },
  { step: "7", label: "Asset Tracking", href: "/asset-tracking", detail: "Track Unity GPS-equipped wash vehicles and mobile crews in the field." },
  { step: "8", label: "Calendar", href: "/calendar", detail: "Review scheduled jobs by day and location before the work starts." },
  { step: "9", label: "Staff Availability", href: "/staff-availability", detail: "Use the availability heat map to quickly see who can cover work." },
  { step: "10", label: "Equipment Servicing", href: "/equipment-servicing", detail: "Track odometer and hour readings so servicing and repairs are visible before assets fail." },
  { step: "11", label: "Chat", href: "/chat", detail: "Keep the management communication trail clear and healthy." }
];

export const goLivePathway = [
  { step: "01", title: "Determine page order and flow", status: "In progress", severity: "amber" as Status },
  { step: "02", title: "Add required features to pages", status: "In progress", severity: "amber" as Status },
  { step: "03", title: "Determine user access levels", status: "In progress", severity: "amber" as Status },
  { step: "04", title: "Create database", status: "In progress", severity: "amber" as Status },
  { step: "05", title: "Link database", status: "Pending", severity: "blue" as Status },
  { step: "06", title: "Connect API and Webhook feeds", status: "Pending", severity: "blue" as Status },
  { step: "07", title: "Add remaining feature requests", status: "Pending", severity: "blue" as Status },
  { step: "08", title: "Test connections", status: "Pending", severity: "blue" as Status },
  { step: "09", title: "Beta test TOC", status: "Pending", severity: "blue" as Status },
  { step: "10", title: "Deploy live", status: "Pending", severity: "blue" as Status }
];

export const integrationReadiness = [
  { system: "Thor Portal", purpose: "Jobsheets, approvals, odometer readings, hour readings, admin flow and invoicing readiness", status: "Source activation", severity: "amber" as Status },
  { system: "Fleetio", purpose: "Assets, GPS, service schedule, wash records and Woolworths wash data", status: "Source activation", severity: "amber" as Status },
  { system: "Unity", purpose: "GPS tracking for wash vehicles, mobile crews and field asset position", status: "Source mapping", severity: "blue" as Status },
  { system: "Outlook", purpose: "Calendar reminders, manager follow-ups and escalation dates", status: "Source mapping", severity: "blue" as Status }
];

export type RegionHealthSeed = {
  name: string;
  readiness: number;
  portal: number;
  wash: number;
  risks: number;
  note: string;
};

export const regions: RegionHealthSeed[] = [];

export const approvals: { id: string; region: string; site: string; count: number; age: string; risk: string }[] = [];

export const tasks: { title: string; owner: string; region: string; priority: string }[] = [];

export const nationalTasks: { title: string; owner: string; priority: string }[] = [];

export const washes: { site: string; region: string; target: number; actual: number; internal: number; exceptions: number }[] = [];

export type ProductivitySiteSeed = {
  site: string;
  region: string;
  productivityScore: number;
  queue: string;
  action: string;
  units: number;
  labourHours: number;
};

export const productivitySites: ProductivitySiteSeed[] = [];

export const serviceSchedule: { asset: string; region: string; due: string; item: string; status: string; severity: Status }[] = [];

export const equipmentServiceSummary: { label: string; value: string; detail: string; severity: Status }[] = [];

export const equipmentAssets: {
  asset: string;
  category: string;
  region: string;
  readingType: string;
  currentReading: string;
  nextService: string;
  remaining: string;
  lastSubmitted: string;
  status: string;
  severity: Status;
}[] = [];

export const servicingDataFlow = [
  { step: "1", title: "Reading captured", detail: "Manager or team leader records odometer or hour reading in Thor Portal." },
  { step: "2", title: "Portal sends feed", detail: "Thor Portal sends the latest reading to TOC through API or webhook." },
  { step: "3", title: "TOC calculates status", detail: "TOC compares the reading against service intervals and flags green, watch or action." },
  { step: "4", title: "Workshop acts", detail: "Jason and workshop users track what needs booking, parts or return-to-service follow-up." }
];

export const washRolloverCounters: { region: string; site: string; yesterday: number; today: number; rollover: number; trend: string; severity: Status }[] = [];

export const outlookReminders: { region: string; time: string; title: string; source: string; severity: Status }[] = [];

export const rosterWindows: { region: string; shift: string; coverage: string; staff: string; gap: string; severity: Status }[] = [];

export const staffAvailability: { region: string; window: string; available: number; unavailable: number; status: string; severity: Status }[] = [];

export type StaffSheetStatus = "Available" | "Not Available" | "";

export type StaffAvailabilityFeed = {
  spreadsheetUrl: string;
  sourceName: string;
  lastRead: string;
  days: string[];
  windows: string[];
  staff: { name: string; availability: StaffSheetStatus[][] }[];
};

export const staffAvailabilitySheet: StaffAvailabilityFeed = {
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1dFwTlBmOUPeq21LQdv6AzHFztuLDRC-j7io-B_1zWx0/edit?gid=0#gid=0",
  sourceName: "Staff Availability - Sheet1",
  lastRead: "3 May 2026",
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  windows: ["6am-12pm", "12pm-6pm", "6pm-12am", "12am-6am"],
  staff: [
    { name: "HARRY", availability: [["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"]] as StaffSheetStatus[][] },
    { name: "AMAN", availability: [["Available", "Not Available", "Available", "Not Available"], ["Available", "Available", "Available", "Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"]] as StaffSheetStatus[][] },
    { name: "HARMAN", availability: [["Not Available", "Not Available", "Available", "Not Available"], ["Available", "Available", "Available", "Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Available", "Available"]] as StaffSheetStatus[][] },
    { name: "GARRY", availability: [["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"]] as StaffSheetStatus[][] },
    { name: "SAMAR", availability: [["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Available", "Not Available"], ["Available", "Available", "Available", "Not Available"]] as StaffSheetStatus[][] },
    { name: "SHANT", availability: [["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Available", "Not Available"], ["Available", "Available", "Available", "Not Available"]] as StaffSheetStatus[][] },
    { name: "SHIVAM", availability: [["Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Available", "Not Available"], ["Available", "Available", "Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Available", "Not Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"]] as StaffSheetStatus[][] },
    { name: "NARINDER", availability: [["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"]] as StaffSheetStatus[][] },
    { name: "SAKSHAM", availability: [["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Not Available", "Not Available"], ["Available", "Available", "Not Available", "Not Available"]] as StaffSheetStatus[][] },
    { name: "RITESH", availability: [["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Not Available"], ["Not Available", "Not Available", "Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Available", "Available"]] as StaffSheetStatus[][] },
    { name: "DARSHAN", availability: [["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"]] as StaffSheetStatus[][] },
    { name: "BHUMIK", availability: [["Not Available", "Not Available", "Available", "Not Available"], ["Not Available", "Not Available", "Available", "Not Available"], ["Not Available", "Not Available", "Available", "Not Available"], ["Not Available", "Not Available", "Available", "Not Available"], ["Not Available", "Not Available", "Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Available", "Not Available", "Not Available"]] as StaffSheetStatus[][] },
    { name: "JOHN", availability: [["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"]] as StaffSheetStatus[][] },
    { name: "PAWAN", availability: [["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"]] as StaffSheetStatus[][] },
    { name: "TIM", availability: [["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Available", "Available", "Not Available", "Not Available"], ["Available", "Available", "Not Available", "Not Available"]] as StaffSheetStatus[][] },
    { name: "STEVE", availability: [["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Available", "Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Available", "Available", "Available", "Available"]] as StaffSheetStatus[][] },
    { name: "YADVINDER", availability: [["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Available", "Not Available", "Not Available"], ["Available", "Available", "Not Available", "Not Available"]] as StaffSheetStatus[][] },
    { name: "JATIN", availability: [["Not Available", "Not Available", "Available", "Available"], ["Available", "Not Available", "Available", "Available"], ["Available", "Not Available", "Available", "Not Available"], ["Not Available", "Not Available", "Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Available", "Not Available", "Not Available", "Not Available"], ["Available", "Not Available", "Not Available", "Not Available"]] as StaffSheetStatus[][] },
    { name: "PARTH", availability: [["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Available", "Not Available"], ["Available", "Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Available", "Not Available"], ["Not Available", "Available", "Available", "Not Available"], ["Available", "Available", "Available", "Available"]] as StaffSheetStatus[][] },
    { name: "ARANI", availability: [["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Available", "Available"], ["Not Available", "Not Available", "Not Available", "Not Available"]] as StaffSheetStatus[][] },
    { name: "SAINATH", availability: [["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Available", "Not Available", "Not Available"], ["Not Available", "Available", "Not Available", "Not Available"], ["Not Available", "Not Available", "Not Available", "Not Available"], ["Not Available", "Available", "Not Available", "Not Available"], ["Not Available", "Available", "Not Available", "Not Available"], ["Available", "Available", "Available", "Not Available"]] as StaffSheetStatus[][] }
  ]
};

export type InductionStatus = "Inducted" | "Not Inducted" | "Expired" | "Expiring Soon" | "Expiring This Month" | "";

export type InductionFeed = {
  spreadsheetUrl: string;
  sourceName: string;
  lastRead: string;
  sites: { name: string; region: string }[];
  staff: { name: string; inductions: { site: string; status: InductionStatus; expiry: string }[] }[];
};

export const staffInductionsSheet: InductionFeed = {
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1MFFxCPAhPzTzB9Q7zPOBLJyNyz04S23NoJ1GZ6-VRlM/edit?gid=0#gid=0",
  sourceName: "Staff Inductions - Sheet1",
  lastRead: "3 May 2026",
  sites: [
    { name: "Woolworths", region: "Brisbane" },
    { name: "Mondiale", region: "Brisbane" },
    { name: "TGE Larapinta", region: "Brisbane" },
    { name: "TGE Karawatha", region: "Brisbane" },
    { name: "Big Michael / Morco", region: "Brisbane" },
    { name: "Cement Australia", region: "Brisbane" },
    { name: "Allied Pinnacle", region: "Brisbane" },
    { name: "Americold Bradman", region: "Brisbane" },
    { name: "DHL", region: "Brisbane" },
    { name: "Fedex Coomera", region: "Brisbane" },
    { name: "Norco", region: "Brisbane" },
    { name: "Autocare", region: "Brisbane" },
    { name: "Linfox ACR", region: "Brisbane" },
    { name: "Prixcar", region: "Brisbane" }
  ],
  staff: [
    { name: "CRAIG", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "20/11/2027" }, { site: "Mondiale", status: "Inducted", expiry: "06/01/2027" }, { site: "TGE Larapinta", status: "Inducted", expiry: "" }, { site: "TGE Karawatha", status: "Not Inducted", expiry: "" }, { site: "Big Michael / Morco", status: "Inducted", expiry: "03/10/2026" }, { site: "Cement Australia", status: "Not Inducted", expiry: "" }, { site: "Allied Pinnacle", status: "Not Inducted", expiry: "" }, { site: "Americold Bradman", status: "Not Inducted", expiry: "" }, { site: "DHL", status: "Inducted", expiry: "04/07/2026" }, { site: "Fedex Coomera", status: "Not Inducted", expiry: "" }, { site: "Norco", status: "Not Inducted", expiry: "" }, { site: "Autocare", status: "Not Inducted", expiry: "" }, { site: "Linfox ACR", status: "Not Inducted", expiry: "" }, { site: "Prixcar", status: "Not Inducted", expiry: "" }] },
    { name: "HARRY", inductions: [{ site: "Woolworths", status: "Not Inducted", expiry: "" }, { site: "Mondiale", status: "Inducted", expiry: "14/01/2027" }, { site: "TGE Larapinta", status: "Inducted", expiry: "" }, { site: "TGE Karawatha", status: "Not Inducted", expiry: "" }, { site: "Big Michael / Morco", status: "Inducted", expiry: "13/12/2026" }, { site: "Cement Australia", status: "Not Inducted", expiry: "" }, { site: "Allied Pinnacle", status: "Not Inducted", expiry: "" }, { site: "Americold Bradman", status: "Not Inducted", expiry: "" }, { site: "DHL", status: "Not Inducted", expiry: "" }, { site: "Fedex Coomera", status: "Not Inducted", expiry: "" }, { site: "Norco", status: "Not Inducted", expiry: "" }, { site: "Autocare", status: "Not Inducted", expiry: "" }, { site: "Linfox ACR", status: "Not Inducted", expiry: "" }, { site: "Prixcar", status: "Not Inducted", expiry: "" }] },
    { name: "AMAN", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "28/11/2027" }, { site: "Mondiale", status: "Inducted", expiry: "12/01/2027" }, { site: "TGE Larapinta", status: "Not Inducted", expiry: "" }, { site: "TGE Karawatha", status: "Not Inducted", expiry: "" }, { site: "Big Michael / Morco", status: "Inducted", expiry: "16/07/2026" }, { site: "Cement Australia", status: "Inducted", expiry: "03/09/2027" }, { site: "Allied Pinnacle", status: "Inducted", expiry: "07/02/2027" }, { site: "Americold Bradman", status: "Not Inducted", expiry: "" }, { site: "DHL", status: "Not Inducted", expiry: "" }, { site: "Fedex Coomera", status: "Not Inducted", expiry: "" }, { site: "Norco", status: "Not Inducted", expiry: "" }, { site: "Autocare", status: "Not Inducted", expiry: "" }, { site: "Linfox ACR", status: "Not Inducted", expiry: "" }, { site: "Prixcar", status: "Not Inducted", expiry: "" }] },
    { name: "HARMAN", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "14/01/2028" }, { site: "Mondiale", status: "Inducted", expiry: "12/01/2027" }, { site: "TGE Larapinta", status: "Not Inducted", expiry: "" }, { site: "TGE Karawatha", status: "Not Inducted", expiry: "" }, { site: "Big Michael / Morco", status: "Inducted", expiry: "07/10/2026" }, { site: "Cement Australia", status: "Not Inducted", expiry: "" }, { site: "Allied Pinnacle", status: "Inducted", expiry: "03/11/2027" }, { site: "Americold Bradman", status: "Not Inducted", expiry: "" }, { site: "DHL", status: "Not Inducted", expiry: "" }, { site: "Fedex Coomera", status: "Not Inducted", expiry: "" }, { site: "Norco", status: "Not Inducted", expiry: "" }, { site: "Autocare", status: "Not Inducted", expiry: "" }, { site: "Linfox ACR", status: "Not Inducted", expiry: "" }, { site: "Prixcar", status: "Not Inducted", expiry: "" }] },
    { name: "GARRY", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "21/01/2028" }, { site: "Mondiale", status: "Not Inducted", expiry: "" }, { site: "TGE Larapinta", status: "Not Inducted", expiry: "" }, { site: "TGE Karawatha", status: "Not Inducted", expiry: "" }, { site: "Big Michael / Morco", status: "Not Inducted", expiry: "" }, { site: "Cement Australia", status: "Not Inducted", expiry: "" }, { site: "Allied Pinnacle", status: "Not Inducted", expiry: "" }, { site: "Americold Bradman", status: "Not Inducted", expiry: "" }, { site: "DHL", status: "Not Inducted", expiry: "" }, { site: "Fedex Coomera", status: "Not Inducted", expiry: "" }, { site: "Norco", status: "Not Inducted", expiry: "" }, { site: "Autocare", status: "Not Inducted", expiry: "" }, { site: "Linfox ACR", status: "Not Inducted", expiry: "" }, { site: "Prixcar", status: "Not Inducted", expiry: "" }] },
    { name: "SAMAR", inductions: [{ site: "Woolworths", status: "Not Inducted", expiry: "" }, { site: "Mondiale", status: "Inducted", expiry: "14/01/2027" }, { site: "TGE Larapinta", status: "Not Inducted", expiry: "" }, { site: "TGE Karawatha", status: "Not Inducted", expiry: "" }, { site: "Big Michael / Morco", status: "Not Inducted", expiry: "" }, { site: "Cement Australia", status: "Not Inducted", expiry: "" }, { site: "Allied Pinnacle", status: "Not Inducted", expiry: "" }, { site: "Americold Bradman", status: "Not Inducted", expiry: "" }, { site: "DHL", status: "Not Inducted", expiry: "" }, { site: "Fedex Coomera", status: "Not Inducted", expiry: "" }, { site: "Norco", status: "Not Inducted", expiry: "" }, { site: "Autocare", status: "Not Inducted", expiry: "" }, { site: "Linfox ACR", status: "Not Inducted", expiry: "" }, { site: "Prixcar", status: "Not Inducted", expiry: "" }] },
    { name: "SHANT", inductions: [{ site: "Woolworths", status: "Not Inducted", expiry: "" }, { site: "Mondiale", status: "Not Inducted", expiry: "" }, { site: "TGE Larapinta", status: "Inducted", expiry: "" }, { site: "TGE Karawatha", status: "Not Inducted", expiry: "" }, { site: "Big Michael / Morco", status: "Not Inducted", expiry: "" }, { site: "Cement Australia", status: "Not Inducted", expiry: "" }, { site: "Allied Pinnacle", status: "Not Inducted", expiry: "" }, { site: "Americold Bradman", status: "Not Inducted", expiry: "" }, { site: "DHL", status: "Not Inducted", expiry: "" }, { site: "Fedex Coomera", status: "Not Inducted", expiry: "" }, { site: "Norco", status: "Not Inducted", expiry: "" }, { site: "Autocare", status: "Not Inducted", expiry: "" }, { site: "Linfox ACR", status: "Not Inducted", expiry: "" }, { site: "Prixcar", status: "Not Inducted", expiry: "" }] },
    { name: "SHIVAM", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "04/03/2028" }, { site: "Mondiale", status: "Not Inducted", expiry: "" }, { site: "TGE Larapinta", status: "Inducted", expiry: "" }, { site: "TGE Karawatha", status: "Not Inducted", expiry: "" }, { site: "Big Michael / Morco", status: "Inducted", expiry: "08/04/2027" }, { site: "Cement Australia", status: "Not Inducted", expiry: "" }, { site: "Allied Pinnacle", status: "Not Inducted", expiry: "" }, { site: "Americold Bradman", status: "Not Inducted", expiry: "" }, { site: "DHL", status: "Not Inducted", expiry: "" }, { site: "Fedex Coomera", status: "Not Inducted", expiry: "" }, { site: "Norco", status: "Not Inducted", expiry: "" }, { site: "Autocare", status: "Not Inducted", expiry: "" }, { site: "Linfox ACR", status: "Not Inducted", expiry: "" }, { site: "Prixcar", status: "Not Inducted", expiry: "" }] },
    { name: "NARINDER", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "06/03/2027" }] },
    { name: "SAKSHAM", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "07/03/2028" }] },
    { name: "RITESH", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "23/01/2028" }] },
    { name: "DARSHAN", inductions: [{ site: "Mondiale", status: "Inducted", expiry: "06/04/2027" }, { site: "TGE Larapinta", status: "Inducted", expiry: "" }, { site: "Cement Australia", status: "Inducted", expiry: "02/09/2027" }] },
    { name: "BHUMIK", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "25/03/2028" }] },
    { name: "JOHN", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "21/11/2027" }, { site: "Mondiale", status: "Inducted", expiry: "13/01/2027" }, { site: "TGE Larapinta", status: "Inducted", expiry: "" }, { site: "TGE Karawatha", status: "Not Inducted", expiry: "" }, { site: "Big Michael / Morco", status: "Inducted", expiry: "21/07/2026" }, { site: "Cement Australia", status: "Inducted", expiry: "04/09/2027" }, { site: "Allied Pinnacle", status: "Not Inducted", expiry: "" }, { site: "Americold Bradman", status: "Not Inducted", expiry: "" }, { site: "DHL", status: "Inducted", expiry: "16/07/2027" }, { site: "Fedex Coomera", status: "Not Inducted", expiry: "" }, { site: "Norco", status: "Not Inducted", expiry: "" }, { site: "Autocare", status: "Not Inducted", expiry: "" }, { site: "Linfox ACR", status: "Not Inducted", expiry: "" }, { site: "Prixcar", status: "Not Inducted", expiry: "" }] },
    { name: "PAWAN", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "11/04/2028" }, { site: "Mondiale", status: "Inducted", expiry: "05/04/2027" }, { site: "Big Michael / Morco", status: "Inducted", expiry: "04/04/2027" }] },
    { name: "TIM", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "15/01/2028" }] },
    { name: "STEVE", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "20/01/2028" }] },
    { name: "YADVINDER", inductions: [] },
    { name: "JATIN", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "18/04/2028" }] },
    { name: "PARTH", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "18/04/2028" }] },
    { name: "ARANI", inductions: [{ site: "Woolworths", status: "Inducted", expiry: "11/04/2028" }] },
    { name: "SAINATH", inductions: [] }
  ]
};

export const unityAssets = [
  { asset: "Mobile Wash BNE-02", crew: "Brisbane mobile crew", region: "Brisbane", location: "Larapinta", movement: "On site", lastSeen: "6 min ago", status: "green" as Status },
  { asset: "Mobile Wash SYD-04", crew: "Sydney night crew", region: "Sydney", location: "Minchinbury", movement: "In transit", lastSeen: "11 min ago", status: "blue" as Status },
  { asset: "Mobile Wash ADL-01", crew: "Adelaide mobile crew", region: "Adelaide", location: "Gepps Cross", movement: "Stationary", lastSeen: "22 min ago", status: "amber" as Status },
  { asset: "Workshop Ute WKS-01", crew: "Workshop support", region: "Workshop", location: "Workshop", movement: "Available", lastSeen: "4 min ago", status: "green" as Status }
];

export const calendarWeeks: CalendarDay[][] = [
  [
    { day: "Thu", date: "30", month: "Apr", week: "C Week", today: true, jobs: [{ time: "07:00", location: "Melbourne", site: "Woolworths Melbourne DC", crew: "MEL day crew", job: "Day shift wash bay", status: "Scheduled", notes: "Schedule source activation item.", severity: "green" as Status }, { time: "15:00", location: "Adelaide", site: "Primary Connect Adelaide", crew: "ADL mobile crew", job: "Rollover recovery washes", status: "Needs staff", notes: "Manager to confirm coverage before shift.", severity: "red" as Status }, { time: "18:00", location: "Brisbane", site: "Primary Connect Larapinta", crew: "BNE night crew", job: "Trailer wash program", status: "Scheduled", notes: "High-volume evening window.", severity: "green" as Status }] },
    { day: "Fri", date: "1", month: "May", week: "C Week", jobs: [{ time: "10:00", location: "Workshop", site: "Workshop", crew: "Workshop BU", job: "Service review", status: "Watch", notes: "Review vehicles needing return-to-service follow-up.", severity: "amber" as Status }, { time: "19:00", location: "Perth", site: "Primary Connect Perth", crew: "PER mobile crew", job: "Night fleet wash", status: "Scheduled", notes: "Weekend lead-in wash window.", severity: "green" as Status }, { time: "22:00", location: "Sydney", site: "Woolworths Minchinbury", crew: "SYD night crew", job: "Bay coverage", status: "Scheduled", notes: "Prepare for parked weekend fleet.", severity: "green" as Status }] },
    { day: "Sat", date: "2", month: "May", week: "C Week", jobs: [{ time: "06:30", location: "Brisbane", site: "Weekend parked fleet", crew: "BNE weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Weekend is a core wash period.", severity: "green" as Status }, { time: "08:00", location: "Melbourne", site: "Truganina parked fleet", crew: "MEL weekend crew", job: "Parked trailer wash", status: "Scheduled", notes: "Fleet available while parked.", severity: "green" as Status }, { time: "21:00", location: "Sydney", site: "Weekend bay run", crew: "SYD night crew", job: "Night bay run", status: "Watch", notes: "Check roster coverage before shift.", severity: "amber" as Status }] },
    { day: "Sun", date: "3", month: "May", week: "C Week", jobs: [{ time: "07:30", location: "Melbourne", site: "Parked fleet wash", crew: "MEL weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Key weekend wash window.", severity: "green" as Status }, { time: "09:00", location: "Brisbane", site: "Larapinta overflow", crew: "BNE weekend crew", job: "Overflow washes", status: "Scheduled", notes: "Clear rollover before Monday movement.", severity: "green" as Status }, { time: "16:00", location: "Adelaide", site: "Recovery washes", crew: "ADL mobile crew", job: "Recovery wash block", status: "Action", notes: "Supervisor confirmation needed.", severity: "red" as Status }] },
    { day: "Mon", date: "4", month: "May", week: "C Week", jobs: [{ time: "06:00", location: "Canberra", site: "Fleet wash run", crew: "CBR mobile crew", job: "Morning fleet wash", status: "Watch", notes: "Confirm site access before arrival.", severity: "amber" as Status }, { time: "18:00", location: "Brisbane", site: "Primary Connect Larapinta", crew: "BNE night crew", job: "Night wash program", status: "Scheduled", notes: "Normal operating window.", severity: "green" as Status }] },
    { day: "Tue", date: "5", month: "May", week: "C Week", jobs: [{ time: "18:00", location: "Brisbane", site: "Larapinta", crew: "BNE night crew", job: "Trailer wash program", status: "Scheduled", notes: "Schedule source activation item.", severity: "green" as Status }, { time: "20:00", location: "Sydney", site: "Minchinbury", crew: "SYD night crew", job: "Night wash bay", status: "Scheduled", notes: "Watch Fleetio entries after shift.", severity: "green" as Status }] },
    { day: "Wed", date: "6", month: "May", week: "C Week", jobs: [{ time: "19:00", location: "Sydney", site: "Minchinbury", crew: "SYD night crew", job: "Night wash closeout", status: "Scheduled", notes: "End-of-operating-week closeout.", severity: "green" as Status }, { time: "21:00", location: "National", site: "Operating week close", crew: "National ops", job: "C Week review", status: "Watch", notes: "Check approvals, rollover and exceptions.", severity: "amber" as Status }] }
  ],
  [
    { day: "Thu", date: "7", month: "May", week: "D Week", jobs: [{ time: "07:00", location: "Melbourne", site: "DC wash bay", crew: "MEL day crew", job: "Day wash bay", status: "Scheduled", notes: "D Week opening shift.", severity: "green" as Status }, { time: "14:00", location: "Workshop", site: "Asset repairs", crew: "Workshop BU", job: "Asset repairs", status: "Watch", notes: "Workshop to confirm parts availability.", severity: "amber" as Status }] },
    { day: "Fri", date: "8", month: "May", week: "D Week", jobs: [{ time: "15:00", location: "Adelaide", site: "Primary Connect", crew: "ADL mobile crew", job: "Afternoon wash run", status: "Watch", notes: "Confirm staff availability.", severity: "amber" as Status }, { time: "19:00", location: "Perth", site: "Primary Connect Perth", crew: "PER mobile crew", job: "Friday night wash", status: "Scheduled", notes: "Prepare weekend volume.", severity: "green" as Status }] },
    { day: "Sat", date: "9", month: "May", week: "D Week", jobs: [{ time: "08:00", location: "Perth", site: "Weekend fleet wash", crew: "PER weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Weekend core washing.", severity: "green" as Status }, { time: "09:30", location: "Brisbane", site: "Weekend parked fleet", crew: "BNE weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "High availability window.", severity: "green" as Status }] },
    { day: "Sun", date: "10", month: "May", week: "D Week", jobs: [{ time: "09:00", location: "National", site: "Weekend coverage", crew: "National ops", job: "Coverage check", status: "Watch", notes: "Managers check coverage and exceptions.", severity: "amber" as Status }, { time: "10:00", location: "Sydney", site: "Weekend bay run", crew: "SYD weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Weekend wash window.", severity: "green" as Status }] },
    { day: "Mon", date: "11", month: "May", week: "D Week", jobs: [{ time: "18:00", location: "Brisbane", site: "Primary Connect", crew: "BNE night crew", job: "Night wash program", status: "Scheduled", notes: "Normal night shift.", severity: "green" as Status }] },
    { day: "Tue", date: "12", month: "May", week: "D Week", jobs: [{ time: "18:00", location: "Brisbane", site: "Primary Connect", crew: "BNE night crew", job: "Trailer wash program", status: "Scheduled", notes: "Schedule source activation item.", severity: "green" as Status }, { time: "20:00", location: "Sydney", site: "Night wash", crew: "SYD night crew", job: "Night wash bay", status: "Scheduled", notes: "Fleetio check after shift.", severity: "green" as Status }] },
    { day: "Wed", date: "13", month: "May", week: "D Week", jobs: [{ time: "20:00", location: "Sydney", site: "Night wash", crew: "SYD night crew", job: "Operating week closeout", status: "Scheduled", notes: "D Week closeout.", severity: "green" as Status }] }
  ],
  [
    { day: "Thu", date: "14", month: "May", week: "A Week", jobs: [{ time: "07:00", location: "Melbourne", site: "DC wash bay", crew: "MEL day crew", job: "A Week opening wash", status: "Scheduled", notes: "Opening shift.", severity: "green" as Status }] },
    { day: "Fri", date: "15", month: "May", week: "A Week", jobs: [{ time: "15:00", location: "Adelaide", site: "Mobile run", crew: "ADL mobile crew", job: "Mobile wash run", status: "Watch", notes: "Confirm mobile crew availability.", severity: "amber" as Status }] },
    { day: "Sat", date: "16", month: "May", week: "A Week", jobs: [{ time: "08:00", location: "Brisbane", site: "Parked fleet wash", crew: "BNE weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Weekend core wash.", severity: "green" as Status }, { time: "11:00", location: "Workshop", site: "Machine checks", crew: "Workshop BU", job: "Machine checks", status: "Watch", notes: "Check Ponys and generators.", severity: "amber" as Status }] },
    { day: "Sun", date: "17", month: "May", week: "A Week", jobs: [{ time: "08:30", location: "Sydney", site: "Parked fleet wash", crew: "SYD weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Weekend washing while fleet is parked.", severity: "green" as Status }] },
    { day: "Mon", date: "18", month: "May", week: "A Week", jobs: [{ time: "06:00", location: "Canberra", site: "Fleet wash", crew: "CBR mobile crew", job: "Morning fleet wash", status: "Watch", notes: "Confirm site readiness.", severity: "amber" as Status }] },
    { day: "Tue", date: "19", month: "May", week: "A Week", jobs: [{ time: "18:00", location: "Brisbane", site: "Larapinta", crew: "BNE night crew", job: "Trailer wash program", status: "Scheduled", notes: "Normal wash window.", severity: "green" as Status }] },
    { day: "Wed", date: "20", month: "May", week: "A Week", jobs: [{ time: "20:00", location: "Sydney", site: "Minchinbury", crew: "SYD night crew", job: "Operating week closeout", status: "Scheduled", notes: "A Week closeout.", severity: "green" as Status }] }
  ],
  [
    { day: "Thu", date: "21", month: "May", week: "B Week", jobs: [{ time: "07:00", location: "Melbourne", site: "DC wash bay", crew: "MEL day crew", job: "B Week opening wash", status: "Scheduled", notes: "Opening shift.", severity: "green" as Status }] },
    { day: "Fri", date: "22", month: "May", week: "B Week", jobs: [{ time: "15:00", location: "Adelaide", site: "Primary Connect", crew: "ADL mobile crew", job: "Friday wash run", status: "Watch", notes: "Monitor rollover count.", severity: "amber" as Status }] },
    { day: "Sat", date: "23", month: "May", week: "B Week", jobs: [{ time: "08:00", location: "Perth", site: "Weekend fleet wash", crew: "PER weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Weekend parked fleet.", severity: "green" as Status }, { time: "08:45", location: "Brisbane", site: "Weekend parked fleet", crew: "BNE weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Core weekend washing.", severity: "green" as Status }] },
    { day: "Sun", date: "24", month: "May", week: "B Week", jobs: [{ time: "09:00", location: "National", site: "Weekend parked fleets", crew: "National ops", job: "Weekend fleet health", status: "Scheduled", notes: "National manager visibility.", severity: "green" as Status }, { time: "10:30", location: "Sydney", site: "Weekend bay run", crew: "SYD weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Weekend core shift.", severity: "green" as Status }] },
    { day: "Mon", date: "25", month: "May", week: "B Week", jobs: [] },
    { day: "Tue", date: "26", month: "May", week: "B Week", jobs: [{ time: "18:00", location: "Brisbane", site: "Primary Connect", crew: "BNE night crew", job: "Night wash program", status: "Scheduled", notes: "Normal wash window.", severity: "green" as Status }] },
    { day: "Wed", date: "27", month: "May", week: "B Week", jobs: [{ time: "20:00", location: "Sydney", site: "Night wash", crew: "SYD night crew", job: "Operating week closeout", status: "Scheduled", notes: "B Week closeout.", severity: "green" as Status }] }
  ]
];

export const assets: { name: string; region: string; state: string; gps: string; service: string; status: Status }[] = [];

export type ComplianceSeed = {
  title: string;
  region: string;
  owner: string;
  due: string;
  status: string;
  type: string;
  severity: Status;
  href: string;
  adminSet: boolean;
};

export const compliance: ComplianceSeed[] = [];

export const approvedStockItems = [
  "Heavy duty wash chemical",
  "Traffic film remover",
  "Degreaser",
  "Gloves",
  "Safety glasses",
  "Spray lance trigger",
  "Pressure hose",
  "PPE kit",
  "Generator service consumables"
];

export type StockOrderSeed = {
  item: string;
  region: string;
  quantity: number;
  urgency: string;
  status: string;
  note: string;
  update: string;
  trackingNumber: string;
};

export const stockOrders: StockOrderSeed[] = [];

export const adminUsers = [
  { name: "Admin User", id: "TOC-ADMIN", role: "Admin", regions: "National + Brisbane", permissions: "Full command control, Admin Settings, assigned region management" },
  { name: "Director User", id: "TOC-DIRECTOR", role: "Director", regions: "National", permissions: "Business overall position and Director message broadcast" },
  { name: "Manager User", id: "TOC-MANAGER", role: "Manager", regions: "Sydney + Workshop", permissions: "Assigned region actions, stock, compliance, productivity and chat" }
];
