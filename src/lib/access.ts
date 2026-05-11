export type AccessRole = "admin" | "director" | "manager";

export type NavItem = {
  label: string;
  href: string;
  roles: AccessRole[];
  nationalOnly?: boolean;
  adminAlways?: boolean;
};

export type SessionProfile = {
  role: AccessRole;
  label: string;
  scopeLabel: string;
  regions: string[];
  responsibilities: string[];
  summary: string;
};

export const allRegions = ["National", "Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"];
export const assignableRegions = allRegions;

export const navigationItems: NavItem[] = [
  { label: "Home", href: "/home", roles: ["admin", "director", "manager"] },
  { label: "Admin Settings", href: "/admin", roles: ["admin"] },
  { label: "National Requests", href: "/national-requests", roles: ["admin", "manager"], nationalOnly: true },
  { label: "Action Centre", href: "/actions", roles: ["admin", "director", "manager"] },
  { label: "Region Health", href: "/overview", roles: ["admin", "director", "manager"] },
  { label: "Productivity", href: "/operations", roles: ["admin", "director", "manager"] },
  { label: "Equipment Servicing", href: "/equipment-servicing", roles: ["admin", "director", "manager"] },
  { label: "Compliance", href: "/compliance", roles: ["admin", "director", "manager"] },
  { label: "Calendar", href: "/calendar", roles: ["admin", "manager"] },
  { label: "Region Setup", href: "/region-setup", roles: ["admin", "manager"] },
  { label: "Inductions", href: "/inductions", roles: ["admin", "manager"] },
  { label: "Staff Availability", href: "/staff-availability", roles: ["admin", "manager"] },
  { label: "Stock Orders", href: "/stock-orders", roles: ["admin", "director", "manager"] },
  { label: "Asset Tracking", href: "/asset-tracking", roles: ["admin", "director", "manager"] },
  { label: "Jobsheets", href: "/jobsheets", roles: ["admin", "director", "manager"] },
  { label: "To Do", href: "/todo", roles: ["admin", "director", "manager"] },
  { label: "Chat", href: "/chat", roles: ["admin", "director", "manager"] }
];

export const sessionProfiles: Record<AccessRole, SessionProfile> = {
  admin: {
    role: "admin",
    label: "Admin",
    scopeLabel: "National control",
    regions: allRegions,
    responsibilities: ["National command", "Admin Settings", "User access", "All region visibility", "Optional assigned region management"],
    summary: "Full national scope, view and control. Admin can manage settings, assign users to one or multiple regions, and also hold normal manager responsibilities."
  },
  director: {
    role: "director",
    label: "Director",
    scopeLabel: "Owner overview",
    regions: ["National"],
    responsibilities: ["Owner dashboard", "Business health", "Efficiency", "Compliance", "Productivity", "Director messages"],
    summary: "Owner view of business health, efficiency, compliance and productivity, with ability to issue A Message From The Director."
  },
  manager: {
    role: "manager",
    label: "Manager",
    scopeLabel: "Assigned region",
    regions: ["Brisbane"],
    responsibilities: ["Assigned region actions", "Compliance", "Stock orders", "Productivity", "Calendar", "Equipment servicing", "Chat"],
    summary: "Manager view is limited to the region or regions assigned by Admin. Multiple regions can be assigned, including National Manager and Workshop responsibility."
  }
};

export const defaultSession = sessionProfiles.admin;
