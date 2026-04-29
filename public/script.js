const regions = [
  {
    name: "Brisbane",
    readiness: 91,
    portal: 7,
    wash: 82,
    risks: 2,
    note: "High Woolworths volume. Two job sheets need correction before invoicing."
  },
  {
    name: "Sydney",
    readiness: 84,
    portal: 4,
    wash: 76,
    risks: 3,
    note: "Induction follow-up due for Primary Connect night crew."
  },
  {
    name: "Melbourne",
    readiness: 88,
    portal: 5,
    wash: 79,
    risks: 1,
    note: "Wash bay output steady. One Fleetio asset service due this week."
  },
  {
    name: "Adelaide",
    readiness: 78,
    portal: 2,
    wash: 62,
    risks: 2,
    note: "Roster coverage tight for Friday PM shift."
  },
  {
    name: "Perth",
    readiness: 86,
    portal: 3,
    wash: 71,
    risks: 1,
    note: "Mobile unit online. Confirm chemical stock by Wednesday."
  },
  {
    name: "Canberra",
    readiness: 73,
    portal: 1,
    wash: 58,
    risks: 2,
    note: "Low activity day. Keep GPS and Fleetio checks current."
  },
  {
    name: "Workshop",
    readiness: 82,
    portal: 3,
    wash: 68,
    risks: 2,
    note: "Workshop jobs are moving. Watch parts, defects, and return-to-service timing."
  }
];

let approvals = [
  { id: 1014, region: "Brisbane", site: "Primary Connect Larapinta", count: 38, age: "2h 10m", risk: "Data check", done: false },
  { id: 1015, region: "Sydney", site: "Woolworths Minchinbury", count: 26, age: "3h 45m", risk: "Photo missing", done: false },
  { id: 1016, region: "Melbourne", site: "Woolworths Melbourne DC", count: 31, age: "1h 35m", risk: "Ready", done: false },
  { id: 1017, region: "Adelaide", site: "Primary Connect Adelaide", count: 14, age: "4h 05m", risk: "Wash type query", done: false },
  { id: 1018, region: "Brisbane", site: "StarTrack Brisbane", count: 19, age: "55m", risk: "Ready", done: false },
  { id: 1019, region: "Workshop", site: "Workshop service bay", count: 6, age: "1h 20m", risk: "Parts check", done: false }
];

const assets = [
  { name: "Wash Plant BNE-01", region: "Brisbane", state: "Online", gps: "Larapinta", service: "18 days", status: "green" },
  { name: "Mobile Wash SYD-04", region: "Sydney", state: "Online", gps: "Minchinbury", service: "6 days", status: "amber" },
  { name: "Wash Plant MEL-02", region: "Melbourne", state: "Online", gps: "Truganina", service: "22 days", status: "green" },
  { name: "Mobile Wash ADL-01", region: "Adelaide", state: "Attention", gps: "Gepps Cross", service: "2 days", status: "red" },
  { name: "Mobile Wash PER-03", region: "Perth", state: "Online", gps: "Kewdale", service: "13 days", status: "green" },
  { name: "Mobile Wash CBR-01", region: "Canberra", state: "Standby", gps: "Hume", service: "9 days", status: "amber" },
  { name: "Workshop Service Bay", region: "Workshop", state: "Online", gps: "Workshop", service: "Current", status: "green" },
  { name: "Workshop Parts Ute", region: "Workshop", state: "Attention", gps: "Workshop", service: "3 days", status: "amber" }
];

const washes = [
  { site: "Primary Connect Larapinta", region: "Brisbane", target: 90, actual: 82, internal: 21, exceptions: 3 },
  { site: "Woolworths Minchinbury", region: "Sydney", target: 82, actual: 76, internal: 16, exceptions: 4 },
  { site: "Woolworths Melbourne DC", region: "Melbourne", target: 84, actual: 79, internal: 19, exceptions: 1 },
  { site: "Primary Connect Adelaide", region: "Adelaide", target: 70, actual: 62, internal: 8, exceptions: 3 },
  { site: "Primary Connect Perth", region: "Perth", target: 78, actual: 71, internal: 13, exceptions: 2 },
  { site: "Workshop service jobs", region: "Workshop", target: 18, actual: 15, internal: 7, exceptions: 2 }
];

const serviceSchedule = [
  { asset: "Mobile Wash ADL-01", region: "Adelaide", due: "2 days", item: "Pump service and lance inspection", status: "Due soon", severity: "red" },
  { asset: "Mobile Wash SYD-04", region: "Sydney", due: "6 days", item: "Pressure hose inspection", status: "Watch", severity: "amber" },
  { asset: "Workshop Parts Ute", region: "Workshop", due: "3 days", item: "Defect check and parts audit", status: "Due soon", severity: "amber" },
  { asset: "Wash Plant BNE-01", region: "Brisbane", due: "18 days", item: "Preventative service", status: "Scheduled", severity: "green" },
  { asset: "Wash Plant MEL-02", region: "Melbourne", due: "22 days", item: "Preventative service", status: "Scheduled", severity: "green" }
];

const outlookReminders = [
  { region: "National", time: "Today 3:00 pm", title: "Review Portal approvals before admin close", source: "Outlook planned", severity: "amber" },
  { region: "Brisbane", time: "Tomorrow 7:30 am", title: "Larapinta supervisor check-in", source: "Calendar planned", severity: "green" },
  { region: "Sydney", time: "Tomorrow 1:00 pm", title: "Night crew induction follow-up", source: "Calendar planned", severity: "red" },
  { region: "Workshop", time: "Friday 10:00 am", title: "Workshop parts and service review", source: "Calendar planned", severity: "amber" }
];

const rosterWindows = [
  { region: "Brisbane", shift: "Tonight", coverage: "Covered", staff: "6/6", gap: "No roster gap", severity: "green" },
  { region: "Sydney", shift: "Tonight", coverage: "Watch", staff: "5/6", gap: "One backup staff member preferred", severity: "amber" },
  { region: "Adelaide", shift: "Tomorrow PM", coverage: "Gap", staff: "3/4", gap: "Confirm one wash hand", severity: "red" },
  { region: "Perth", shift: "Tomorrow AM", coverage: "Covered", staff: "4/4", gap: "Roster ready", severity: "green" },
  { region: "Workshop", shift: "Tomorrow", coverage: "Watch", staff: "2/3", gap: "Jason to confirm support if defects spike", severity: "amber" }
];

