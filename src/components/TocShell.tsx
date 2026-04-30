"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { defaultSession, navigationItems, sessionProfiles } from "@/lib/access";
import type { AccessRole } from "@/lib/access";
import { TodoManager } from "@/components/TodoManager";
import { UrgentBroadcastBanner } from "@/components/UrgentBroadcast";

type StoredSession = {
  role?: AccessRole;
  label?: string;
  scope?: string;
};

type WeatherState = {
  location: string;
  summary: string;
  temp: string;
  icon: "clear" | "cloud" | "rain" | "storm";
  warning?: string;
  warningActive?: boolean;
};

const weatherByScope: Record<string, WeatherState> = {
  National: { location: "National", summary: "Weather feed staging", temp: "--", icon: "cloud", warning: "BOM warning feed not connected yet", warningActive: false },
  Brisbane: { location: "Brisbane", summary: "Warm, check storm risk", temp: "28 C", icon: "storm", warning: "Warning feed pending", warningActive: false },
  Sydney: { location: "Sydney", summary: "Cloud and coastal change", temp: "22 C", icon: "cloud", warning: "Warning feed pending", warningActive: false },
  Melbourne: { location: "Melbourne", summary: "Cooler operating window", temp: "18 C", icon: "rain", warning: "Warning feed pending", warningActive: false },
  Adelaide: { location: "Adelaide", summary: "Dry, watch afternoon wind", temp: "24 C", icon: "clear", warning: "Warning feed pending", warningActive: false },
  Perth: { location: "Perth", summary: "Clear field conditions", temp: "25 C", icon: "clear", warning: "Warning feed pending", warningActive: false },
  Canberra: { location: "Canberra", summary: "Cool morning conditions", temp: "16 C", icon: "cloud", warning: "Warning feed pending", warningActive: false },
  Workshop: { location: "Workshop", summary: "Workshop weather view", temp: "--", icon: "cloud", warning: "Use assigned workshop location once configured", warningActive: false }
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

export function TocShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const signOutTimer = useRef<number | null>(null);
  const [session, setSession] = useState<StoredSession>({ role: defaultSession.role, label: defaultSession.label, scope: "National" });
  const activeProfile = sessionProfiles[session.role || defaultSession.role] || defaultSession;
  const visibleNav = navigationItems.filter((item) => item.roles.includes(activeProfile.role));

  useEffect(() => {
    const storedSession = JSON.parse(localStorage.getItem("toc.session") || "null");
    if (storedSession?.role && storedSession.role in sessionProfiles) {
      setSession(storedSession);
      document.body.dataset.access = storedSession.role;
    } else {
      document.body.dataset.access = defaultSession.role;
    }
    document.body.classList.add("is-authenticated");

    return () => {
      if (signOutTimer.current) window.clearTimeout(signOutTimer.current);
    };
  }, []);

  function updateScope(scope: string) {
    const nextSession = { ...session, role: activeProfile.role, label: activeProfile.label, scope };
    setSession(nextSession);
    localStorage.setItem("toc.session", JSON.stringify(nextSession));
    window.dispatchEvent(new CustomEvent("toc.scopechange", { detail: { scope } }));
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
          {visibleNav.map(({ label, href }) => (
            <Link key={href} href={href} className={pathname === href ? "active" : ""} onClick={() => setNavOpen(false)}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="rail-card offline-feed-card">
          <span className="label">Data feeds</span>
          <strong>Integration staging</strong>
          <small>Portal, Unity and Fleetio feeds are not connected yet. API and webhook integrations offline.</small>
        </div>
      </aside>

      <main className="workspace">
        <UrgentBroadcastBanner />
        <header className="topbar">
          <div className="title-block">
            <span className="eyebrow">Thor Mobile Truck Wash</span>
            <div className="title-line">
              <span className="live-beacon" aria-label="Live data feeds are not connected yet" />
              <h1>Thor Operations Command</h1>
              <span className="live-label">OFFLINE - DATA PENDING</span>
            </div>
            <div className="build-notice" aria-label="Beta testing and build version">
              <strong>Beta</strong>
              <span>Not for internal operational use</span>
              <em>Build 0.089</em>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="session-chip">
              <span>Signed in</span>
              <strong>{activeProfile.label}</strong>
            </div>
            <div className="session-chip scope-chip">
              <span>Scope</span>
              <strong>{session.scope || activeProfile.regions[0]}</strong>
            </div>
            {activeProfile.regions.length > 1 ? <label className="select-wrap region-control">
              <span>Scope</span>
              <select value={session.scope || activeProfile.regions[0]} onChange={(event) => updateScope(event.target.value)}>
                {activeProfile.regions.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
            </label> : null}
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
      <div className="page-title-copy">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
      </div>
      <aside className={`page-weather-card ${weather.warning ? "has-warning" : ""} ${weather.warningActive ? "active-warning" : ""}`} aria-label={`${weather.location} weather`}>
        <span className={`weather-logo ${weather.icon}`} aria-hidden="true" />
        <div>
          <span className="eyebrow">{weather.location} weather</span>
          <strong>{weather.temp}</strong>
          <small>{weather.summary}</small>
          <em>{weather.warning || "No active warnings shown"}</em>
        </div>
      </aside>
    </section>
  );
}
