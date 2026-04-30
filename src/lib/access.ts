export type AccessRole = "admin" | "director" | "manager" | "workshop";

export type NavItem = {
  label: string;
  href: string;
  roles: AccessRole[];
};

export type SessionProfile = {
  role: AccessRole;
  label: string;
  scopeLabel: string;
  regions: string[];
  summary: string;
};

export const allRegions = ["National", "Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"];

export const navigationItems: NavItem[] = [
  { label: "Home", href: "/home", roles: ["admin", "director", "manager", "workshop"] },
  { label: "Action Centre", href: "/actions", roles: ["admin", "manager", "workshop"] },
  { label: "Region Health", href: "/overview", roles: ["admin", "director", "manager"] },
  { label: "Compliance", href: "/compliance", roles: ["admin", "director", "manager", "workshop"] },
  { label: "Stock Orders", href: "/stock-orders", roles: ["admin", "manager", "workshop"] },
  { label: "Productivity", href: "/operations", roles: ["admin", "director", "manager", "workshop"] },
  { label: "Asset Tracking", href: "/asset-tracking", roles: ["admin", "director", "manager", "workshop"] },
  { label: "Calendar", href: "/calendar", roles: ["admin", "director", "manager", "workshop"] },
  { label: "Staff Availability", href: "/staff-availability", roles: ["admin", "manager", "workshop"] },
  { label: "Equipment Servicing", href: "/equipment-servicing", roles: ["admin", "director", "manager", "workshop"] },
  { label: "Chat", href: "/chat", roles: ["admin", "manager", "workshop"] },
  { label: "Director", href: "/director", roles: ["admin", "director"] },
  { label: "Admin", href: "/admin", roles: ["admin"] },
  { label: "Portal", href: "/portal", roles: ["admin", "manager"] },
  { label: "Fleetio", href: "/fleet", roles: ["admin", "manager", "workshop"] },
  { label: "To Do", href: "/todo", roles: ["admin", "director", "manager", "workshop"] }
];

export const sessionProfiles: Record<AccessRole, SessionProfile> = {
  admin: {
    role: "admin",
    label: "Admin",
    scopeLabel: "National control",
    regions: allRegions,
    summary: "Full national overview, user access, permissions, all regions and integration setup."
  },
  director: {
    role: "director",
    label: "Director",
    scopeLabel: "Owner overview",
    regions: ["National"],
    summary: "High-level business health, efficiency, compliance and productivity without operational noise."
  },
  manager: {
    role: "manager",
    label: "Manager",
    scopeLabel: "Assigned region",
    regions: ["Brisbane"],
    summary: "Regional action centre, health, compliance, stock, productivity, tracking, calendar, servicing, Portal and Fleetio visibility."
  },
  workshop: {
    role: "workshop",
    label: "Workshop",
    scopeLabel: "Workshop BU",
    regions: ["Workshop"],
    summary: "Workshop actions, compliance, parts, stock, tracking, staff availability, equipment servicing, asset readiness and team communication."
  }
};

export const defaultSession = sessionProfiles.admin;