const staffAvailability = [
  { region: "Brisbane", window: "6pm-12am", available: 4, unavailable: 1, status: "Healthy", severity: "green" },
  { region: "Sydney", window: "12am-6am", available: 2, unavailable: 2, status: "Thin", severity: "amber" },
  { region: "Adelaide", window: "6pm-12am", available: 1, unavailable: 3, status: "Action", severity: "red" },
  { region: "Perth", window: "6am-12pm", available: 3, unavailable: 1, status: "Healthy", severity: "green" },
  { region: "Workshop", window: "6am-12pm", available: 2, unavailable: 1, status: "Watch", severity: "amber" }
];

const washRolloverCounters = [
  { region: "Brisbane", site: "Primary Connect Larapinta", yesterday: 86, today: 82, rollover: 4, trend: "On track", severity: "green" },
  { region: "Sydney", site: "Woolworths Minchinbury", yesterday: 79, today: 76, rollover: 6, trend: "Watch", severity: "amber" },
  { region: "Melbourne", site: "Woolworths Melbourne DC", yesterday: 81, today: 79, rollover: 2, trend: "On track", severity: "green" },
  { region: "Adelaide", site: "Primary Connect Adelaide", yesterday: 66, today: 62, rollover: 8, trend: "Action", severity: "red" },
  { region: "Perth", site: "Primary Connect Perth", yesterday: 73, today: 71, rollover: 5, trend: "Watch", severity: "amber" }
];

const complianceItems = [
  { region: "Brisbane", type: "Induction", title: "Primary Connect site inductions", status: "Due soon", owner: "BNE manager", due: "30 Apr", severity: "amber" },
  { region: "Sydney", type: "Safety", title: "3-point contact refresher", status: "Action required", owner: "SYD manager", due: "Today", severity: "red" },
  { region: "Melbourne", type: "Document", title: "SDS and chemical register review", status: "Current", owner: "MEL manager", due: "18 May", severity: "green" },
  { region: "Adelaide", type: "Equipment", title: "First aid kit audit", status: "Overdue", owner: "ADL manager", due: "Yesterday", severity: "red" },
  { region: "Perth", type: "Site pack", title: "Woolworths compliance pack evidence", status: "Due soon", owner: "PER manager", due: "2 May", severity: "amber" },
  { region: "Canberra", type: "Training", title: "EWAF and Lite LOTO refresh", status: "Current", owner: "CBR manager", due: "15 May", severity: "green" },
  { region: "Workshop", type: "Safety", title: "Workshop isolation and defect-tag process", status: "Due soon", owner: "Workshop lead", due: "3 May", severity: "amber" }
];

const starterStockOrders = [
  { id: "stock-1", region: "Brisbane", site: "Primary Connect Larapinta", category: "Chemicals", item: "Heavy duty wash chemical", quantity: 4, urgency: "Soon", notes: "Keep buffer for Woolworths night shift.", status: "Open", created: "Today" },
  { id: "stock-2", region: "Sydney", site: "Minchinbury", category: "PPE", item: "Gloves and safety glasses", quantity: 12, urgency: "Normal", notes: "Top up site cabinet.", status: "Open", created: "Today" },
  { id: "stock-3", region: "Adelaide", site: "Gepps Cross", category: "Equipment", item: "Spray lance trigger", quantity: 2, urgency: "Urgent", notes: "Backup unit needed before Friday PM.", status: "Open", created: "Today" },
  { id: "stock-4", region: "Workshop", site: "Workshop", category: "Parts", item: "Pressure hose fittings", quantity: 10, urgency: "Soon", notes: "Common repairs shelf top-up.", status: "Open", created: "Today" }
];

let localTasks = [
  { id: "l1", region: "Brisbane", title: "Correct Fleetio wash type mismatch", owner: "Regional manager", priority: "High", done: false },
  { id: "l2", region: "Sydney", title: "Confirm night crew site sign-out discipline", owner: "Sydney manager", priority: "High", done: false },
  { id: "l3", region: "Adelaide", title: "Fill Friday PM roster gap", owner: "Adelaide manager", priority: "Medium", done: false },
  { id: "l4", region: "Perth", title: "Confirm chemical stock and backup lance", owner: "Perth manager", priority: "Medium", done: false },
  { id: "l5", region: "Workshop", title: "Confirm parts shelf minimum stock levels", owner: "Workshop lead", priority: "Medium", done: false }
];

let nationalTasks = [
  { id: "n1", region: "National", title: "Woolworths Fleetio accuracy check", owner: "National admin", priority: "High", done: false },
  { id: "n2", region: "National", title: "Review all manager approvals before invoicing", owner: "National ops", priority: "High", done: false },
  { id: "n3", region: "National", title: "Primary Connect compliance pack refresh", owner: "National ops", priority: "Medium", done: false }
];

const chatChannels = [
  { id: "national", label: "National Ops", scope: "national", access: ["manager", "workshop", "national", "director", "admin"] },
  { id: "managers", label: "Managers", scope: "national", access: ["manager", "workshop", "national", "admin"] },
  { id: "workshop", label: "Workshop", region: "Workshop", access: ["workshop", "national", "admin"] },
  { id: "compliance", label: "Compliance", scope: "national", access: ["manager", "workshop", "national", "admin"] },
  { id: "stock", label: "Stock Orders", scope: "national", access: ["manager", "workshop", "national", "admin"] },
  { id: "brisbane", label: "Brisbane", region: "Brisbane", access: ["manager", "national", "admin"] },
  { id: "sydney", label: "Sydney", region: "Sydney", access: ["manager", "national", "admin"] },
  { id: "melbourne", label: "Melbourne", region: "Melbourne", access: ["manager", "national", "admin"] },
  { id: "adelaide", label: "Adelaide", region: "Adelaide", access: ["manager", "national", "admin"] },
  { id: "perth", label: "Perth", region: "Perth", access: ["manager", "national", "admin"] },
  { id: "canberra", label: "Canberra", region: "Canberra", access: ["manager", "national", "admin"] }
];

const starterChatMessages = [
  { id: "chat-1", channel: "national", author: "Admin User", role: "National Ops", text: "Morning team. Keep Portal approvals tight today and flag anything that will hold invoicing.", time: "08:05" },
  { id: "chat-2", channel: "national", author: "National Ops", role: "National Ops", text: "Please keep Woolworths Fleetio entries clean. Registration, wash type and site all matter.", time: "08:18" },
  { id: "chat-3", channel: "managers", author: "Melbourne Manager", role: "Manager", text: "Melbourne wash bay is steady. One asset service item is being watched.", time: "08:34" },
  { id: "chat-4", channel: "workshop", author: "Workshop Lead", role: "Workshop", text: "Workshop parts shelf needs hose fittings and two backup triggers checked.", time: "08:42" },
  { id: "chat-5", channel: "compliance", author: "Sydney Manager", role: "Manager", text: "Following up the 3-point contact refresher with night crew before shift start.", time: "09:03" },
  { id: "chat-6", channel: "stock", author: "Adelaide Manager", role: "Manager", text: "Spray lance trigger is urgent for Gepps Cross. Stock order has been raised.", time: "09:16" },
  { id: "chat-7", channel: "brisbane", author: "Brisbane Manager", role: "Manager", text: "Larapinta volume is high but covered. Two job sheets need data correction.", time: "09:20" }
];

