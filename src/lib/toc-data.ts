export type Status = "green" | "amber" | "red" | "blue";

export const metrics = [
  { label: "Operating week", value: "C Week", detail: "Thursday to Wednesday", status: "green" as Status },
  { label: "Portal approvals", value: "25", detail: "Waiting on manager action", status: "amber" as Status },
  { label: "Assets online", value: "5/8", detail: "Fleetio and GPS ready", status: "blue" as Status },
  { label: "Risk flags", value: "13", detail: "Compliance, staffing, data", status: "red" as Status }
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
