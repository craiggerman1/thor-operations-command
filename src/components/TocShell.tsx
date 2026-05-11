"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { allRegions, defaultSession, navigationItems, sessionProfiles } from "@/lib/access";
import type { AccessRole } from "@/lib/access";
import { TodoManager } from "@/components/TodoManager";
import { DirectorBroadcastBanner, UrgentBroadcastBanner } from "@/components/UrgentBroadcast";
import { defaultOperationsNews, fetchOperationsNewsItems, getStoredOperationsNewsItems, operationsNewsUpdatedEvent } from "@/components/OperationsNewsControls";
import type { TocWeatherPayload, WeatherIcon } from "@/lib/weather";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { clearTocClientCache, tocJson } from "@/lib/toc-client-auth";

type StoredSession = {
  id?: string;
  role?: AccessRole;
  label?: string;
  scope?: string;
  accountScope?: string;
  accountRole?: AccessRole;
  developerScope?: string;
  developerRole?: AccessRole;
  regions?: string[];
  email?: string;
  authMode?: "preview" | "supabase";
  mustChangePassword?: boolean;
  restoredAt?: string;
};

type WeatherState = {
  location: string;
  condition: string;
  summary: string;
  temp: string;
  icon: WeatherIcon;
  warning?: string;
  warningActive?: boolean;
  warningLink?: string | null;
};

type NavBadgeTone = "red" | "amber" | "blue";

type NavBadge = {
  count: number;
  tone: NavBadgeTone;
};

const weatherByScope: Record<string, WeatherState> = {
  National: { location: "Gold Coast", condition: "Weather unavailable", summary: "Live weather unavailable", temp: "--", icon: "cloud", warning: "BOM warning unavailable", warningActive: false },
  Brisbane: { location: "Brisbane", condition: "Weather unavailable", summary: "Live weather unavailable", temp: "--", icon: "cloud", warning: "BOM warning unavailable", warningActive: false },
  Sydney: { location: "Sydney", condition: "Weather unavailable", summary: "Live weather unavailable", temp: "--", icon: "cloud", warning: "BOM warning unavailable", warningActive: false },
  Melbourne: { location: "Melbourne", condition: "Weather unavailable", summary: "Live weather unavailable", temp: "--", icon: "cloud", warning: "BOM warning unavailable", warningActive: false },
  Adelaide: { location: "Adelaide", condition: "Weather unavailable", summary: "Live weather unavailable", temp: "--", icon: "cloud", warning: "BOM warning unavailable", warningActive: false },
  Perth: { location: "Perth", condition: "Weather unavailable", summary: "Live weather unavailable", temp: "--", icon: "cloud", warning: "BOM warning unavailable", warningActive: false },
  Canberra: { location: "Canberra", condition: "Weather unavailable", summary: "Live weather unavailable", temp: "--", icon: "cloud", warning: "BOM warning unavailable", warningActive: false },
  Workshop: { location: "Gold Coast", condition: "Weather unavailable", summary: "Live weather unavailable", temp: "--", icon: "cloud", warning: "BOM warning unavailable", warningActive: false }
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

const developerRoleOptions = [sessionProfiles.admin, sessionProfiles.manager];
const developmentToolsEnabled = process.env.NEXT_PUBLIC_TOC_ENABLE_VIEW_AS === "true";
const profileRevalidateMs = 5 * 60 * 1000;
const navBadgeCacheMs = 12000;
const weatherCacheMs = 10 * 60 * 1000;
const navBadgeRefreshMs = 60000;
const operationsNewsRefreshMs = 120000;
let shellSessionCache: StoredSession | null = null;
let shellRestoreInFlight: Promise<StoredSession | null> | null = null;

function sameNewsItems(firstItems: string[], secondItems: string[]) {
  if (firstItems.length !== secondItems.length) return false;
  return firstItems.every((item, index) => item === secondItems[index]);
}

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return shellSessionCache;

  try {
    const storedSession = JSON.parse(localStorage.getItem("toc.session") || "null");
    shellSessionCache = hasUsableStoredSession(storedSession) ? storedSession : null;
    return shellSessionCache;
  } catch {
    return shellSessionCache;
  }
}