let activeChatChannel = "national";

const starterAdminUsers = [
  {
    id: "admin-primary",
    name: "Admin User",
    email: "admin-user",
    role: "Admin",
    regions: ["National", "Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"],
    permissions: ["Approvals", "Action Centre", "Stock", "Compliance", "Chat", "Admin"]
  },
  {
    id: "admin-national",
    name: "National Ops User",
    email: "national-ops-user",
    role: "National Ops",
    regions: ["National", "Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"],
    permissions: ["Approvals", "Action Centre", "Stock", "Compliance", "Chat"]
  },
  {
    id: "admin-director",
    name: "Director User",
    email: "director-user",
    role: "Director",
    regions: ["National"],
    permissions: ["Region Health", "Director"]
  },
  {
    id: "admin-workshop",
    name: "Workshop User",
    email: "workshop-user",
    role: "Workshop",
    regions: ["Workshop"],
    permissions: ["Action Centre", "Stock", "Compliance", "Chat"]
  }
];

const regionFilter = document.querySelector("#regionFilter");
const accessLevel = document.querySelector("#accessLevel");
const refreshButton = document.querySelector("#refreshButton");
const approvalQueue = document.querySelector("#approvalQueue");
const assetList = document.querySelector("#assetList");
const washTable = document.querySelector("#washTable");
const serviceScheduleNode = document.querySelector("#serviceSchedule");
const outlookReminderList = document.querySelector("#outlookReminderList");
const rosterTracker = document.querySelector("#rosterTracker");
const availabilityTracker = document.querySelector("#availabilityTracker");
const washRolloverCounter = document.querySelector("#washRolloverCounter");
const complianceSummary = document.querySelector("#complianceSummary");
const complianceMetrics = document.querySelector("#complianceMetrics");
const complianceList = document.querySelector("#complianceList");
const stockSummary = document.querySelector("#stockSummary");
const stockOrderForm = document.querySelector("#stockOrderForm");
const stockRegion = document.querySelector("#stockRegion");
const stockSite = document.querySelector("#stockSite");
const stockCategory = document.querySelector("#stockCategory");
const stockItem = document.querySelector("#stockItem");
const stockQuantity = document.querySelector("#stockQuantity");
const stockUrgency = document.querySelector("#stockUrgency");
const stockNotes = document.querySelector("#stockNotes");
const stockList = document.querySelector("#stockList");
const clearCompletedStock = document.querySelector("#clearCompletedStock");
const directorSummary = document.querySelector("#directorSummary");
const directorHealthScore = document.querySelector("#directorHealthScore");
const directorHealthText = document.querySelector("#directorHealthText");
const directorSignals = document.querySelector("#directorSignals");
const directorBrief = document.querySelector("#directorBrief");
const opsMap = document.querySelector("#opsMap");
const briefStack = document.querySelector("#briefStack");
const localTasksNode = document.querySelector("#localTasks");
const nationalTasksNode = document.querySelector("#nationalTasks");
const todoForm = document.querySelector("#todoForm");
const todoInput = document.querySelector("#todoInput");
const todoList = document.querySelector("#todoList");
const chatSummary = document.querySelector("#chatSummary");
const chatChannelsNode = document.querySelector("#chatChannels");
const chatAccessLabel = document.querySelector("#chatAccessLabel");
const chatChannelTitle = document.querySelector("#chatChannelTitle");
const chatMessages = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const navLinks = document.querySelectorAll(".rail-nav a");
const pageSections = document.querySelectorAll(".page-section");
const pageHeading = document.querySelector("#pageHeading");
const sessionChip = document.querySelector("#sessionChip strong");
const loginScreen = document.querySelector("#loginScreen");
const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const developerSignin = document.querySelector("#developerSignin");
const logoutButton = document.querySelector("#logoutButton");
const mobileMenuButton = document.querySelector("#mobileMenuButton");
const mobileNavClose = document.querySelector("#mobileNavClose");
const mobileNavBackdrop = document.querySelector("#mobileNavBackdrop");
const adminSummary = document.querySelector("#adminSummary");
const adminUserForm = document.querySelector("#adminUserForm");
const adminUserName = document.querySelector("#adminUserName");
const adminUserEmail = document.querySelector("#adminUserEmail");
const adminUserRole = document.querySelector("#adminUserRole");
const adminUserList = document.querySelector("#adminUserList");
const resetAdminUsers = document.querySelector("#resetAdminUsers");

const pageCopy = {
  home: {
    title: "Home",
    detail: ""
  },
  overview: {
    title: "Region Health",
    detail: "Ensure your region health is at 100%."
  },
  actions: {
    title: "Action Centre",
    detail: "Ensure all items are actioned and then cleared."
  },
  operations: {
    title: "Operations",
    detail: "Check operations and take action."
  },
  director: {
    title: "Director",
    detail: "High-level owner view of business health, efficiency, compliance and productivity."
  },
  admin: {
    title: "Admin",
    detail: "User access, role permissions, region visibility and admin setup controls."
  },
  portal: {
    title: "Portal",
    detail: "Thor Portal approval items needing manager review."
  },
  fleet: {
    title: "Fleetio",
    detail: "Wash plants, vehicles, GPS status and assets needing awareness."
  },
  compliance: {
    title: "Compliance",
    detail: "Ensure compliance items are completed and green."
  },
  stock: {
    title: "Stock Orders",
    detail: "Order stock early and ensure up to date."
  },
  chat: {
    title: "Chat",
    detail: "Ensure healthy communication between management."
  },
  todo: {
    title: "To Do",
    detail: "Personal manager notes and quick tasks captured during the day."
  }
};

function selectedRegion() {
  return regionFilter.value;
}

function selectedAccess() {
  return accessLevel.value;
}

function isVisible(item) {
  return selectedRegion() === "national" || item.region === selectedRegion();
}

function accessLabel() {
  const labels = {
    admin: "Admin",
    manager: "Manager",
    workshop: "Workshop",
    national: "National Ops",
    director: "Director"
  };
  return labels[selectedAccess()] || "Manager";
}

function activeUserName() {
  if (selectedAccess() === "admin") return "Admin User";
  if (selectedAccess() === "national") return "National Ops";
  if (selectedAccess() === "director") return "Director User";
  if (selectedAccess() === "workshop") return "Workshop Lead";
  return selectedRegion() === "national" ? "Regional Manager" : `${selectedRegion()} Manager`;
}

