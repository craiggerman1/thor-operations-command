"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { allRegions, defaultSession, navigationItems, sessionProfiles } from "@/lib/access";
import type { AccessRole } from "@/lib/access";
import { actionItems, stockOrders } from "@/lib/toc-data";
import { getOpenActionItems } from "@/lib/action-state";
import { getScopedActionItems } from "@/lib/scope-utils";
import { TodoManager } from "@/components/TodoManager";
import { DirectorBroadcastBanner, UrgentBroadcastBanner } from "@/components/UrgentBroadcast";

type StoredSession = {
  role?: AccessRole;
  label?: string;
  scope?: string;
};

type WeatherState = {
  location: string;
  condition: string;
  summary: string;
  temp: string;
  icon: "clear" | "cloud" | "rain" | "storm";
  warning?: string;
  warningActive?: boolean;
};

type NationalActionStorageRequest = {
  status?: string;
};

type StockOrderStorageRequest = {
  region?: string;
  status?: string;
  updateRequested?: boolean;
};

type NavBadgeTone = "red" | "amber" | "blue";

type NavBadge = {
  count: number;
  tone: NavBadgeTone;
};

const weatherByScope: Record<string, WeatherState> = {
  National: { location: "Gold Coast", condition: "Cloud", summary: "Head office weather source", temp: "--", icon: "cloud", warning: "BOM warning source awaiting connection", warningActive: false },
  Brisbane: { location: "Brisbane", condition: "Storm risk", summary: "Warm, check storm risk", temp: "28 C", icon: "storm", warning: "Warning source awaiting connection", warningActive: false },
  Sydney: { location: "Sydney", condition: "Cloud", summary: "Cloud and coastal change", temp: "22 C", icon: "cloud", warning: "Warning source awaiting connection", warningActive: false },
  Melbourne: { location: "Melbourne", condition: "Rain", summary: "Cooler operating window", temp: "18 C", icon: "rain", warning: "Warning source awaiting connection", warningActive: false },
  Adelaide: { location: "Adelaide", condition: "Clear", summary: "Dry, watch afternoon wind", temp: "24 C", icon: "clear", warning: "Warning source awaiting connection", warningActive: false },
  Perth: { location: "Perth", condition: "Clear", summary: "Clear field conditions", temp: "25 C", icon: "clear", warning: "Warning source awaiting connection", warningActive: false },
  Canberra: { location: "Canberra", condition: "Cloud", summary: "Cool morning conditions", temp: "16 C", icon: "cloud", warning: "Warning source awaiting connection", warningActive: false },
  Workshop: { location: "Gold Coast", condition: "Cloud", summary: "Workshop weather source", temp: "--", icon: "cloud", warning: "BOM warning source awaiting connection", warningActive: false }
};

function getStoredScope() {
  if (typeof window === "undefined") return "National";

  try {
    const storedSession = JSON.parse(localStorage.getItem("toc.session") || "null");
    return storedSession?.scope || "National";
  } catch {
    return "National";
  }
}

const accessRoleOptions = Object.values(sessionProfiles);

function getNationalRequestCount() {
  if (typeof window === "undefined") return 0;

  try {
    const actionRequests = JSON.parse(localStorage.getItem("toc.nationalActionRequests") || "[]") as NationalActionStorageRequest[];
    const storedOrders = localStorage.getItem("toc.stockOrders");
    const stockRequests = storedOrders ? JSON.parse(storedOrders) as StockOrderStorageRequest[] : stockOrders as StockOrderStorageRequest[];
    const pendingActions = actionRequests.filter((request) => request.status === "Awaiting national review").length;
    const pendingStock = stockRequests.filter((order) => order.updateRequested || ["Request submitted", "Awaiting national approval", "Cancellation requested"].includes(order.status || "")).length;
    return pendingActions + pendingStock;
  } catch {
    return 0;
  }
}

