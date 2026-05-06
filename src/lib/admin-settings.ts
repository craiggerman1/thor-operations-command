export type AdminPageSetting = {
  page: string;
  slug: string;
  owner: string;
  control: string;
  state: "Active" | "Mapped" | "Ready" | "Next";
};

export const adminSettingStateLabels: Record<AdminPageSetting["state"], string> = {
  Active: "Database active",
  Mapped: "Database mapped",
  Ready: "Control ready",
  Next: "Next setup"
};

export const adminSettingStateDescriptions: Record<AdminPageSetting["state"], string> = {
  Active: "This page has a live admin control surface connected to TOC data.",
  Mapped: "This page is linked to database-backed data or scoring logic and has admin controls for tuning it.",
  Ready: "The admin control is in place and ready for the next source feed or rule refinement.",
  Next: "This page is the next area being expanded in the database setup pipeline."
};

export const pageSettings: AdminPageSetting[] = [
  { page: "User Access", slug: "user-access", owner: "Security and permissions", control: "Register users, reset passwords, assign access levels and assign region responsibility.", state: "Active" },
  { page: "Staff Register", slug: "staff-register", owner: "People control", control: "Manage staff entities, roles, regions, skills, sheet links, notes and protected contact fields.", state: "Active" },
  { page: "Messages And Hints", slug: "messages", owner: "Global communications", control: "Manage urgent notices, Director messages, operational news and page hint controls.", state: "Active" },
  { page: "Audit Trail", slug: "audit-trail", owner: "Security and Odin logging", control: "Review Odin, user access, security and admin activity written to the audit log.", state: "Active" },
  { page: "Home", slug: "home", owner: "Command signals and go-live pathway", control: "Set which national signals, roadmap items and Director scorecard items appear on Home.", state: "Active" },
  { page: "Admin Settings", slug: "admin-settings", owner: "TOC control room", control: "Register users, assign access levels, assign regions, tune page settings and manage global notices.", state: "Active" },
  { page: "National Requests", slug: "national-requests", owner: "National action queue", control: "Review stock order requests, manager-submitted close-outs and requests that need national follow-up.", state: "Active" },
  { page: "Action Centre", slug: "action-centre", owner: "Action item workflow", control: "Create directives, assign due dates, set priority type and review manager close-out submissions.", state: "Active" },
  { page: "Region Health", slug: "region-health", owner: "Region scoring", control: "Tune region health scoring from open actions, compliance load and productivity score inputs.", state: "Mapped" },
  { page: "Productivity", slug: "productivity", owner: "Productivity scoring", control: "Configure site score sources, manager response requirements and national review rules.", state: "Mapped" },
  { page: "Equipment Servicing", slug: "equipment-servicing", owner: "Service source control", control: "Map odometer/hour data, assets, regions and service alert thresholds.", state: "Ready" },
  { page: "Compliance", slug: "compliance", owner: "Compliance action setup", control: "Set compliance actions, due dates, target regions and whether items count into Region Health.", state: "Active" },
  { page: "Calendar", slug: "calendar", owner: "Schedule control", control: "Manage calendar source, operating-week display, recurring job rules and regional schedule visibility.", state: "Mapped" },
  { page: "Inductions", slug: "inductions", owner: "Induction source and site mapping", control: "Manage controlled sheet source, site-region mapping and induction status display rules.", state: "Active" },
  { page: "Staff Availability", slug: "staff-availability", owner: "Availability source", control: "Manage controlled sheet source, availability windows, display status rules and region relevance.", state: "Active" },
  { page: "Stock Orders", slug: "stock-orders", owner: "Stock catalogue and order review", control: "Approve orderable items, review requests, update tracking and manage national responses.", state: "Active" },
  { page: "Asset Tracking", slug: "asset-tracking", owner: "Unity GPS source control", control: "Map GPS assets, regions and status visibility.", state: "Active" },
  { page: "Jobsheets", slug: "jobsheets", owner: "Thor Portal source control", control: "Map jobsheet source, approval queue visibility and manager action routing.", state: "Active" },
  { page: "To Do", slug: "to-do", owner: "Personal and shared tasks", control: "Configure shared task routing, importance handling and shared database persistence.", state: "Active" },
  { page: "Chat", slug: "chat", owner: "Manager communications", control: "Set manager chat audiences, meeting links and communication rules.", state: "Active" }
];