function setSession(session) {
  localStorage.setItem("toc.session", JSON.stringify(session));
}

function getSession() {
  return JSON.parse(localStorage.getItem("toc.session") || "null");
}

function applySession(session) {
  accessLevel.value = session.access || "manager";
  regionFilter.value = session.region || "national";
  sessionChip.textContent = accessLabel();
  document.body.classList.add("is-authenticated");

  if (!window.location.hash) {
    window.location.hash = "home";
  }

  if (session.access === "workshop") {
    activeChatChannel = "workshop";
  }
}

function initializeSession() {
  const session = getSession();

  if (session) {
    if (session.developer || session.access === "admin") {
      session.access = "admin";
      session.region = "national";
      setSession(session);
    }
    applySession(session);
    renderAll();
    return;
  }

  document.body.classList.remove("is-authenticated");
}

function getVisibleChatChannels() {
  return chatChannels.filter((channel) => {
    if (!channel.access.includes(selectedAccess())) return false;
    if (selectedAccess() === "admin" || selectedAccess() === "national" || selectedAccess() === "director") return true;
    if (selectedAccess() === "workshop") return !channel.region || channel.region === "Workshop";
    return !channel.region || selectedRegion() === "national" || channel.region === selectedRegion();
  });
}

function updateActiveNav() {
  const currentPage = normalizePage((window.location.hash || "#home").replace("#", ""));
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${currentPage}`);
  });
  updatePage(currentPage);
}

function normalizePage(page) {
  const aliases = {
    performance: "operations",
    tasks: "actions",
    "national-actions": "actions",
    support: "stock"
  };
  return aliases[page] || page || "home";
}

function updatePage(page) {
  const requestedPage = normalizePage(page);
  const hasPage = Boolean(pageCopy[requestedPage]) || Array.from(pageSections).some((section) => section.dataset.page?.split(" ").includes(requestedPage));
  const activePage = hasPage ? requestedPage : "home";

  pageSections.forEach((section) => {
    const pages = section.dataset.page ? section.dataset.page.split(" ") : [];
    section.hidden = !pages.includes(activePage);
  });

  const copy = pageCopy[activePage] || pageCopy.home;
  pageHeading.querySelector("h2").textContent = copy.title;
  const pageDetail = pageHeading.querySelector("p");
  pageDetail.textContent = copy.detail;
  pageDetail.hidden = !copy.detail;

  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${activePage}`);
  });
}

function openMobileNav() {
  document.body.classList.add("nav-open");
  mobileMenuButton.setAttribute("aria-expanded", "true");
}

function closeMobileNav() {
  document.body.classList.remove("nav-open");
  mobileMenuButton.setAttribute("aria-expanded", "false");
}