function getScopedStockRequestCount(scope: string) {
  if (typeof window === "undefined") return 0;

  try {
    const storedOrders = localStorage.getItem("toc.stockOrders");
    const stockRequests = storedOrders ? JSON.parse(storedOrders) as StockOrderStorageRequest[] : stockOrders as StockOrderStorageRequest[];
    return stockRequests.filter((order) => {
      const visibleForScope = scope === "National" || order.region === scope;
      const needsAction = order.updateRequested || ["Request submitted", "Awaiting national approval", "Cancellation requested", "Open"].includes(order.status || "");
      return visibleForScope && needsAction;
    }).length;
  } catch {
    return 0;
  }
}

function getNavBadgeCounts(scope: string, role?: AccessRole) {
  const scopedActions = getScopedActionItems(getOpenActionItems(actionItems), scope, role);
  const countBySource = (sources: string[]) => scopedActions.filter((item) => sources.includes(item.source)).length;
  const countByDirective = (directives: string[]) => scopedActions.filter((item) => directives.includes(item.directive)).length;
  const urgentActionCount = scopedActions.filter((item) => item.severity === "red" || item.directive === "National Ops Directive").length;
  const complianceCount = countBySource(["Compliance"]);
  const stockCount = countBySource(["Stock Orders"]) + getScopedStockRequestCount(scope);
  const nationalRequestCount = scope === "National" ? getNationalRequestCount() : 0;
  const makeBadge = (count: number, tone: NavBadgeTone = "blue") => ({ count, tone });

  return {
    "Action Centre": makeBadge(scopedActions.length, urgentActionCount ? "red" : "amber"),
    "Region Health": makeBadge(scopedActions.length, urgentActionCount ? "red" : "amber"),
    "Equipment Servicing": makeBadge(countBySource(["Equipment Servicing", "Workshop"]), "amber"),
    Compliance: makeBadge(complianceCount, complianceCount ? "red" : "blue"),
    "Staff Availability": makeBadge(countBySource(["Roster"]), "amber"),
    Jobsheets: makeBadge(countBySource(["Thor Portal"]), "amber"),
    "Stock Orders": makeBadge(stockCount, stockCount > 2 ? "red" : "amber"),
    "To Do": makeBadge(countByDirective(["To Do"]), "blue"),
    "National Requests": makeBadge(nationalRequestCount, "red")
  } as Record<string, NavBadge>;
}