function hasUsableStoredSession(storedSession: StoredSession | null) {
  const isPermittedPreview = developmentToolsEnabled && storedSession?.authMode === "preview";
  return Boolean(
    storedSession?.role &&
    storedSession.role in sessionProfiles &&
    (storedSession.authMode === "supabase" || isPermittedPreview)
  );
}

function getInitialStoredSession() {
  const storedSession = shellSessionCache || readStoredSession();
  return hasUsableStoredSession(storedSession) ? storedSession || {} : {};
}

function isRecentlyRestoredSession(storedSession: StoredSession | null) {
  if (!storedSession?.restoredAt) return false;
  return Date.now() - new Date(storedSession.restoredAt).getTime() < profileRevalidateMs;
}

function readJsonCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;

  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || "null") as { expiresAt?: number; value?: T } | null;
    if (!cached?.expiresAt || cached.expiresAt < Date.now()) return null;
    return cached.value || null;
  } catch {
    return null;
  }
}

function writeJsonCache<T>(key: string, value: T, ttlMs: number) {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(key, JSON.stringify({ value, expiresAt: Date.now() + ttlMs }));
  } catch {
    // Session cache is a speed hint only.
  }
}

export function TocShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [navBadgeCounts, setNavBadgeCounts] = useState<Record<string, NavBadge>>({});
  const signOutTimer = useRef<number | null>(null);
  const [session, setSession] = useState<StoredSession>(() => getInitialStoredSession());
  const [sessionReady, setSessionReady] = useState(true);
  const accountProfile = sessionProfiles[session.accountRole || session.role || defaultSession.role] || defaultSession;
  const developerToolsAllowed = developmentToolsEnabled || accountProfile.role === "admin";
  const activeProfile = developerToolsAllowed && session.developerRole && session.developerRole in sessionProfiles
    ? sessionProfiles[session.developerRole]
    : accountProfile;
  const developerRegionOverrideEnabled = developerToolsAllowed;
  const developerRole = developerToolsAllowed && session.developerRole && session.developerRole in sessionProfiles
    ? session.developerRole
    : "";
  const assignedRegions = session.regions?.length ? session.regions : accountProfile.regions;
  const accountRegionOptions = accountProfile.role === "director"
    ? ["National"]
    : accountProfile.role === "admin"
      ? Array.from(new Set(["National", ...assignedRegions.filter((region) => region !== "National")]))
      : assignedRegions.length ? assignedRegions : ["Brisbane"];
  const accountScope = accountRegionOptions.includes(session.accountScope || "")
    ? session.accountScope || accountRegionOptions[0]
    : accountRegionOptions.includes(session.scope || "")
      ? session.scope || accountRegionOptions[0]
      : accountRegionOptions[0];
  const developerScope = developerRegionOverrideEnabled && session.developerScope && allRegions.includes(session.developerScope)
    ? session.developerScope
    : "";
  const currentScope = developerScope || accountScope;
  const visibleNav = useMemo(
    () => navigationItems.filter((item) => item.roles.includes(activeProfile.role) && (!item.nationalOnly || (item.adminAlways && activeProfile.role === "admin") || currentScope === "National")),
    [activeProfile.role, currentScope]
  );

  useEffect(() => {
    function applySession(nextSession: StoredSession | null) {
      if (!hasUsableStoredSession(nextSession)) {
        localStorage.removeItem("toc.session");
        shellSessionCache = null;
        setSession({});
        document.body.classList.remove("is-authenticated");
        delete document.body.dataset.access;
        return false;
      }

      shellSessionCache = nextSession || null;
      setSession(nextSession || {});
      document.body.dataset.access = nextSession?.role || "";
      document.body.classList.add("is-authenticated");
      return true;
    }

    function syncSession(event?: Event) {
      const eventSession = event instanceof CustomEvent ? event.detail : null;
      applySession(eventSession || readStoredSession());
    }

    async function restoreSupabaseSession() {
      if (shellRestoreInFlight) {
        const restoredSession = await shellRestoreInFlight;
        return restoredSession ? applySession(restoredSession) : false;
      }

      shellRestoreInFlight = (async () => {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) return null;

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return null;

        const profileResponse = await fetch("/api/auth/profile", {
          headers: {
            Authorization: `Bearer ${token}`
          },
          cache: "no-store"
        });
        const profilePayload = await profileResponse.json();
        if (!profileResponse.ok || !profilePayload.profile) {
          await supabase.auth.signOut();
          return null;
        }

        const storedSession = readStoredSession();
        const profile = profilePayload.profile as StoredSession;
        const profileRegions = profile.regions?.length ? profile.regions : [];
        const storedAccountScope = storedSession?.accountScope || storedSession?.scope;
        const preservedAccountScope = storedAccountScope && profileRegions.includes(storedAccountScope)
          ? storedAccountScope
          : profile.scope;
        const preservedDeveloperScope = (developmentToolsEnabled || profile.role === "admin") && storedSession?.developerScope && allRegions.includes(storedSession.developerScope)
          ? storedSession.developerScope
          : undefined;
        const preservedDeveloperRole = (developmentToolsEnabled || profile.role === "admin") && storedSession?.developerRole && (storedSession.developerRole === "admin" || storedSession.developerRole === "manager")
          ? storedSession.developerRole
          : undefined;
        const restoredSession = {
          ...profile,
          accountRole: profile.role,
          role: preservedDeveloperRole || profile.role,
          scope: preservedDeveloperScope || preservedAccountScope,
          accountScope: preservedAccountScope,
          developerScope: preservedDeveloperScope,
          developerRole: preservedDeveloperRole,
          authMode: "supabase" as const,
          restoredAt: new Date().toISOString()
        };
        localStorage.setItem("toc.session", JSON.stringify(restoredSession));
        return restoredSession;
      })();

      try {
        const restoredSession = await shellRestoreInFlight;
        return restoredSession ? applySession(restoredSession) : false;
      } finally {
        shellRestoreInFlight = null;
      }
    }

    async function initialiseSession() {
      const storedSession = readStoredSession();
      const hasUsableStoredSession = applySession(storedSession);

      if (hasUsableStoredSession) {
        setSessionReady(true);
        if (storedSession?.authMode === "preview" && developmentToolsEnabled) return;
        if (storedSession?.authMode === "supabase" && isRecentlyRestoredSession(storedSession)) return;

        const restored = await restoreSupabaseSession();
        if (!restored) router.replace("/");
        return;
      }

      const restored = await restoreSupabaseSession();
      setSessionReady(true);
      if (!restored) router.replace("/");
    }

    void initialiseSession();
    window.addEventListener("toc.sessionchange", syncSession);

    return () => {
      if (signOutTimer.current) window.clearTimeout(signOutTimer.current);
      window.removeEventListener("toc.sessionchange", syncSession);
    };
  }, [router]);

  useEffect(() => {
    async function syncNavBadgeCounts() {
      if (!sessionReady || !session.role) return;
      const scope = getStoredScope();
      const cacheKey = `toc.navBadges.${session.role}.${scope}`;
      const cachedBadges = readJsonCache<Record<string, NavBadge>>(cacheKey);
      if (cachedBadges) setNavBadgeCounts(cachedBadges);

      try {
        const payload = await tocJson<{ badges?: Record<string, NavBadge> }>(`/api/navigation-badges?scope=${encodeURIComponent(scope)}&role=${encodeURIComponent(session.role || defaultSession.role)}`, { cache: "no-store" });
        const nextBadges = payload.badges || {};
        writeJsonCache(cacheKey, nextBadges, navBadgeCacheMs);
        setNavBadgeCounts(nextBadges);
      } catch {
        if (!cachedBadges) setNavBadgeCounts({});
      }
    }

    void syncNavBadgeCounts();
    window.addEventListener("storage", syncNavBadgeCounts);
    window.addEventListener("toc.scopechange", syncNavBadgeCounts);
    window.addEventListener("toc.actionState.updated", syncNavBadgeCounts);
    window.addEventListener("toc.nationalActionRequests.updated", syncNavBadgeCounts);
    window.addEventListener("toc.stockOrders.updated", syncNavBadgeCounts);
    window.addEventListener("toc.odin.updated", syncNavBadgeCounts);
    const refreshInterval = window.setInterval(syncNavBadgeCounts, navBadgeRefreshMs);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", syncNavBadgeCounts);
      window.removeEventListener("toc.scopechange", syncNavBadgeCounts);
      window.removeEventListener("toc.actionState.updated", syncNavBadgeCounts);
      window.removeEventListener("toc.nationalActionRequests.updated", syncNavBadgeCounts);
      window.removeEventListener("toc.stockOrders.updated", syncNavBadgeCounts);
      window.removeEventListener("toc.odin.updated", syncNavBadgeCounts);
    };
  }, [session.role, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !session.role) return;

    const activeRole = activeProfile.role;
    const currentNavItem = navigationItems.find((item) => item.href === pathname);
    if (session.mustChangePassword && pathname !== "/account/password") {
      router.push("/account/password");
      return;
    }
    if (currentNavItem && (!currentNavItem.roles.includes(activeRole) || (currentNavItem.nationalOnly && !(currentNavItem.adminAlways && activeRole === "admin") && currentScope !== "National"))) {
      router.push("/home");
    }
  }, [activeProfile.role, currentScope, pathname, router, session.mustChangePassword, session.role, sessionReady]);

  useEffect(() => {
    if (!sessionReady || activeProfile.role !== "manager" || !session.id || session.authMode !== "supabase") return;
    if (pathname === "/operations-setup" || pathname.startsWith("/account/password")) return;
    if (sessionStorage.getItem(`toc.setup.dismissed.${currentScope}`) === "true") return;

    let cancelled = false;
    tocJson<{ setup?: { completed_at?: string | null; force_run_next_login?: boolean | null } }>(`/api/operations-setup?region=${encodeURIComponent(currentScope)}`, { cache: "no-store" })
      .then((payload) => {
        if (cancelled) return;
        if (!payload.setup?.completed_at || payload.setup?.force_run_next_login) router.replace("/operations-setup");
      })
      .catch(() => {
        // Setup status should never block TOC if the health check is temporarily unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [activeProfile.role, currentScope, pathname, router, session.authMode, session.id, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !session.role) return;

    const timeoutId = window.setTimeout(() => {
      visibleNav.forEach((item) => {
        if (item.href !== pathname) router.prefetch(item.href);
      });
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [pathname, router, session.role, sessionReady, visibleNav]);

  function updateScope(scope: string) {
    const nextEffectiveScope = developerScope || scope;
    const nextSession = { ...session, accountRole: accountProfile.role, role: activeProfile.role, label: activeProfile.label, scope: nextEffectiveScope, accountScope: scope, regions: accountRegionOptions };
    setSession(nextSession);
    localStorage.setItem("toc.session", JSON.stringify(nextSession));
    window.dispatchEvent(new CustomEvent("toc.scopechange", { detail: { scope: nextEffectiveScope } }));
  }

  function updateDeveloperScope(scope: string) {
    const nextDeveloperScope = allRegions.includes(scope) ? scope : undefined;
    const nextEffectiveScope = nextDeveloperScope || accountScope;
    const nextSession = {
      ...session,
      accountRole: accountProfile.role,
      role: activeProfile.role,
      label: activeProfile.label,
      scope: nextEffectiveScope,
      accountScope,
      developerScope: nextDeveloperScope,
      regions: accountRegionOptions
    };
    setSession(nextSession);
    localStorage.setItem("toc.session", JSON.stringify(nextSession));
    window.dispatchEvent(new CustomEvent("toc.scopechange", { detail: { scope: nextEffectiveScope } }));
  }

  function updateDeveloperRole(role: string) {
    const nextDeveloperRole = role === "admin" || role === "manager" ? role as AccessRole : undefined;
    const nextProfile = nextDeveloperRole ? sessionProfiles[nextDeveloperRole] : accountProfile;
    const nextDeveloperScope = developerToolsAllowed && session.developerScope && allRegions.includes(session.developerScope)
      ? session.developerScope
      : undefined;
    const nextScope = nextDeveloperScope || accountScope;
    const nextSession = {
      ...session,
      accountRole: accountProfile.role,
      role: nextProfile.role,
      label: nextProfile.label,
      scope: nextScope,
      accountScope,
      developerScope: nextDeveloperScope,
      developerRole: nextDeveloperRole,
      regions: accountRegionOptions
    };
    setSession(nextSession);
    document.body.dataset.access = nextProfile.role;
    localStorage.setItem("toc.session", JSON.stringify(nextSession));
    window.dispatchEvent(new CustomEvent("toc.scopechange", { detail: { scope: nextScope } }));
  }

  function signOut() {
    if (signingOut) return;

    setSigningOut(true);
    void getSupabaseBrowserClient()?.auth.signOut();
    signOutTimer.current = window.setTimeout(() => {
      localStorage.removeItem("toc.session");
      document.body.classList.remove("is-authenticated");
      delete document.body.dataset.access;
      router.push("/");
    }, 1450);
  }

  function manualRefresh() {
    clearTocClientCache();
    sessionStorage.removeItem("toc.operationsNews.lastFetchAt");
    window.dispatchEvent(new Event("toc.actionState.updated"));
    window.dispatchEvent(new Event("toc.nationalActionRequests.updated"));
    window.dispatchEvent(new Event("toc.stockOrders.updated"));
    window.dispatchEvent(new Event("toc.odin.updated"));
    window.dispatchEvent(new Event("toc.manualRefresh"));
  }

  if (!session.role) return null;

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
              <Link key={href} href={href} className={pathname === href ? "active" : ""} onClick={() => setNavOpen(false)} onMouseEnter={() => router.prefetch(href)} onFocus={() => router.prefetch(href)}>
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
              <em>Build 0.361</em>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="session-chip">
              <span>Signed in</span>
              <strong>{accountProfile.label}</strong>
              {developerRole ? <small>Testing as {activeProfile.label}</small> : null}
            </div>
            <label className="select-wrap region-control">
              <span>Account Region</span>
              <select value={accountScope} onChange={(event) => updateScope(event.target.value)}>
                {accountRegionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
            </label>
            {developerRegionOverrideEnabled ? (
              <>
                <label className="select-wrap developer-region-control">
                  <span>Developer Role</span>
                  <select value={developerRole} onChange={(event) => updateDeveloperRole(event.target.value)}>
                    <option value="">Real account</option>
                    {developerRoleOptions.map((profile) => <option key={profile.role} value={profile.role}>{profile.label}</option>)}
                  </select>
                </label>
                <label className="select-wrap developer-region-control">
                  <span>Developer Region</span>
                  <select value={developerScope} onChange={(event) => updateDeveloperScope(event.target.value)}>
                    <option value="">Off</option>
                    {allRegions.map((region) => <option key={region} value={region}>{region}</option>)}
                  </select>
                </label>
              </>
            ) : null}
            <button className="manual-refresh-button" type="button" onClick={manualRefresh}>Manual Refresh</button>
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
  const [weather, setWeather] = useState<WeatherState>(weatherByScope.National);
  const [operationsNews, setOperationsNews] = useState([defaultOperationsNews]);
  const [operationsNewsIndex, setOperationsNewsIndex] = useState(0);
  const operationsNewsRef = useRef([defaultOperationsNews]);
  const operationsNewsIndexRef = useRef(0);

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

  useEffect(() => {
    function applyOperationsNews(nextItems: string[]) {
      const cleanItems = nextItems.length ? nextItems : [defaultOperationsNews];
      const currentItems = operationsNewsRef.current;
      if (sameNewsItems(currentItems, cleanItems)) return;

      const currentItem = currentItems[operationsNewsIndexRef.current];
      const preservedIndex = currentItem ? cleanItems.indexOf(currentItem) : -1;
      const nextIndex = preservedIndex >= 0 ? preservedIndex : 0;

      operationsNewsRef.current = cleanItems;
      operationsNewsIndexRef.current = nextIndex;
      setOperationsNews(cleanItems);
      setOperationsNewsIndex(nextIndex);
    }

    function syncOperationsNews(force = false) {
      applyOperationsNews(getStoredOperationsNewsItems());
      const cacheKey = "toc.operationsNews.lastFetchAt";
      const lastFetchAt = Number(sessionStorage.getItem(cacheKey) || 0);
      if (!force && lastFetchAt && Date.now() - lastFetchAt < operationsNewsRefreshMs) return;

      fetchOperationsNewsItems()
        .then((items) => {
          sessionStorage.setItem(cacheKey, String(Date.now()));
          applyOperationsNews(items);
        })
        .catch(() => undefined);
    }

    syncOperationsNews();
    const forceSyncOperationsNews = () => syncOperationsNews(true);
    window.addEventListener("storage", forceSyncOperationsNews);
    window.addEventListener(operationsNewsUpdatedEvent, forceSyncOperationsNews);
    const refreshInterval = window.setInterval(syncOperationsNews, operationsNewsRefreshMs);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", forceSyncOperationsNews);
      window.removeEventListener(operationsNewsUpdatedEvent, forceSyncOperationsNews);
    };
  }, []);

  useEffect(() => {
    if (operationsNews.length <= 1) return;

    const intervalId = window.setInterval(() => {
      setOperationsNewsIndex((currentIndex) => {
        const nextIndex = (currentIndex + 1) % operationsNews.length;
        operationsNewsIndexRef.current = nextIndex;
        return nextIndex;
      });
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [operationsNews.length]);

  useEffect(() => {
    let isActive = true;
    const fallbackWeather = weatherByScope[scope] || weatherByScope.National;
    const cacheKey = `toc.weather.${scope}`;
    const cachedWeather = readJsonCache<WeatherState>(cacheKey);
    setWeather(cachedWeather || fallbackWeather);
    if (cachedWeather) return () => {
      isActive = false;
    };

    fetch(`/api/weather?scope=${encodeURIComponent(scope)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Weather feed unavailable")))
      .then((payload: TocWeatherPayload) => {
        if (!isActive) return;
        const apparentTemp = payload.current.apparentTemp !== null ? `Feels ${Math.round(payload.current.apparentTemp)} C` : payload.current.condition;
        const wind = payload.current.wind !== null ? `Wind ${Math.round(payload.current.wind)} km/h` : "Wind not supplied";
        const nextWeather = {
          location: payload.location,
          condition: payload.current.condition,
          summary: `${apparentTemp} - ${wind}`,
          temp: payload.current.temp !== null ? `${Math.round(payload.current.temp)} C` : "--",
          icon: payload.current.icon,
          warning: payload.warning.message,
          warningActive: payload.warning.active,
          warningLink: payload.warning.link
        };
        writeJsonCache(cacheKey, nextWeather, weatherCacheMs);
        setWeather(nextWeather);
      })
      .catch(() => {
        if (!isActive) return;
        if (!cachedWeather) setWeather({ ...fallbackWeather, warning: "Live weather feed unavailable", warningActive: false });
      });

    return () => {
      isActive = false;
    };
  }, [scope]);

  return (
    <section className="page-title">
      <div className={`page-title-copy ${weather.warningActive ? "has-warning active-warning" : ""}`}>
        <div className="page-title-text">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h2>{title}</h2>
          {detail ? <p>{detail}</p> : null}
        </div>
        <div className="page-title-news" aria-label="Operations news">
          <span className="eyebrow">Operational News</span>
          <strong key={`${operationsNewsIndex}-${operationsNews[operationsNewsIndex]}`}>{operationsNews[operationsNewsIndex]}</strong>
        </div>
        <div className="page-title-weather" aria-label={`${weather.location} weather`}>
          <span className={`weather-logo ${weather.icon}`} aria-hidden="true" />
          <div>
            <span className="eyebrow">{weather.location} Weather</span>
            <strong>{weather.temp}</strong>
            <small>{weather.condition}</small>
            <b>{weather.summary}</b>
            {weather.warningActive ? (
              weather.warningLink ? (
                <a className="weather-alert-pill" href={weather.warningLink} target="_blank" rel="noreferrer">{weather.warning}</a>
              ) : (
                <span className="weather-alert-pill">{weather.warning}</span>
              )
            ) : <em>{weather.warning || "BOM: No current warnings"}</em>}
          </div>
        </div>
      </div>
    </section>
  );
}
