export type Status = "green" | "amber" | "red" | "blue";

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
    title: "Roster and availability pressure",
    source: "Roster",
    severity: "amber" as Status,
    owner: "Operations",
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

export const commandPathways = [
  { step: "1", label: "Action Centre", href: "/actions", detail: "Start here when something needs action, ownership, escalation or clearing." },
  { step: "2", label: "Region Health", href: "/overview", detail: "Check whether each state is healthy enough to run the day without surprises." },
  { step: "3", label: "Compliance", href: "/compliance", detail: "Confirm induction, safety and site-readiness issues are complete and green." },
  { step: "4", label: "Stock Orders", href: "/stock-orders", detail: "Raise supply needs early before chemicals, PPE or parts block the work." },
  { step: "5", label: "Operations", href: "/operations", detail: "Review wash output, rollover counts, assets, roster pressure and site activity." },
  { step: "6", label: "Chat", href: "/chat", detail: "Keep the management communication trail clear and healthy." }
];

export const integrationReadiness = [
  { system: "Thor Portal", purpose: "Jobsheets, approvals, odometer readings, hour readings, admin flow and invoicing readiness", status: "Webhook pending", severity: "amber" as Status },
  { system: "Fleetio", purpose: "Assets, GPS, service schedule, wash records and Woolworths wash data", status: "API pending", severity: "amber" as Status },
  { system: "Unity", purpose: "Operational data feed to be defined and mapped", status: "Mapping pending", severity: "blue" as Status },
  { system: "Outlook", purpose: "Calendar reminders, manager follow-ups and escalation dates", status: "Connection pending", severity: "blue" as Status }
];

export const regions = [
  { name: "Brisbane", readiness: 91, portal: 7, wash: 82, risks: 2, note: "High Woolworths volume. Two job sheets need correction before invoicing." },
  { name: "Sydney", readiness: 84, portal: 4, wash: 76, risks: 3, note: "Induction follow-up due for Primary Connect night crew." },
  { name: "Melbourne", readiness: 88, portal: 5, wash: 79, risks: 1, note: "Wash bay output steady. One Fleetio asset service due this week." },
  { name: "Adelaide", readiness: 78, portal: 2, wash: 62, risks: 2, note: "Roster coverage tight for Friday PM shift." },
  { name: "Perth", readiness: 86, portal: 3, wash: 71, risks: 1, note: "Mobile unit online. Confirm chemical stock by Wednesday." },
  { name: "Canberra", readiness: 73, portal: 1, wash: 58, risks: 2, note: "Low activity day. Keep GPS and Fleetio checks current." },
  { name: "Workshop", readiness: 82, portal: 3, wash: 68, risks: 2, note: "Workshop jobs are moving. Watch parts, defects, and return-to-service timing." }
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

export const assets = [
  { name: "Wash Plant BNE-01", region: "Brisbane", state: "Online", gps: "Larapinta", service: "18 days", status: "green" as Status },
  { name: "Mobile Wash SYD-04", region: "Sydney", state: "Online", gps: "Minchinbury", service: "6 days", status: "amber" as Status },
  { name: "Wash Plant MEL-02", region: "Melbourne", state: "Online", gps: "Truganina", service: "22 days", status: "green" as Status },
  { name: "Mobile Wash ADL-01", region: "Adelaide", state: "Attention", gps: "Gepps Cross", service: "2 days", status: "red" as Status },
  { name: "Workshop Service Bay", region: "Workshop", state: "Online", gps: "Workshop", service: "Current", status: "green" as Status }
];

export const compliance = [
  { title: "Primary Connect site inductions", region: "Brisbane", owner: "Regional manager", due: "30 Apr", status: "Due soon", type: "Induction", severity: "amber" as Status },
  { title: "3-point contact refresher", region: "Sydney", owner: "Regional manager", due: "Today", status: "Action required", type: "Safety", severity: "red" as Status },
  { title: "SDS and chemical register review", region: "Melbourne", owner: "Regional manager", due: "18 May", status: "Current", type: "Document", severity: "green" as Status },
  { title: "First aid kit audit", region: "Adelaide", owner: "Regional manager", due: "Yesterday", status: "Overdue", type: "Equipment", severity: "red" as Status },
  { title: "Workshop isolation and defect-tag process", region: "Workshop", owner: "Workshop lead", due: "3 May", status: "Due soon", type: "Safety", severity: "amber" as Status }
];

export const stockOrders = [
  { item: "Heavy duty wash chemical", region: "Brisbane", site: "Primary Connect Larapinta", category: "Chemicals", quantity: 4, urgency: "Soon", status: "Open" },
  { item: "Gloves and safety glasses", region: "Sydney", site: "Minchinbury", category: "PPE", quantity: 12, urgency: "Normal", status: "Open" },
  { item: "Spray lance trigger", region: "Adelaide", site: "Gepps Cross", category: "Equipment", quantity: 2, urgency: "Urgent", status: "Open" }
];

export const adminUsers = [
  { name: "Admin User", id: "TOC-ADMIN", role: "Admin", regions: "National", permissions: "All controls" },
  { name: "National Ops User", id: "TOC-NATOPS", role: "National Ops", regions: "National", permissions: "Approvals, action centre, stock, compliance, chat" },
  { name: "Director User", id: "TOC-DIRECTOR", role: "Director", regions: "National", permissions: "Owner region health only" },
  { name: "Workshop User", id: "TOC-WORKSHOP", role: "Workshop", regions: "Workshop", permissions: "Workshop action centre, stock, compliance, chat" }
];
