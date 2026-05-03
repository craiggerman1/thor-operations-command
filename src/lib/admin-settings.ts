export type AdminPageSetting = {
  page: string;
  slug: string;
  owner: string;
  control: string;
  state: "Active" | "Mapped" | "Ready" | "Next";
};

export const pageSettings: AdminPageSetting[] = [
  { page: "Home", slug: "home", owner: "Command signals and go-live pathway", control: "Set which national signals, roadmap items and Director scorecard items appear on Home.", state: "Mapped" },
  { page: "Admin Settings", slug: "admin-settings", owner: "TOC control room", control: "Register users, assign access levels, assign regions, tune page settings and manage global notices.", state: "Active" },
  { page: "National Requests", slug: "national-requests", owner: "National action queue", control: "Review stock order requests, manager-submitted close-outs and requests that need national follow-up.", state: "Active" },
  { page: "Action Centre", slug: "action-centre", owner: "Action item workflow", control: "Create directives, assign due dates, set priority type and review manager close-out submissions.", state: "Next" },
  { page: "Region Health", slug: "region-health", owner: "Region scoring", control: "Tune region health scoring from open actions, compliance load and productivity score inputs.", state: "Mapped" },
  { page: "Productivity", slug: "productivity", owner: "Productivity scoring", control: "Configure site score sources, manager response requirements and national review rules.", state: "Mapped" },
  { page: "Equipment Servicing", slug: "equipment-servicing", owner: "Service feed integration", control: "Connect odometer/hour data, map assets to regions and define service alert thresholds.", state: "Ready" },
  { page: "Compliance", slug: "compliance", owner: "Compliance action setup", control: "Set compliance actions, due dates, target regions and whether items count into Region Health.", state: "Active" },
  { page: "Calendar", slug: "calendar", owner: "Schedule control", control: "Manage calendar source, operating-week display, recurring job rules and regional schedule visibility.", state: "Mapped" },
  { page: "Inductions", slug: "inductions", owner: "Induction source and site mapping", control: "Manage read-only sheet source, site-region mapping and induction status display rules.", state: "Mapped" },
  { page: "Staff Availability", slug: "staff-availability", owner: "Availability feed", control: "Manage read-only sheet source, availability windows, display status rules and region relevance.", state: "Mapped" },
  { page: "Stock Orders", slug: "stock-orders", owner: "Stock catalogue and order review", control: "Approve orderable items, review requests, update tracking and manage national responses.", state: "Active" },
  { page: "Asset Tracking", slug: "asset-tracking", owner: "Unity GPS integration", control: "Connect GPS asset feeds, map assets to regions and configure status visibility.", state: "Ready" },
  { page: "Jobsheets", slug: "jobsheets", owner: "Thor Portal integration", control: "Connect jobsheet feed, approval queue visibility and manager action routing.", state: "Ready" },
  { page: "To Do", slug: "to-do", owner: "Personal and shared tasks", control: "Configure shared task routing, importance handling and future user-specific persistence.", state: "Mapped" },
  { page: "Chat", slug: "chat", owner: "Manager communications", control: "Set manager chat audiences, meeting links and future database-backed communication rules.", state: "Mapped" }
];