function calculateThorWeek(date = new Date()) {
  const anchor = new Date("2026-04-30T00:00:00+10:00");
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((startOfDay(date) - startOfDay(anchor)) / dayMs);
  const weekOffset = Math.floor(diffDays / 7);
  const cycle = ["C", "D", "A", "B"];
  const index = ((weekOffset % 4) + 4) % 4;
  const weekStart = new Date(anchor);
  weekStart.setDate(anchor.getDate() + weekOffset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return { week: `${cycle[index]} Week`, start: weekStart, end: weekEnd };
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatShortDate(date) {
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function renderMetrics() {
  const visibleRegions = selectedRegion() === "national"
    ? regions
    : regions.filter((region) => region.name === selectedRegion());
  const visibleApprovals = approvals.filter((item) => !item.done && isVisible(item));
  const visibleAssets = assets.filter(isVisible);
  const week = calculateThorWeek();

  document.querySelector("#abcdWeek").textContent = week.week;
  document.querySelector("#weekRange").textContent = `${formatShortDate(week.start)} to ${formatShortDate(week.end)}`;
  document.querySelector("#approvalCount").textContent = visibleApprovals.length;
  document.querySelector("#assetCount").textContent = `${visibleAssets.filter((asset) => asset.state === "Online").length}/${visibleAssets.length}`;
  document.querySelector("#riskCount").textContent = visibleRegions.reduce((total, region) => total + region.risks, 0);
}

function renderMap() {
  opsMap.innerHTML = regions
    .filter((region) => selectedRegion() === "national" || region.name === selectedRegion())
    .map((region) => `
      <article class="state-node" data-region-card="${region.name}">
        <div>
          <strong>${region.name}</strong>
          <small>${region.note}</small>
        </div>
        <div class="node-bars" aria-label="${region.name} readiness levels">
          <span style="--value: ${region.readiness}%"></span>
          <span style="--value: ${region.wash}%"></span>
          <span style="--value: ${Math.max(20, 100 - region.risks * 18)}%"></span>
        </div>
        <div class="meta-row">
          <span class="tag green">${region.readiness}% ready</span>
          <span class="tag amber">${region.portal} approvals</span>
          <span class="tag red">${region.risks} risks</span>
        </div>
        <a class="node-action" href="#actions" data-region-link="${region.name}">View action detail</a>
      </article>
    `)
    .join("");
}

function renderBrief() {
  const visibleRegions = selectedRegion() === "national"
    ? regions
    : regions.filter((region) => region.name === selectedRegion());

  const briefItems = [
    {
      text: `${visibleRegions.reduce((sum, region) => sum + region.portal, 0)} jobsheet approval items are open.`,
      detail: "Clear Portal work first so admin and invoicing are not held up.",
      href: "#portal",
      action: "Open jobsheets"
    },
    {
      text: `${localTasks.filter((task) => isVisible(task) && !task.done).length} manager actions need ownership.`,
      detail: "These are the practical items that need a person to move them today.",
      href: "#actions",
      action: "Review actions"
    },
    {
      text: `${washes.filter((wash) => isVisible(wash) && wash.actual < wash.target).length} sites are under wash target today.`,
      detail: "Check output before the gap becomes a client or invoicing issue.",
      href: "#performance",
      action: "Check output"
    },
    {
      text: `${assets.filter((asset) => isVisible(asset) && asset.status !== "green").length} assets need attention or watching.`,
      detail: "Fleetio and GPS awareness keeps operations moving.",
      href: "#fleet",
      action: "View assets"
    }
  ];

  briefStack.innerHTML = briefItems
    .map((item, index) => `
      <div class="brief-item">
        <span class="brief-dot" style="background: ${["#2467a6", "#c98716", "#1f8f5f", "#bf3e39"][index]}"></span>
        <div>
          <strong>${item.text}</strong>
          <small>${item.detail}</small>
          <a class="brief-action" href="${item.href}">${item.action}</a>
        </div>
      </div>
    `)
    .join("");
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function healthState(score) {
  if (score >= 85) return { label: "Green", className: "green", text: "Business is broadly healthy. Keep watching isolated exceptions." };
  if (score >= 65) return { label: "Watch", className: "amber", text: "Business is stable, with a few areas needing management attention." };
  return { label: "Attention", className: "red", text: "Business needs director awareness. Several core health signals are not green." };
}

function renderDirectorSummary() {
  const visibleRegions = selectedRegion() === "national"
    ? regions
    : regions.filter((region) => region.name === selectedRegion());
  const visibleAssets = assets.filter(isVisible);
  const visibleWashes = washes.filter(isVisible);
  const visibleCompliance = complianceItems.filter(isVisible);
  const openApprovals = approvals.filter((item) => !item.done && isVisible(item)).length;
  const openStockOrders = getStockOrders().filter((order) => order.status !== "Ordered" && isVisible(order)).length;

  const operationsScore = Math.round(average(visibleRegions.map((region) => region.readiness)));
  const productivityScore = Math.round(average(visibleWashes.map((wash) => Math.min(100, Math.round((wash.actual / wash.target) * 100)))));
  const complianceScore = visibleCompliance.length
    ? Math.round(average(visibleCompliance.map((item) => {
      if (item.severity === "green") return 100;
      if (item.severity === "amber") return 70;
      return 35;
    })))
    : 100;
  const assetScore = visibleAssets.length
    ? Math.round((visibleAssets.filter((asset) => asset.state === "Online").length / visibleAssets.length) * 100)
    : 100;
  const riskLoad = visibleRegions.reduce((total, region) => total + region.risks, 0);
  const riskScore = Math.max(0, 100 - riskLoad * 8 - openApprovals * 2);
  const totalScore = Math.round(operationsScore * 0.25 + productivityScore * 0.25 + complianceScore * 0.2 + assetScore * 0.15 + riskScore * 0.15);
  const state = healthState(totalScore);

  directorSummary.textContent = `${state.label} - ${totalScore}%`;
  directorSummary.className = `pill director-pill ${state.className}`;
  directorHealthScore.textContent = `${state.label} ${totalScore}%`;
  directorHealthText.textContent = state.text;

  const signals = [
    { label: "Operations", value: operationsScore, note: "Regional readiness", state: operationsScore >= 85 ? "green" : operationsScore >= 72 ? "amber" : "red" },
    { label: "Productivity", value: productivityScore, note: "Wash output vs target", state: productivityScore >= 92 ? "green" : productivityScore >= 82 ? "amber" : "red" },
    { label: "Compliance", value: complianceScore, note: "Current safety position", state: complianceScore >= 80 ? "green" : complianceScore >= 55 ? "amber" : "red" },
    { label: "Asset availability", value: assetScore, note: "Fleetio online assets", state: assetScore >= 85 ? "green" : assetScore >= 70 ? "amber" : "red" }
  ];

  directorSignals.innerHTML = signals.map((signal) => `
    <article class="director-signal ${signal.state}">
      <span>${signal.label}</span>
      <strong>${signal.value}%</strong>
      <small>${signal.note}</small>
    </article>
  `).join("");

  const redSignals = signals.filter((signal) => signal.state === "red").length;
  const amberSignals = signals.filter((signal) => signal.state === "amber").length;
  const brief = [
    redSignals === 0 ? "No major red executive signals in this view." : `${redSignals} executive signal${redSignals === 1 ? "" : "s"} need attention.`,
    `${amberSignals} area${amberSignals === 1 ? "" : "s"} should be watched this week.`,
    `${openApprovals} approvals and ${openStockOrders} stock orders remain open nationally.`,
    riskLoad <= 4 ? "Risk load is contained." : "Risk load is elevated and should stay visible to national operations."
  ];

  directorBrief.innerHTML = brief.map((item) => `
    <div class="director-brief-item">
      <span class="brief-dot"></span>
      <strong>${item}</strong>
    </div>
  `).join("");
}

function renderApprovals() {
  const items = approvals.filter((item) => !item.done && isVisible(item));
  approvalQueue.innerHTML = items.length
    ? items.map((item) => `
      <article class="queue-card">
        <strong>#${item.id} ${item.site}</strong>
        <small>${item.region} - ${item.count} vehicles - waiting ${item.age}</small>
        <div class="meta-row">
          <span class="tag ${item.risk === "Ready" ? "green" : "amber"}">${item.risk}</span>
          <span class="tag blue">Portal</span>
        </div>
        <button type="button" data-approval="${item.id}">Mark reviewed</button>
      </article>
    `).join("")
    : `<div class="brief-item"><span class="brief-dot"></span><div><strong>No open approvals for this view.</strong><small>Clean queue.</small></div></div>`;
}

function renderAssets() {
  assetList.innerHTML = assets.filter(isVisible).map((asset) => `
    <article class="asset-card">
      <strong>${asset.name}</strong>
      <small>${asset.region} - GPS: ${asset.gps} - service due in ${asset.service}</small>
      <div class="meta-row">
        <span class="tag ${asset.status}">${asset.state}</span>
        <span class="tag blue">Fleetio</span>
      </div>
    </article>
  `).join("");
}

function renderWashes() {
  const rows = washes.filter(isVisible);
  washTable.innerHTML = `
    <div class="wash-row header">
      <span>Site</span><span>Target</span><span>Actual</span><span>Internal</span><span>Exceptions</span>
    </div>
    ${rows.map((wash) => `
      <div class="wash-row">
        <strong>${wash.site}</strong>
        <span>${wash.target}</span>
        <span>${wash.actual}</span>
        <span>${wash.internal}</span>
        <span class="${wash.exceptions > 2 ? "tag red" : "tag green"}">${wash.exceptions}</span>
      </div>
    `).join("")}
  `;
}

function renderServiceSchedule() {
  const rows = serviceSchedule.filter(isVisible);
  serviceScheduleNode.innerHTML = rows.length
    ? rows.map((item) => `
      <article class="ops-card">
        <div>
          <strong>${escapeHtml(item.asset)}</strong>
          <small>${escapeHtml(item.region)} - ${escapeHtml(item.item)}</small>
        </div>
        <div class="meta-row">
          <span class="tag ${escapeHtml(item.severity)}">${escapeHtml(item.status)}</span>
          <span class="tag blue">Due ${escapeHtml(item.due)}</span>
        </div>
      </article>
    `).join("")
    : `<div class="brief-item"><span class="brief-dot"></span><div><strong>No service items in this view.</strong><small>Fleetio service schedule feed planned.</small></div></div>`;
}

function renderOutlookReminders() {
  const reminders = outlookReminders.filter((item) => item.region === "National" || isVisible(item));
  outlookReminderList.innerHTML = reminders.length
    ? reminders.map((item) => `
      <article class="ops-card">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.region)} - ${escapeHtml(item.time)}</small>
        </div>
        <div class="meta-row">
          <span class="tag ${escapeHtml(item.severity)}">${escapeHtml(item.source)}</span>
        </div>
      </article>
    `).join("")
    : `<div class="brief-item"><span class="brief-dot"></span><div><strong>No reminders in this view.</strong><small>Outlook calendar connection planned.</small></div></div>`;
}

function renderRosterAndAvailability() {
  const rosterItems = rosterWindows.filter(isVisible);
  const availabilityItems = staffAvailability.filter(isVisible);

  rosterTracker.innerHTML = rosterItems.length
    ? rosterItems.map((item) => `
      <article class="ops-card">
        <div>
          <strong>${escapeHtml(item.region)} - ${escapeHtml(item.shift)}</strong>
          <small>${escapeHtml(item.gap)}</small>
        </div>
        <div class="meta-row">
          <span class="tag ${escapeHtml(item.severity)}">${escapeHtml(item.coverage)}</span>
          <span class="tag blue">${escapeHtml(item.staff)} staff</span>
        </div>
      </article>
    `).join("")
    : `<div class="brief-item"><span class="brief-dot"></span><div><strong>No roster items in this view.</strong><small>Roster feed planned.</small></div></div>`;

  availabilityTracker.innerHTML = availabilityItems.length
    ? availabilityItems.map((item) => `
      <article class="availability-card ${escapeHtml(item.severity)}">
        <span>${escapeHtml(item.region)}</span>
        <strong>${escapeHtml(item.available)} available</strong>
        <small>${escapeHtml(item.window)} - ${escapeHtml(item.unavailable)} unavailable</small>
        <em>${escapeHtml(item.status)}</em>
      </article>
    `).join("")
    : `<div class="brief-item"><span class="brief-dot"></span><div><strong>No availability items in this view.</strong><small>Staff availability feed planned.</small></div></div>`;
}

function renderWashRolloverCounter() {
  const rows = washRolloverCounters.filter(isVisible);
  washRolloverCounter.innerHTML = rows.length
    ? rows.map((item) => `
      <article class="rollover-card ${escapeHtml(item.severity)}">
        <div>
          <strong>${escapeHtml(item.site)}</strong>
          <small>${escapeHtml(item.region)} - yesterday ${escapeHtml(item.yesterday)}, today ${escapeHtml(item.today)}</small>
        </div>
        <div>
          <span>${escapeHtml(item.rollover)}</span>
          <em>${escapeHtml(item.trend)}</em>
        </div>
      </article>
    `).join("")
    : `<div class="brief-item"><span class="brief-dot"></span><div><strong>No wash rollover items in this view.</strong><small>Live wash data feed planned.</small></div></div>`;
}

function renderCompliance() {
  const items = complianceItems.filter(isVisible);
  const current = items.filter((item) => item.severity === "green").length;
  const dueSoon = items.filter((item) => item.severity === "amber").length;
  const urgent = items.filter((item) => item.severity === "red").length;
  const score = items.length ? Math.round((current / items.length) * 100) : 100;

  complianceSummary.textContent = `${urgent} urgent - ${dueSoon} due soon`;
  complianceMetrics.innerHTML = `
    <article class="compliance-stat">
      <span>Readiness</span>
      <strong>${score}%</strong>
      <small>Current compliance items</small>
    </article>
    <article class="compliance-stat">
      <span>Urgent</span>
      <strong>${urgent}</strong>
      <small>Needs manager action</small>
    </article>
    <article class="compliance-stat">
      <span>Due soon</span>
      <strong>${dueSoon}</strong>
      <small>Keep ahead this week</small>
    </article>
  `;

  complianceList.innerHTML = items.map((item) => `
    <article class="compliance-card">
      <div>
        <strong>${item.title}</strong>
        <small>${item.region} - ${item.owner} - due ${item.due}</small>
      </div>
      <div class="meta-row">
        <span class="tag blue">${item.type}</span>
        <span class="tag ${item.severity}">${item.status}</span>
      </div>
    </article>
  `).join("");
}

function getStockOrders() {
  const saved = localStorage.getItem("toc.stockOrders");
  if (saved) {
    return JSON.parse(saved);
  }
  setStockOrders(starterStockOrders);
  return starterStockOrders;
}

function setStockOrders(orders) {
  localStorage.setItem("toc.stockOrders", JSON.stringify(orders));
}

function urgencyClass(urgency) {
  if (urgency === "Urgent") return "red";
  if (urgency === "Soon") return "amber";
  return "green";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderStockOrders() {
  if (selectedRegion() !== "national") {
    stockRegion.value = selectedRegion();
  }

  const orders = getStockOrders();
  const visibleOrders = orders.filter((order) => order.status !== "Ordered" && isVisible(order));
  const nationalOpen = orders.filter((order) => order.status !== "Ordered").length;
  const urgentCount = visibleOrders.filter((order) => order.urgency === "Urgent").length;

  stockSummary.textContent = `${visibleOrders.length} shown - ${nationalOpen} national open`;
  stockList.innerHTML = visibleOrders.length
    ? visibleOrders.map((order) => `
      <article class="stock-card">
        <div>
          <strong>${escapeHtml(order.item)}</strong>
          <small>${escapeHtml(order.region)} - ${escapeHtml(order.site)} - ${escapeHtml(order.created)}</small>
        </div>
        <div class="stock-detail">
          <span>${escapeHtml(order.category)}</span>
          <span>Qty ${escapeHtml(order.quantity)}</span>
          <span>${escapeHtml(order.notes || "No notes")}</span>
        </div>
        <div class="meta-row">
          <span class="tag ${urgencyClass(order.urgency)}">${escapeHtml(order.urgency)}</span>
          <span class="tag blue">${escapeHtml(order.status)}</span>
        </div>
        <button type="button" data-stock-ordered="${escapeHtml(order.id)}">Mark ordered</button>
      </article>
    `).join("")
    : `<div class="brief-item"><span class="brief-dot"></span><div><strong>No stock orders in this view.</strong><small>${urgentCount} urgent items.</small></div></div>`;
}

function renderTasks() {
  localTasksNode.innerHTML = renderTaskCards(localTasks.filter((task) => !task.done && isVisible(task)));
  nationalTasksNode.innerHTML = renderTaskCards(nationalTasks.filter((task) => !task.done));
}

function renderTaskCards(tasks) {
  return tasks.length
    ? tasks.map((task) => `
      <article class="task-card">
        <strong>${task.title}</strong>
        <small>${task.owner} - ${task.region}</small>
        <div class="meta-row">
          <span class="tag ${task.priority === "High" ? "red" : "amber"}">${task.priority}</span>
          <span class="tag blue">Action</span>
        </div>
        <button type="button" data-task="${task.id}">Clear action</button>
      </article>
    `).join("")
    : `<div class="brief-item"><span class="brief-dot"></span><div><strong>No open actions.</strong><small>This lane is clear.</small></div></div>`;
}

function todoStorageKey() {
  const session = getSession();
  const userKey = session?.email || `${selectedAccess()}-${selectedRegion()}`;
  return `toc.todos.${userKey}`;
}

function getTodos() {
  return JSON.parse(localStorage.getItem(todoStorageKey()) || "[]");
}

function setTodos(todos) {
  localStorage.setItem(todoStorageKey(), JSON.stringify(todos));
}

function renderTodos() {
  const todos = getTodos();
  todoList.innerHTML = todos.length
    ? todos.map((todo) => `
      <div class="todo-item ${todo.done ? "done" : ""}">
        <input type="checkbox" ${todo.done ? "checked" : ""} data-todo-toggle="${todo.id}" aria-label="Mark task complete">
        <span>${todo.text}</span>
        <button type="button" data-todo-delete="${todo.id}">Remove</button>
      </div>
    `).join("")
    : `<div class="brief-item"><span class="brief-dot"></span><div><strong>No manager notes yet.</strong><small>Add tasks as they arrive.</small></div></div>`;
}

function getChatMessages() {
  const saved = localStorage.getItem("toc.chatMessages");
  if (saved) {
    const messages = sanitizeChatMessages(JSON.parse(saved));
    setChatMessages(messages);
    return messages;
  }
  const messages = sanitizeChatMessages(starterChatMessages);
  setChatMessages(messages);
  return messages;
}

function setChatMessages(messages) {
  localStorage.setItem("toc.chatMessages", JSON.stringify(messages));
}

function sanitizeChatMessages(messages) {
  const blockedMessages = new Set(["Alice love baby very much :)", "Loves*"]);
  return messages.filter((message) => !blockedMessages.has(message.text));
}

function getAdminUsers() {
  const saved = localStorage.getItem("toc.adminUsers");
  if (saved) {
    const users = sanitizeAdminUsers(JSON.parse(saved));
    setAdminUsers(users);
    return users;
  }
  setAdminUsers(starterAdminUsers);
  return starterAdminUsers;
}

function setAdminUsers(users) {
  localStorage.setItem("toc.adminUsers", JSON.stringify(users));
}

function roleLabel(role) {
  const labels = {
    admin: "Admin",
    manager: "Manager",
    workshop: "Workshop",
    national: "National Ops",
    director: "Director"
  };
  return labels[role] || role;
}

function checkedValues(name) {
  return Array.from(document.querySelectorAll(`[name="${name}"]:checked`)).map((item) => item.value);
}

function publicUserId(user) {
  return `TOC-${String(user.id || crypto.randomUUID()).slice(-6).toUpperCase()}`;
}

function sanitizeAdminUsers(users) {
  return users.map((user) => {
    const hadEmailAddress = String(user.email || "").includes("@");
    const safeEmail = hadEmailAddress ? publicUserId(user) : user.email || publicUserId(user);
    return {
      ...user,
      name: hadEmailAddress ? `${roleLabel(user.role)} User` : user.name || `${roleLabel(user.role)} User`,
      email: safeEmail
    };
  });
}

function renderAdminUsers() {
  const users = getAdminUsers();
  const adminCount = users.filter((user) => user.role === "Admin" || user.role === "admin").length;
  adminSummary.textContent = `${users.length} users - ${adminCount} admin`;
  adminUserList.innerHTML = users.map((user) => `
    <article class="admin-user-card">
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <small>User ID: ${escapeHtml(publicUserId(user))}</small>
      </div>
      <div class="meta-row">
        <span class="tag blue">${escapeHtml(roleLabel(user.role))}</span>
        <span class="tag green">${escapeHtml(user.regions.join(", "))}</span>
      </div>
      <small>Can use: ${escapeHtml(user.permissions.join(", "))}</small>
      ${user.id === "admin-primary" ? "" : `<button type="button" data-admin-remove="${escapeHtml(user.id)}">Remove demo user</button>`}
    </article>
  `).join("");
}

function getActiveChannel() {
  const visibleChannels = getVisibleChatChannels();
  const visibleIds = visibleChannels.map((channel) => channel.id);
  if (!visibleIds.includes(activeChatChannel)) {
    if (selectedAccess() === "workshop" && visibleIds.includes("workshop")) {
      activeChatChannel = "workshop";
    } else if (selectedAccess() === "director" && visibleIds.includes("national")) {
      activeChatChannel = "national";
    } else {
      activeChatChannel = visibleIds[0] || "national";
    }
  }
  return visibleChannels.find((channel) => channel.id === activeChatChannel) || visibleChannels[0];
}

function renderChat() {
  const visibleChannels = getVisibleChatChannels();
  const activeChannel = getActiveChannel();
  const messages = getChatMessages().filter((message) => message.channel === activeChannel.id);
  const unreadCount = getChatMessages().filter((message) => visibleChannels.some((channel) => channel.id === message.channel)).length;

  chatSummary.textContent = `${visibleChannels.length} channels - ${unreadCount} messages`;
  chatChannelsNode.innerHTML = visibleChannels.map((channel) => `
    <button class="${channel.id === activeChannel.id ? "active" : ""}" type="button" data-chat-channel="${channel.id}">
      <strong>${escapeHtml(channel.label)}</strong>
      <span>${getChatMessages().filter((message) => message.channel === channel.id).length}</span>
    </button>
  `).join("");

  chatAccessLabel.textContent = `${accessLabel()} access`;
  chatChannelTitle.textContent = activeChannel.label;
  chatInput.disabled = selectedAccess() === "director";
  chatForm.querySelector("button").disabled = selectedAccess() === "director";
  chatInput.placeholder = selectedAccess() === "director"
    ? "Director view is read-only"
    : `Message ${activeChannel.label}`;

  chatMessages.innerHTML = messages.length
    ? messages.map((message) => `
      <article class="chat-message ${message.author === activeUserName() ? "own" : ""}">
        <div>
          <strong>${escapeHtml(message.author)}</strong>
          <span>${escapeHtml(message.role)} - ${escapeHtml(message.time)}</span>
        </div>
        <p>${escapeHtml(message.text)}</p>
      </article>
    `).join("")
    : `<div class="brief-item"><span class="brief-dot"></span><div><strong>No messages in this channel yet.</strong><small>Start the conversation when needed.</small></div></div>`;

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderAll() {
  document.body.dataset.access = selectedAccess();
  updateActiveNav();
  renderMetrics();
  renderMap();
  renderBrief();
  renderDirectorSummary();
  renderApprovals();
  renderAssets();
  renderWashes();
  renderServiceSchedule();
  renderOutlookReminders();
  renderRosterAndAvailability();
  renderWashRolloverCounter();
  renderCompliance();
  renderStockOrders();
  renderTasks();
  renderTodos();
  renderChat();
  renderAdminUsers();
}

approvalQueue.addEventListener("click", (event) => {
  const button = event.target.closest("[data-approval]");
  if (!button) return;
  const id = Number(button.dataset.approval);
  approvals = approvals.map((item) => item.id === id ? { ...item, done: true } : item);
  renderAll();
});

document.querySelector("#clearApproved").addEventListener("click", () => {
  approvals = approvals.filter((item) => !item.done);
  renderAll();
});

document.addEventListener("click", (event) => {
  const taskButton = event.target.closest("[data-task]");
  if (!taskButton) return;
  const id = taskButton.dataset.task;
  localTasks = localTasks.map((task) => task.id === id ? { ...task, done: true } : task);
  nationalTasks = nationalTasks.map((task) => task.id === id ? { ...task, done: true } : task);
  renderAll();
});

todoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = todoInput.value.trim();
  if (!text) return;
  const todos = getTodos();
  todos.unshift({ id: crypto.randomUUID(), text, done: false });
  setTodos(todos);
  todoInput.value = "";
  renderTodos();
});

todoList.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-todo-toggle]");
  const remove = event.target.closest("[data-todo-delete]");
  const todos = getTodos();

  if (toggle) {
    setTodos(todos.map((todo) => todo.id === toggle.dataset.todoToggle ? { ...todo, done: toggle.checked } : todo));
  }

  if (remove) {
    setTodos(todos.filter((todo) => todo.id !== remove.dataset.todoDelete));
  }

  renderTodos();
});

chatChannelsNode.addEventListener("click", (event) => {
  const button = event.target.closest("[data-chat-channel]");
  if (!button) return;
  activeChatChannel = button.dataset.chatChannel;
  renderChat();
});

opsMap.addEventListener("click", (event) => {
  const regionLink = event.target.closest("[data-region-link]");
  if (!regionLink) return;
  const regionName = regionLink.dataset.regionLink;
  if (regionName && regionFilter.value !== regionName) {
    regionFilter.value = regionName;
    renderAll();
  }
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || selectedAccess() === "director") return;
  const activeChannel = getActiveChannel();
  const messages = getChatMessages();
  messages.push({
    id: crypto.randomUUID(),
    channel: activeChannel.id,
    author: activeUserName(),
    role: accessLabel(),
    text,
    time: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })
  });
  setChatMessages(messages);
  chatInput.value = "";
  renderChat();
});

stockOrderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const orders = getStockOrders();
  orders.unshift({
    id: crypto.randomUUID(),
    region: stockRegion.value,
    site: stockSite.value.trim(),
    category: stockCategory.value,
    item: stockItem.value.trim(),
    quantity: Number(stockQuantity.value),
    urgency: stockUrgency.value,
    notes: stockNotes.value.trim(),
    status: "Open",
    created: new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short" })
  });
  setStockOrders(orders);
  stockOrderForm.reset();
  stockQuantity.value = 1;
  if (selectedRegion() !== "national") {
    stockRegion.value = selectedRegion();
  }
  renderStockOrders();
});

stockList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-stock-ordered]");
  if (!button) return;
  const id = button.dataset.stockOrdered;
  const orders = getStockOrders().map((order) => order.id === id ? { ...order, status: "Ordered" } : order);
  setStockOrders(orders);
  renderStockOrders();
});

clearCompletedStock.addEventListener("click", () => {
  setStockOrders(getStockOrders().filter((order) => order.status !== "Ordered"));
  renderStockOrders();
});

regionFilter.addEventListener("change", renderAll);
window.addEventListener("hashchange", updateActiveNav);
navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
    closeMobileNav();
  });
});

mobileMenuButton.addEventListener("click", openMobileNav);
mobileNavClose.addEventListener("click", closeMobileNav);
mobileNavBackdrop.addEventListener("click", closeMobileNav);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobileNav();
  }
});

