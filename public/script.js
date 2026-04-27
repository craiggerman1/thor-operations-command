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
  }
];

let approvals = [
  { id: 1014, region: "Brisbane", site: "Primary Connect Larapinta", count: 38, age: "2h 10m", risk: "Data check", done: false },
  { id: 1015, region: "Sydney", site: "Woolworths Minchinbury", count: 26, age: "3h 45m", risk: "Photo missing", done: false },
  { id: 1016, region: "Melbourne", site: "Woolworths Melbourne DC", count: 31, age: "1h 35m", risk: "Ready", done: false },
  { id: 1017, region: "Adelaide", site: "Primary Connect Adelaide", count: 14, age: "4h 05m", risk: "Wash type query", done: false },
  { id: 1018, region: "Brisbane", site: "StarTrack Brisbane", count: 19, age: "55m", risk: "Ready", done: false }
];

const assets = [
  { name: "Wash Plant BNE-01", region: "Brisbane", state: "Online", gps: "Larapinta", service: "18 days", status: "green" },
  { name: "Mobile Wash SYD-04", region: "Sydney", state: "Online", gps: "Minchinbury", service: "6 days", status: "amber" },
  { name: "Wash Plant MEL-02", region: "Melbourne", state: "Online", gps: "Truganina", service: "22 days", status: "green" },
  { name: "Mobile Wash ADL-01", region: "Adelaide", state: "Attention", gps: "Gepps Cross", service: "2 days", status: "red" },
  { name: "Mobile Wash PER-03", region: "Perth", state: "Online", gps: "Kewdale", service: "13 days", status: "green" },
  { name: "Mobile Wash CBR-01", region: "Canberra", state: "Standby", gps: "Hume", service: "9 days", status: "amber" }
];

const washes = [
  { site: "Primary Connect Larapinta", region: "Brisbane", target: 90, actual: 82, internal: 21, exceptions: 3 },
  { site: "Woolworths Minchinbury", region: "Sydney", target: 82, actual: 76, internal: 16, exceptions: 4 },
  { site: "Woolworths Melbourne DC", region: "Melbourne", target: 84, actual: 79, internal: 19, exceptions: 1 },
  { site: "Primary Connect Adelaide", region: "Adelaide", target: 70, actual: 62, internal: 8, exceptions: 3 },
  { site: "Primary Connect Perth", region: "Perth", target: 78, actual: 71, internal: 13, exceptions: 2 }
];

const complianceItems = [
  { region: "Brisbane", type: "Induction", title: "Primary Connect site inductions", status: "Due soon", owner: "BNE manager", due: "30 Apr", severity: "amber" },
  { region: "Sydney", type: "Safety", title: "3-point contact refresher", status: "Action required", owner: "SYD manager", due: "Today", severity: "red" },
  { region: "Melbourne", type: "Document", title: "SDS and chemical register review", status: "Current", owner: "MEL manager", due: "18 May", severity: "green" },
  { region: "Adelaide", type: "Equipment", title: "First aid kit audit", status: "Overdue", owner: "ADL manager", due: "Yesterday", severity: "red" },
  { region: "Perth", type: "Site pack", title: "Woolworths compliance pack evidence", status: "Due soon", owner: "PER manager", due: "2 May", severity: "amber" },
  { region: "Canberra", type: "Training", title: "EWAF and Lite LOTO refresh", status: "Current", owner: "CBR manager", due: "15 May", severity: "green" }
];

let localTasks = [
  { id: "l1", region: "Brisbane", title: "Correct Fleetio wash type mismatch", owner: "Regional manager", priority: "High", done: false },
  { id: "l2", region: "Sydney", title: "Confirm night crew site sign-out discipline", owner: "Sydney manager", priority: "High", done: false },
  { id: "l3", region: "Adelaide", title: "Fill Friday PM roster gap", owner: "Adelaide manager", priority: "Medium", done: false },
  { id: "l4", region: "Perth", title: "Confirm chemical stock and backup lance", owner: "Perth manager", priority: "Medium", done: false }
];

let nationalTasks = [
  { id: "n1", region: "National", title: "Woolworths Fleetio accuracy check", owner: "Craig / Simon", priority: "High", done: false },
  { id: "n2", region: "National", title: "Review all manager approvals before invoicing", owner: "National ops", priority: "High", done: false },
  { id: "n3", region: "National", title: "Primary Connect compliance pack refresh", owner: "National ops", priority: "Medium", done: false }
];

const regionFilter = document.querySelector("#regionFilter");
const refreshButton = document.querySelector("#refreshButton");
const approvalQueue = document.querySelector("#approvalQueue");
const assetList = document.querySelector("#assetList");
const washTable = document.querySelector("#washTable");
const complianceSummary = document.querySelector("#complianceSummary");
const complianceMetrics = document.querySelector("#complianceMetrics");
const complianceList = document.querySelector("#complianceList");
const opsMap = document.querySelector("#opsMap");
const briefStack = document.querySelector("#briefStack");
const localTasksNode = document.querySelector("#localTasks");
const nationalTasksNode = document.querySelector("#nationalTasks");
const todoForm = document.querySelector("#todoForm");
const todoInput = document.querySelector("#todoInput");
const todoList = document.querySelector("#todoList");

function selectedRegion() {
  return regionFilter.value;
}

function isVisible(item) {
  return selectedRegion() === "national" || item.region === selectedRegion();
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
      <article class="state-node">
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
      </article>
    `)
    .join("");
}

function renderBrief() {
  const visibleRegions = selectedRegion() === "national"
    ? regions
    : regions.filter((region) => region.name === selectedRegion());

  const briefItems = [
    `${visibleRegions.reduce((sum, region) => sum + region.portal, 0)} Portal approval items are open.`,
    `${assets.filter((asset) => isVisible(asset) && asset.status !== "green").length} Fleetio assets need attention or watching.`,
    `${washes.filter((wash) => isVisible(wash) && wash.actual < wash.target).length} Woolworths sites are under target today.`,
    `${localTasks.filter((task) => isVisible(task) && !task.done).length} local manager actions remain open.`
  ];

  briefStack.innerHTML = briefItems
    .map((item, index) => `
      <div class="brief-item">
        <span class="brief-dot" style="background: ${["#2467a6", "#c98716", "#1f8f5f", "#bf3e39"][index]}"></span>
        <div><strong>${item}</strong><small>Live once Portal and Fleetio feeds are connected.</small></div>
      </div>
    `)
    .join("");
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

function getTodos() {
  return JSON.parse(localStorage.getItem("toc.todos") || "[]");
}

function setTodos(todos) {
  localStorage.setItem("toc.todos", JSON.stringify(todos));
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

function renderAll() {
  renderMetrics();
  renderMap();
  renderBrief();
  renderApprovals();
  renderAssets();
  renderWashes();
  renderCompliance();
  renderTasks();
  renderTodos();
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

regionFilter.addEventListener("change", renderAll);

refreshButton.addEventListener("click", () => {
  document.querySelector("#lastUpdated").textContent = `Updated ${new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`;
  document.querySelector("#syncState").textContent = "Feed refreshed";
  renderAll();
});

renderAll();