export function TocShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [unitsWashedToday, setUnitsWashedToday] = useState(0);
  const [navBadgeCounts, setNavBadgeCounts] = useState<Record<string, NavBadge>>({});
  const signOutTimer = useRef<number | null>(null);
  const [session, setSession] = useState<StoredSession>({ role: defaultSession.role, label: defaultSession.label, scope: "National" });
  const [sessionReady, setSessionReady] = useState(false);
  const activeProfile = sessionProfiles[session.role || defaultSession.role] || defaultSession;
  const currentScope = session.scope || activeProfile.regions[0] || "National";
  const visibleNav = navigationItems.filter((item) => item.roles.includes(activeProfile.role) && (!item.nationalOnly || currentScope === "National"));

  useEffect(() => {
    function syncSession(event?: Event) {
      const eventSession = event instanceof CustomEvent ? event.detail : null;
      const storedSession = eventSession || JSON.parse(localStorage.getItem("toc.session") || "null");
      if (storedSession?.role && storedSession.role in sessionProfiles) {
        setSession(storedSession);
        document.body.dataset.access = storedSession.role;
      } else {
        document.body.dataset.access = defaultSession.role;
      }
    }

    syncSession();
    document.body.classList.add("is-authenticated");
    setSessionReady(true);
    window.addEventListener("toc.sessionchange", syncSession);

    return () => {
      if (signOutTimer.current) window.clearTimeout(signOutTimer.current);
      window.removeEventListener("toc.sessionchange", syncSession);
    };
  }, []);

  useEffect(() => {
    function syncNavBadgeCounts() {
      setNavBadgeCounts(getNavBadgeCounts(getStoredScope(), session.role || defaultSession.role));
    }

    syncNavBadgeCounts();
    window.addEventListener("storage", syncNavBadgeCounts);
    window.addEventListener("toc.scopechange", syncNavBadgeCounts);
    window.addEventListener("toc.actionState.updated", syncNavBadgeCounts);
    window.addEventListener("toc.nationalActionRequests.updated", syncNavBadgeCounts);
    window.addEventListener("toc.stockOrders.updated", syncNavBadgeCounts);
    return () => {
      window.removeEventListener("storage", syncNavBadgeCounts);
      window.removeEventListener("toc.scopechange", syncNavBadgeCounts);
      window.removeEventListener("toc.actionState.updated", syncNavBadgeCounts);
      window.removeEventListener("toc.nationalActionRequests.updated", syncNavBadgeCounts);
      window.removeEventListener("toc.stockOrders.updated", syncNavBadgeCounts);
    };
  }, [session.role]);

  useEffect(() => {
    if (!sessionReady) return;

    const activeRole = activeProfile.role;
    const currentNavItem = navigationItems.find((item) => item.href === pathname);
    if (currentNavItem && (!currentNavItem.roles.includes(activeRole) || (currentNavItem.nationalOnly && currentScope !== "National"))) {
      router.push("/home");
    }
  }, [activeProfile.role, currentScope, pathname, router, sessionReady]);

  useEffect(() => {
    const targetUnits = 184;
    const duration = 1100;
    const startedAt = performance.now();
    let frameId = 0;

    function animateCounter(now: number) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setUnitsWashedToday(Math.round(targetUnits * easedProgress));
      if (progress < 1) {
        frameId = window.requestAnimationFrame(animateCounter);
      }
    }

    frameId = window.requestAnimationFrame(animateCounter);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  function updateScope(scope: string) {
    const nextSession = { ...session, role: activeProfile.role, label: activeProfile.label, scope };
    setSession(nextSession);
    localStorage.setItem("toc.session", JSON.stringify(nextSession));
    window.dispatchEvent(new CustomEvent("toc.scopechange", { detail: { scope } }));
  }

  function updateRole(role: AccessRole) {
    const nextProfile = sessionProfiles[role] || defaultSession;
    const currentScope = session.scope || activeProfile.regions[0] || "National";
    const nextScope = currentScope || nextProfile.regions[0] || "National";
    const nextSession = { role: nextProfile.role, label: nextProfile.label, scope: nextScope };
    setSession(nextSession);
    document.body.dataset.access = nextProfile.role;
    localStorage.setItem("toc.session", JSON.stringify(nextSession));
    window.dispatchEvent(new CustomEvent("toc.scopechange", { detail: { scope: nextScope } }));
  }

  function signOut() {
    if (signingOut) return;

    setSigningOut(true);
    signOutTimer.current = window.setTimeout(() => {
      localStorage.removeItem("toc.session");
      document.body.classList.remove("is-authenticated");
      delete document.body.dataset.access;
      router.push("/");
    }, 1450);
  }

  return (
    <>
    <div className="mobile-app-bar" aria-label="Mobile command navigation">
      <button className="mobile-menu-button" type="button" aria-label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
        <span />
        <span />
        <span />
      </button>
      <img src="/assets/thor-logo-stacked-sidebar.png" alt="Thor Mobile Truck Wash" />
      <strong>TOC</strong>
    </div>
    <div className={`mobile-nav-backdrop ${navOpen ? "active" : ""}`} aria-hidden="true" onClick={() => setNavOpen(false)} />
    <div className={`app-shell ${navOpen ? "nav-open" : ""}`}>
      <aside className="side-rail" aria-label="Thor Operations navigation">
        <button className="mobile-nav-close" type="button" aria-label="Close navigation" onClick={() => setNavOpen(false)}>Close</button>
        <div className="brand-lockup">
          <img className="brand-logo" src="/assets/thor-logo-stacked-sidebar.png" alt="Thor Mobile Truck Wash" />
          <div>
            <strong>Operations Command</strong>
            <span>Admin access</span>
          </div>
        </div>
        <nav className="rail-nav" aria-label="Primary">
          {visibleNav.map(({ label, href }) => {
            const badge = navBadgeCounts[label];
            return (
              <Link key={href} href={href} className={pathname === href ? "active" : ""} onClick={() => setNavOpen(false)}>
                {label}
                {badge?.count > 0 ? <span className={`nav-request-badge ${badge.tone}`}>{badge.count}</span> : null}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="workspace">
        <UrgentBroadcastBanner />
        <DirectorBroadcastBanner />
        <header className="topbar">
          <div className="title-block">
            <span className="eyebrow">Thor Mobile Truck Wash</span>
            <div className="title-line">
              <span className="live-beacon" aria-label="Live data feeds are offline" />
              <h1>Thor Operations Command</h1>
              <span className="live-label">OFFLINE</span>
            </div>
            <div className="build-notice" aria-label="Beta testing and build version">
              <strong>BETA</strong>
              <em>Build 0.154</em>
              <span className="units-counter"><b>{unitsWashedToday}</b> units washed today</span>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="session-chip">
              <span>Development view</span>
              <strong>{activeProfile.label}</strong>
            </div>
            <label className="select-wrap access-control">
              <span>View as</span>
              <select value={activeProfile.role} onChange={(event) => updateRole(event.target.value as AccessRole)}>
                {accessRoleOptions.map((profile) => <option key={profile.role} value={profile.role}>{profile.label}</option>)}
              </select>
            </label>
            <label className="select-wrap region-control">
              <span>Region</span>
              <select value={currentScope} onChange={(event) => updateScope(event.target.value)}>
                {allRegions.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
            </label>
            <button className="manual-refresh-button" type="button">Manual Refresh</button>
            <button className="logout-button" type="button" onClick={signOut} disabled={signingOut}>Log out</button>
          </div>
        </header>

        {children}

        <TodoManager />
      </main>
    </div>
    {signingOut ? (
      <div className="sign-in-sequence sign-out-sequence" role="status" aria-live="polite">
        <div className="sequence-core">
          <span className="sequence-ring" />
          <img src="/assets/thor-logo-stacked-sidebar.png" alt="" />
        </div>
        <div className="sequence-copy">
          <span>Secure sign out</span>
          <strong>Closing command session</strong>
          <small>Shutting down data feed connections. Signing out.</small>
        </div>
        <div className="sequence-progress"><span /></div>
      </div>
    ) : null}
    </>
  );
}

export function PageIntro({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
  const [scope, setScope] = useState("National");
  const weather = weatherByScope[scope] || weatherByScope.National;

  useEffect(() => {
    function syncScope(event?: Event) {
      const nextScope = event instanceof CustomEvent && event.detail?.scope ? event.detail.scope : getStoredScope();
      setScope(nextScope);
    }

    syncScope();
    window.addEventListener("storage", syncScope);
    window.addEventListener("toc.scopechange", syncScope);
    return () => {
      window.removeEventListener("storage", syncScope);
      window.removeEventListener("toc.scopechange", syncScope);
    };
  }, []);

  return (
    <section className="page-title">
      <div className={`page-title-copy ${weather.warningActive ? "has-warning active-warning" : ""}`}>
        <div className="page-title-text">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
          {detail ? <p>{detail}</p> : null}
        </div>
        <div className="page-title-weather" aria-label={`${weather.location} weather`}>
          <span className={`weather-logo ${weather.icon}`} aria-hidden="true" />
          <div>
            <span className="eyebrow">{weather.location} Weather</span>
            <strong>{weather.temp}</strong>
            <small>{weather.condition}</small>
            <b>{weather.summary}</b>
            <em>{weather.warning || "No active warnings shown"}</em>
          </div>
        </div>
      </div>
    </section>
  );
}