accessLevel.addEventListener("change", () => {
  sessionChip.textContent = accessLabel();
  if (selectedAccess() === "admin") {
    regionFilter.value = "national";
    window.location.hash = "home";
    activeChatChannel = "national";
  } else if (selectedAccess() === "director") {
    regionFilter.value = "national";
    window.location.hash = "director";
    activeChatChannel = "national";
  } else if (selectedAccess() === "workshop") {
    regionFilter.value = "Workshop";
    window.location.hash = "home";
    activeChatChannel = "workshop";
  }
  renderAll();
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const session = {
    email: loginEmail.value.trim(),
    access: "admin",
    region: "national",
    signedInAt: new Date().toISOString()
  };

  if (!session.email || !loginPassword.value.trim()) return;

  setSession(session);
  loginPassword.value = "";
  applySession(session);
  renderAll();
});

developerSignin.addEventListener("click", () => {
  const session = {
    email: "developer-user",
    access: "admin",
    region: "national",
    developer: true,
    signedInAt: new Date().toISOString()
  };

  setSession(session);
  loginEmail.value = "";
  loginPassword.value = "";
  applySession(session);
  renderAll();
});

adminUserForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const regions = checkedValues("adminRegions");
  const permissions = checkedValues("adminPermissions");
  const users = getAdminUsers();
  users.unshift({
    id: crypto.randomUUID(),
    name: adminUserName.value.trim(),
    email: "new-demo-user",
    role: roleLabel(adminUserRole.value),
    regions: adminUserRole.value === "director" ? ["National"] : regions.length ? regions : ["National"],
    permissions,
    created: new Date().toISOString()
  });
  setAdminUsers(users);
  adminUserForm.reset();
  renderAdminUsers();
});

adminUserList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-admin-remove]");
  if (!button) return;
  setAdminUsers(getAdminUsers().filter((user) => user.id !== button.dataset.adminRemove));
  renderAdminUsers();
});

resetAdminUsers.addEventListener("click", () => {
  setAdminUsers(starterAdminUsers);
  renderAdminUsers();
});

logoutButton.addEventListener("click", () => {
  localStorage.removeItem("toc.session");
  document.body.classList.remove("is-authenticated");
  closeMobileNav();
  window.location.hash = "";
  loginScreen.scrollIntoView({ block: "start" });
});

refreshButton.addEventListener("click", () => {
  document.querySelector("#lastUpdated").textContent = `Updated ${new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`;
  document.querySelector("#syncState").textContent = "Demo refreshed";
  renderAll();
});

initializeSession();
