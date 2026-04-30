export type Status = "green" | "amber" | "red" | "blue";

export type CalendarJob = {
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

export const metrics = [
  { label: "Portal approvals", value: "25", detail: "Waiting on manager action", status: "amber" as Status, href: "/portal" },
  { label: "Assets online", value: "5/8", detail: "Fleetio and GPS ready", status: "blue" as Status, href: "/fleet" },
  { label: "Risk flags", value: "13", detail: "Compliance, staffing, data", status: "red" as Status, href: "/actions" }
];

export const commandSignals = [
  {
    title: "Approvals are holding admin flow",
    source: "Thor Portal",
    severity: "amber" as Status,
    owner: "Regional managers",
    action: "Review jobsheets",
    href: "/portal",
    detail: "Manager-approved jobsheets are the gate before invoicing can move cleanly."
  },
  {
    title: "Compliance exceptions need ownership",
    source: "Compliance",
    severity: "red" as Status,
    owner: "Managers",
    action: "Open compliance",
    href: "/compliance",
    detail: "Inductions, safety checks and site-readiness items must be current before operational risk builds."
  },
  {
    title: "Roster and productivity pressure",
    source: "Roster",
    severity: "amber" as Status,
    owner: "Productivity",
    action: "Check coverage",
    href: "/actions",
    detail: "Next-shift gaps should be resolved before they become missed washes or client pressure."
  },
  {
    title: "Asset service watch",
    source: "Equipment Servicing",
    severity: "blue" as Status,
    owner: "Workshop",
    action: "Open servicing",
    href: "/equipment-servicing",
    detail: "Vehicles, wash plants, generators and Pony machines need odometer/hour visibility before servicing becomes reactive."
  }
];

export const actionItems = [
  {
    id: "ACT-001",
    title: "National Woolworths Fleetio accuracy check",
    source: "National ops",
    directive: "National ops directive",
    region: "National",
    severity: "red" as Status,
    href: "/actions#ACT-001",
    detail: "Confirm Fleetio wash records are clean before invoicing and client reporting move forward.",
    status: "Open",
    closeFlow: "Manager close-out requires national approval before final closure."
  },
  {
    id: "ACT-002",
    title: "Primary Connect induction exceptions",
    source: "Compliance",
    directive: "National ops directive",
    region: "Brisbane",
    severity: "red" as Status,
    href: "/compliance",
    detail: "Induction and site-readiness exceptions need manager ownership before site risk builds.",
    status: "Overdue",
    closeFlow: "Close-out routes to national manager approval."
  },
  {
    id: "ACT-003",
    title: "Friday PM roster coverage gap",
    source: "Roster",
    directive: "Scheduled directive",
    region: "Adelaide",
    severity: "amber" as Status,
    href: "/staff-availability",
    detail: "Coverage gap may affect scheduled wash delivery if not confirmed before shift start.",
    status: "Due today",
    closeFlow: "Manager close-out routes to national review."
  },
  {
    id: "ACT-004",
    title: "Portal approvals holding admin flow",
    source: "Thor Portal",
    directive: "Action required",
    region: "Sydney",
    severity: "amber" as Status,
    href: "/portal",
    detail: "Approval delays can block invoicing, client reporting and admin close.",
    status: "Open",
    closeFlow: "Manager resolution is sent to national approval."
  },
  {
    id: "ACT-005",
    title: "Wash plant hour reading due",
    source: "Equipment Servicing",
    directive: "Scheduled directive",
    region: "Brisbane",
    severity: "amber" as Status,
    href: "/equipment-servicing",
    detail: "Hour readings are required so servicing can be planned before plant failure.",
    status: "Due soon",
    closeFlow: "Workshop or manager close-out routes to national review."
  },
  {
    id: "ACT-006",
    title: "Chemical stock request overdue",
    source: "Stock Orders",
    directive: "Action required",
    region: "Perth",
    severity: "amber" as Status,
    href: "/stock-orders",
    detail: "Stock needs should be raised early so supply does not block scheduled wash work.",
    status: "Open",
    closeFlow: "Close-out requires national stock approval."
  },
  {
    id: "ACT-007",
    title: "Workshop parts shelf minimum check",
    source: "Workshop",
    directive: "Scheduled directive",
    region: "Workshop",
    severity: "blue" as Status,
    href: "/stock-orders",
    detail: "Parts shelf minimums need confirmation so service work is not delayed.",
    status: "Scheduled",
    closeFlow: "Workshop close-out routes to national approval."
  }
];

export const commandPathways = [
  { step: "1", label: "Action Centre", href: "/actions", detail: "Start here when something needs action, ownership, escalation or clearing." },
  { step: "2", label: "Region Health", href: "/overview", detail: "Check whether each state is healthy enough to run the day without surprises." },
  { step: "3", label: "Compliance", href: "/compliance", detail: "Confirm induction, safety and site-readiness issues are complete and green." },
  { step: "4", label: "Stock Orders", href: "/stock-orders", detail: "Raise supply needs early before chemicals, PPE or parts block the work." },
  { step: "5", label: "Productivity", href: "/operations", detail: "Review wage cost, gross margin, productivity queues, rollover counts and actions." },
  { step: "6", label: "Asset Tracking", href: "/asset-tracking", detail: "Track Unity GPS-equipped wash vehicles and mobile crews in the field." },
  { step: "7", label: "Calendar", href: "/calendar", detail: "Review scheduled jobs by day and location before the work starts." },
  { step: "8", label: "Staff Availability", href: "/staff-availability", detail: "Use the availability heat map to quickly see who can cover work." },
  { step: "9", label: "Equipment Servicing", href: "/equipment-servicing", detail: "Track odometer and hour readings so servicing and repairs are visible before assets fail." },
  { step: "10", label: "Chat", href: "/chat", detail: "Keep the management communication trail clear and healthy." }
];

export const goLivePathway = [
  { step: "01", title: "Determine page order and flow", status: "In progress", severity: "amber" as Status },
  { step: "02", title: "Add required features to pages", status: "In progress", severity: "amber" as Status },
  { step: "03", title: "Determine user access levels", status: "In progress", severity: "amber" as Status },
  { step: "04", title: "Create database", status: "Pending", severity: "blue" as Status },
  { step: "05", title: "Link database", status: "Pending", severity: "blue" as Status },
  { step: "06", title: "Connect API and Webhook feeds", status: "Pending", severity: "blue" as Status },
  { step: "07", title: "Add remaining feature requests", status: "Pending", severity: "blue" as Status },
  { step: "08", title: "Test connections", status: "Pending", severity: "blue" as Status },
  { step: "09", title: "Beta test TOC", status: "Pending", severity: "blue" as Status },
  { step: "10", title: "Deploy live", status: "Pending", severity: "blue" as Status }
];

export const integrationReadiness = [
  { system: "Thor Portal", purpose: "Jobsheets, approvals, odometer readings, hour readings, admin flow and invoicing readiness", status: "Webhook pending", severity: "amber" as Status },
  { system: "Fleetio", purpose: "Assets, GPS, service schedule, wash records and Woolworths wash data", status: "API pending", severity: "amber" as Status },
  { system: "Unity", purpose: "GPS tracking for wash vehicles, mobile crews and field asset position", status: "Mapping pending", severity: "blue" as Status },
  { system: "Outlook", purpose: "Calendar reminders, manager follow-ups and escalation dates", status: "Connection pending", severity: "blue" as Status }
];

export const regions = [
  { name: "Brisbane", readiness: 62, portal: 7, wash: 82, risks: 2, note: "Action pressure from compliance exceptions and plant readings." },
  { name: "Sydney", readiness: 78, portal: 4, wash: 76, risks: 3, note: "Portal approvals are holding admin flow." },
  { name: "Melbourne", readiness: 96, portal: 5, wash: 79, risks: 1, note: "Healthy. Maintain approval discipline and wash output." },
  { name: "Adelaide", readiness: 44, portal: 2, wash: 62, risks: 2, note: "Roster coverage gap is pulling health down." },
  { name: "Perth", readiness: 82, portal: 3, wash: 71, risks: 1, note: "Stock request requires manager follow-up." },
  { name: "Canberra", readiness: 97, portal: 1, wash: 58, risks: 2, note: "Healthy. Keep GPS and Fleetio checks current." },
  { name: "Workshop", readiness: 88, portal: 3, wash: 68, risks: 2, note: "Scheduled workshop directive remains open." }
];

export const approvals = [
  { id: "TOC-1014", region: "Brisbane", site: "Primary Connect Larapinta", count: 38, age: "2h 10m", risk: "Data check" },
  { id: "TOC-1015", region: "Sydney", site: "Woolworths Minchinbury", count: 26, age: "3h 45m", risk: "Photo missing" },
  { id: "TOC-1016", region: "Melbourne", site: "Woolworths Melbourne DC", count: 31, age: "1h 35m", risk: "Ready" },
  { id: "TOC-1017", region: "Adelaide", site: "Primary Connect Adelaide", count: 14, age: "4h 05m", risk: "Wash type query" }
];

export const tasks = [
  { title: "Correct Fleetio wash type mismatch", owner: "Regional manager", region: "Brisbane", priority: "High" },
  { title: "Confirm night crew site sign-out discipline", owner: "Regional manager", region: "Sydney", priority: "High" },
  { title: "Fill Friday PM roster gap", owner: "Regional manager", region: "Adelaide", priority: "Medium" },
  { title: "Confirm parts shelf minimum stock levels", owner: "Workshop lead", region: "Workshop", priority: "Medium" }
];

export const nationalTasks = [
  { title: "Woolworths Fleetio accuracy check", owner: "National admin", priority: "High" },
  { title: "Review all manager approvals before invoicing", owner: "National ops", priority: "High" },
  { title: "Primary Connect compliance pack refresh", owner: "National ops", priority: "Medium" }
];

export const washes = [
  { site: "Primary Connect Larapinta", region: "Brisbane", target: 90, actual: 82, internal: 21, exceptions: 3 },
  { site: "Woolworths Minchinbury", region: "Sydney", target: 82, actual: 76, internal: 16, exceptions: 4 },
  { site: "Woolworths Melbourne DC", region: "Melbourne", target: 84, actual: 79, internal: 19, exceptions: 1 },
  { site: "Primary Connect Adelaide", region: "Adelaide", target: 70, actual: 62, internal: 8, exceptions: 3 },
  { site: "Primary Connect Perth", region: "Perth", target: 78, actual: 71, internal: 13, exceptions: 2 }
];

export const productivitySites = [
  { site: "Primary Connect Larapinta", region: "Brisbane", grossMargin: 84, wageCost: 16, queue: "Fleetio exception follow-up", action: "Refine data discipline and clear wash type mismatches.", units: 82, labourHours: 18 },
  { site: "Weekend parked fleet", region: "Brisbane", grossMargin: 76, wageCost: 24, queue: "Weekend output watch", action: "Confirm crew mix before parked fleet volume peaks.", units: 64, labourHours: 16 },
  { site: "Woolworths Minchinbury", region: "Sydney", grossMargin: 68, wageCost: 32, queue: "Rollover pressure", action: "Review night bay pace and reduce rollover into next shift.", units: 76, labourHours: 20 },
  { site: "Woolworths Melbourne DC", region: "Melbourne", grossMargin: 81, wageCost: 19, queue: "Healthy", action: "Maintain current output and approve any delayed jobsheets.", units: 79, labourHours: 17 },
  { site: "Primary Connect Adelaide", region: "Adelaide", grossMargin: 46, wageCost: 54, queue: "Staffing action", action: "Fix crew coverage gap before the next wash window.", units: 62, labourHours: 19 },
  { site: "Primary Connect Perth", region: "Perth", grossMargin: 73, wageCost: 27, queue: "Stock watch", action: "Confirm chemical stock before weekend operations.", units: 71, labourHours: 18 },
  { site: "Canberra fleet wash run", region: "Canberra", grossMargin: 88, wageCost: 12, queue: "Healthy", action: "Keep site readiness and GPS checks current.", units: 58, labourHours: 11 },
  { site: "Workshop productivity", region: "Workshop", grossMargin: 64, wageCost: 36, queue: "Parts queue", action: "Clear parts availability items before service work stacks up.", units: 7, labourHours: 9 }
];

export const serviceSchedule = [
  { asset: "Mobile Wash ADL-01", region: "Adelaide", due: "2 days", item: "Pump service and lance inspection", status: "Due soon", severity: "red" as Status },
  { asset: "Mobile Wash SYD-04", region: "Sydney", due: "6 days", item: "Pressure hose inspection", status: "Watch", severity: "amber" as Status },
  { asset: "Workshop Parts Ute", region: "Workshop", due: "3 days", item: "Defect check and parts audit", status: "Due soon", severity: "amber" as Status },
  { asset: "Wash Plant BNE-01", region: "Brisbane", due: "18 days", item: "Preventative service", status: "Scheduled", severity: "green" as Status }
];

export const equipmentServiceSummary = [
  { label: "Wash vehicles", value: "2", detail: "Need odometer review", severity: "amber" as Status },
  { label: "Wash plants", value: "1", detail: "Hour reading due", severity: "red" as Status },
  { label: "Pony machines", value: "3", detail: "Mechanical service watch", severity: "blue" as Status },
  { label: "Portal readings", value: "Pending", detail: "Thor Portal feed planned", severity: "amber" as Status }
];

export const equipmentAssets = [
  {
    asset: "Mobile Wash ADL-01",
    category: "Wash vehicle",
    region: "Adelaide",
    readingType: "Odometer",
    currentReading: "184,220 km",
    nextService: "186,000 km",
    remaining: "1,780 km",
    lastSubmitted: "Portal feed pending",
    status: "Watch",
    severity: "amber" as Status
  },
  {
    asset: "Mobile Wash SYD-04",
    category: "Wash ute",
    region: "Sydney",
    readingType: "Odometer",
    currentReading: "91,840 km",
    nextService: "95,000 km",
    remaining: "3,160 km",
    lastSubmitted: "Portal feed pending",
    status: "On track",
    severity: "green" as Status
  },
  {
    asset: "Wash Plant BNE-01 Honda",
    category: "Wash plant",
    region: "Brisbane",
    readingType: "Hours",
    currentReading: "1,246 h",
    nextService: "1,250 h",
    remaining: "4 h",
    lastSubmitted: "Portal feed pending",
    status: "Action",
    severity: "red" as Status
  },
  {
    asset: "Generator MEL-02",
    category: "Generator",
    region: "Melbourne",
    readingType: "Hours",
    currentReading: "812 h",
    nextService: "850 h",
    remaining: "38 h",
    lastSubmitted: "Portal feed pending",
    status: "On track",
    severity: "green" as Status
  },
  {
    asset: "Pony Machine WKS-03",
    category: "Pony",
    region: "Workshop",
    readingType: "Hours",
    currentReading: "436 h",
    nextService: "450 h",
    remaining: "14 h",
    lastSubmitted: "Portal feed pending",
    status: "Watch",
    severity: "blue" as Status
  }
];

export const servicingDataFlow = [
  { step: "1", title: "Reading captured", detail: "Manager or team leader records odometer or hour reading in Thor Portal." },
  { step: "2", title: "Portal sends feed", detail: "Thor Portal sends the latest reading to TOC through API or webhook." },
  { step: "3", title: "TOC calculates status", detail: "TOC compares the reading against service intervals and flags green, watch or action." },
  { step: "4", title: "Workshop acts", detail: "Jason and workshop users track what needs booking, parts or return-to-service follow-up." }
];

export const washRolloverCounters = [
  { region: "Brisbane", site: "Primary Connect Larapinta", yesterday: 86, today: 82, rollover: 4, trend: "On track", severity: "green" as Status },
  { region: "Sydney", site: "Woolworths Minchinbury", yesterday: 79, today: 76, rollover: 6, trend: "Watch", severity: "amber" as Status },
  { region: "Adelaide", site: "Primary Connect Adelaide", yesterday: 66, today: 62, rollover: 8, trend: "Action", severity: "red" as Status }
];

export const outlookReminders = [
  { region: "National", time: "Today 3:00 pm", title: "Review Portal approvals before admin close", source: "Outlook planned", severity: "amber" as Status },
  { region: "Sydney", time: "Tomorrow 1:00 pm", title: "Night crew induction follow-up", source: "Calendar planned", severity: "red" as Status },
  { region: "Workshop", time: "Friday 10:00 am", title: "Workshop parts and service review", source: "Calendar planned", severity: "amber" as Status }
];

export const rosterWindows = [
  { region: "Brisbane", shift: "Tonight", coverage: "Covered", staff: "6/6", gap: "No roster gap", severity: "green" as Status },
  { region: "Sydney", shift: "Tonight", coverage: "Watch", staff: "5/6", gap: "One backup staff member preferred", severity: "amber" as Status },
  { region: "Adelaide", shift: "Tomorrow PM", coverage: "Gap", staff: "3/4", gap: "Confirm one wash hand", severity: "red" as Status },
  { region: "Workshop", shift: "Tomorrow", coverage: "Watch", staff: "2/3", gap: "Jason to confirm support if defects spike", severity: "amber" as Status }
];

export const staffAvailability = [
  { region: "Brisbane", window: "6pm-12am", available: 4, unavailable: 1, status: "Healthy", severity: "green" as Status },
  { region: "Sydney", window: "12am-6am", available: 2, unavailable: 2, status: "Thin", severity: "amber" as Status },
  { region: "Adelaide", window: "6pm-12am", available: 1, unavailable: 3, status: "Action", severity: "red" as Status },
  { region: "Workshop", window: "6am-12pm", available: 2, unavailable: 1, status: "Watch", severity: "amber" as Status }
];

export const unityAssets = [
  { asset: "Mobile Wash BNE-02", crew: "Brisbane mobile crew", region: "Brisbane", location: "Larapinta", movement: "On site", lastSeen: "6 min ago", status: "green" as Status },
  { asset: "Mobile Wash SYD-04", crew: "Sydney night crew", region: "Sydney", location: "Minchinbury", movement: "In transit", lastSeen: "11 min ago", status: "blue" as Status },
  { asset: "Mobile Wash ADL-01", crew: "Adelaide mobile crew", region: "Adelaide", location: "Gepps Cross", movement: "Stationary", lastSeen: "22 min ago", status: "amber" as Status },
  { asset: "Workshop Ute WKS-01", crew: "Workshop support", region: "Workshop", location: "Workshop", movement: "Available", lastSeen: "4 min ago", status: "green" as Status }
];

export const calendarWeeks: CalendarDay[][] = [
  [
    { day: "Thu", date: "30", month: "Apr", week: "C Week", today: true, jobs: [{ time: "07:00", location: "Melbourne", site: "Woolworths Melbourne DC", crew: "MEL day crew", job: "Day shift wash bay", status: "Scheduled", notes: "Portal schedule feed placeholder.", severity: "green" as Status }, { time: "15:00", location: "Adelaide", site: "Primary Connect Adelaide", crew: "ADL mobile crew", job: "Rollover recovery washes", status: "Needs staff", notes: "Manager to confirm coverage before shift.", severity: "red" as Status }, { time: "18:00", location: "Brisbane", site: "Primary Connect Larapinta", crew: "BNE night crew", job: "Trailer wash program", status: "Scheduled", notes: "High-volume evening window.", severity: "green" as Status }] },
    { day: "Fri", date: "1", month: "May", week: "C Week", jobs: [{ time: "10:00", location: "Workshop", site: "Workshop", crew: "Workshop BU", job: "Service review", status: "Watch", notes: "Review vehicles needing return-to-service follow-up.", severity: "amber" as Status }, { time: "19:00", location: "Perth", site: "Primary Connect Perth", crew: "PER mobile crew", job: "Night fleet wash", status: "Scheduled", notes: "Weekend lead-in wash window.", severity: "green" as Status }, { time: "22:00", location: "Sydney", site: "Woolworths Minchinbury", crew: "SYD night crew", job: "Bay coverage", status: "Scheduled", notes: "Prepare for parked weekend fleet.", severity: "green" as Status }] },
    { day: "Sat", date: "2", month: "May", week: "C Week", jobs: [{ time: "06:30", location: "Brisbane", site: "Weekend parked fleet", crew: "BNE weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Weekend is a core wash period.", severity: "green" as Status }, { time: "08:00", location: "Melbourne", site: "Truganina parked fleet", crew: "MEL weekend crew", job: "Parked trailer wash", status: "Scheduled", notes: "Fleet available while parked.", severity: "green" as Status }, { time: "21:00", location: "Sydney", site: "Weekend bay run", crew: "SYD night crew", job: "Night bay run", status: "Watch", notes: "Check roster coverage before shift.", severity: "amber" as Status }] },
    { day: "Sun", date: "3", month: "May", week: "C Week", jobs: [{ time: "07:30", location: "Melbourne", site: "Parked fleet wash", crew: "MEL weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Key weekend wash window.", severity: "green" as Status }, { time: "09:00", location: "Brisbane", site: "Larapinta overflow", crew: "BNE weekend crew", job: "Overflow washes", status: "Scheduled", notes: "Clear rollover before Monday movement.", severity: "green" as Status }, { time: "16:00", location: "Adelaide", site: "Recovery washes", crew: "ADL mobile crew", job: "Recovery wash block", status: "Action", notes: "Supervisor confirmation needed.", severity: "red" as Status }] },
    { day: "Mon", date: "4", month: "May", week: "C Week", jobs: [{ time: "06:00", location: "Canberra", site: "Fleet wash run", crew: "CBR mobile crew", job: "Morning fleet wash", status: "Watch", notes: "Confirm site access before arrival.", severity: "amber" as Status }, { time: "18:00", location: "Brisbane", site: "Primary Connect Larapinta", crew: "BNE night crew", job: "Night wash program", status: "Scheduled", notes: "Normal operating window.", severity: "green" as Status }] },
    { day: "Tue", date: "5", month: "May", week: "C Week", jobs: [{ time: "18:00", location: "Brisbane", site: "Larapinta", crew: "BNE night crew", job: "Trailer wash program", status: "Scheduled", notes: "Portal feed placeholder.", severity: "green" as Status }, { time: "20:00", location: "Sydney", site: "Minchinbury", crew: "SYD night crew", job: "Night wash bay", status: "Scheduled", notes: "Watch Fleetio entries after shift.", severity: "green" as Status }] },
    { day: "Wed", date: "6", month: "May", week: "C Week", jobs: [{ time: "19:00", location: "Sydney", site: "Minchinbury", crew: "SYD night crew", job: "Night wash closeout", status: "Scheduled", notes: "End-of-operating-week closeout.", severity: "green" as Status }, { time: "21:00", location: "National", site: "Operating week close", crew: "National ops", job: "C Week review", status: "Watch", notes: "Check approvals, rollover and exceptions.", severity: "amber" as Status }] }
  ],
  [
    { day: "Thu", date: "7", month: "May", week: "D Week", jobs: [{ time: "07:00", location: "Melbourne", site: "DC wash bay", crew: "MEL day crew", job: "Day wash bay", status: "Scheduled", notes: "D Week opening shift.", severity: "green" as Status }, { time: "14:00", location: "Workshop", site: "Asset repairs", crew: "Workshop BU", job: "Asset repairs", status: "Watch", notes: "Workshop to confirm parts availability.", severity: "amber" as Status }] },
    { day: "Fri", date: "8", month: "May", week: "D Week", jobs: [{ time: "15:00", location: "Adelaide", site: "Primary Connect", crew: "ADL mobile crew", job: "Afternoon wash run", status: "Watch", notes: "Confirm staff availability.", severity: "amber" as Status }, { time: "19:00", location: "Perth", site: "Primary Connect Perth", crew: "PER mobile crew", job: "Friday night wash", status: "Scheduled", notes: "Prepare weekend volume.", severity: "green" as Status }] },
    { day: "Sat", date: "9", month: "May", week: "D Week", jobs: [{ time: "08:00", location: "Perth", site: "Weekend fleet wash", crew: "PER weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Weekend core washing.", severity: "green" as Status }, { time: "09:30", location: "Brisbane", site: "Weekend parked fleet", crew: "BNE weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "High availability window.", severity: "green" as Status }] },
    { day: "Sun", date: "10", month: "May", week: "D Week", jobs: [{ time: "09:00", location: "National", site: "Weekend coverage", crew: "National ops", job: "Coverage check", status: "Watch", notes: "Managers check coverage and exceptions.", severity: "amber" as Status }, { time: "10:00", location: "Sydney", site: "Weekend bay run", crew: "SYD weekend crew", job: "Parked fleet wash", status: "Scheduled", notes: "Weekend wash window.", severity: "green" as Status }] },
    { day: "Mon", date: "11", month: "May", week: "D Week", jobs: [{ time: "18:00", location: "Brisbane", site: "Primary Connect", crew: "BNE night crew", job: "Night wash program", status: "Scheduled", notes: "Normal night shift.", severity: "green" as Status }] },
    { day: "Tue", date: "12", month: "May", week: "D Week", jobs: [{ time: "18:00", location: "Brisbane", site: "Primary Connect", crew: "BNE night crew", job: "Trailer wash program", status: "Scheduled", notes: "Portal feed placeholder.", severity: "green" as Status }, { time: "20:00", location: "Sydney", site: "Night wash", crew: "SYD night crew", job: "Night wash bay", status: "Scheduled", notes: "Fleetio check after shift.", severity: "green" as Status }] },
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

export const staffHeatMap = [
  { name: "Crew A", region: "Brisbane", availability: ["green", "green", "amber", "green", "red", "green", "green"] as Status[] },
  { name: "Crew B", region: "Sydney", availability: ["amber", "green", "green", "amber", "red", "green", "amber"] as Status[] },
  { name: "Crew C", region: "Melbourne", availability: ["green", "green", "green", "green", "amber", "green", "green"] as Status[] },
  { name: "Crew D", region: "Adelaide", availability: ["red", "amber", "amber", "red", "green", "amber", "green"] as Status[] },
  { name: "Workshop", region: "Workshop", availability: ["green", "green", "green", "amber", "amber", "green", "amber"] as Status[] }
];

export const assets = [
  { name: "Wash Plant BNE-01", region: "Brisbane", state: "Online", gps: "Larapinta", service: "18 days", status: "green" as Status },
  { name: "Mobile Wash SYD-04", region: "Sydney", state: "Online", gps: "Minchinbury", service: "6 days", status: "amber" as Status },
  { name: "Wash Plant MEL-02", region: "Melbourne", state: "Online", gps: "Truganina", service: "22 days", status: "green" as Status },
  { name: "Mobile Wash ADL-01", region: "Adelaide", state: "Attention", gps: "Gepps Cross", service: "2 days", status: "red" as Status },
  { name: "Workshop Service Bay", region: "Workshop", state: "Online", gps: "Workshop", service: "Current", status: "green" as Status }
];

export const compliance = [
  { title: "Primary Connect site inductions", region: "Brisbane", owner: "Regional manager", due: "30 Apr", status: "Due soon", type: "Induction", severity: "amber" as Status, href: "/actions#ACT-002", adminSet: true },
  { title: "3-point contact refresher", region: "Sydney", owner: "Regional manager", due: "Today", status: "Action required", type: "Safety", severity: "red" as Status, href: "/actions#ACT-004", adminSet: true },
  { title: "SDS and chemical register review", region: "Melbourne", owner: "Regional manager", due: "18 May", status: "Current", type: "Document", severity: "green" as Status, href: "/actions", adminSet: true },
  { title: "First aid kit audit", region: "Adelaide", owner: "Regional manager", due: "Yesterday", status: "Overdue", type: "Equipment", severity: "red" as Status, href: "/actions#ACT-003", adminSet: true },
  { title: "Workshop isolation and defect-tag process", region: "Workshop", owner: "Workshop lead", due: "3 May", status: "Due soon", type: "Safety", severity: "amber" as Status, href: "/actions#ACT-007", adminSet: true }
];

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

export const stockOrders = [
  { item: "Heavy duty wash chemical", region: "Brisbane", quantity: 4, urgency: "Urgent", status: "Awaiting national approval", note: "Needed before weekend Primary Connect volume.", update: "National ops reviewing supplier stock today.", trackingNumber: "Pending" },
  { item: "Gloves", region: "Sydney", quantity: 12, urgency: "Normal", status: "Pending dispatch", note: "Night crew PPE top-up.", update: "Approved. Dispatch ETA to be confirmed.", trackingNumber: "Pending dispatch" },
  { item: "Spray lance trigger", region: "Adelaide", quantity: 2, urgency: "Urgent", status: "Parts being sourced", note: "Required for mobile wash unit.", update: "Jason checking workshop parts shelf before ordering.", trackingNumber: "Workshop supply" },
  { item: "Pressure hose", region: "Workshop", quantity: 1, urgency: "Normal", status: "Open", note: "Workshop stock minimum.", update: "Pending admin review.", trackingNumber: "Pending" }
];

export const adminUsers = [
  { name: "Admin User", id: "TOC-ADMIN", role: "Admin", regions: "National", permissions: "All controls" },
  { name: "National Ops User", id: "TOC-NATOPS", role: "National Ops", regions: "National", permissions: "Approvals, action centre, stock, compliance, chat" },
  { name: "Director User", id: "TOC-DIRECTOR", role: "Director", regions: "National", permissions: "Owner region health only" },
  { name: "Workshop User", id: "TOC-WORKSHOP", role: "Workshop", regions: "Workshop", permissions: "Workshop action centre, stock, compliance, chat" }
];
