"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { metrics } from "@/lib/toc-data";

const nav = [
  ["Overview", "/overview"],
  ["Action Centre", "/actions"],
  ["Operations", "/operations"],
  ["Director", "/director"],
  ["Admin", "/admin"],
  ["Portal", "/portal"],
  ["Fleetio", "/fleet"],
  ["Compliance", "/compliance"],
  ["Stock Orders", "/stock-orders"],
  ["Chat", "/chat"],
  ["Tasks", "/tasks"],
  ["To Do", "/todo"]
];

export function TocShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="side-rail" aria-label="Thor Operations navigation">
        <div className="brand-lockup">
          <img className="brand-logo" src="/assets/thor-logo-stacked-sidebar.png" alt="Thor Mobile Truck Wash" />
          <div>
            <strong>Operations Command</strong>
            <span>Admin access</span>
          </div>
        </div>
        <nav className="rail-nav" aria-label="Primary">
          {nav.map(([label, href]) => (
            <Link key={href} href={href} className={pathname === href ? "active" : ""}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="rail-card">
          <span className="label">Data feeds</span>
          <strong>Demo data only</strong>
          <small>Portal, Fleetio, GPS and database feeds are planned</small>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="title-block">
            <span className="eyebrow">Thor Mobile Truck Wash</span>
            <div className="title-line">
              <span className="live-beacon" aria-label="Live data feeds are not connected yet" />
              <h1>Thor Operations Command</h1>
              <span className="live-label">DATA PENDING</span>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="session-chip">
              <span>Signed in</span>
              <strong>Admin</strong>
            </div>
            <label className="select-wrap region-control">
              <span>Scope</span>
              <select defaultValue="national">
                <option value="national">National</option>
                <option value="Brisbane">Brisbane</option>
                <option value="Sydney">Sydney</option>
                <option value="Melbourne">Melbourne</option>
                <option value="Adelaide">Adelaide</option>
                <option value="Perth">Perth</option>
                <option value="Canberra">Canberra</option>
                <option value="Workshop">Workshop</option>
              </select>
            </label>
            <Link className="logout-button" href="/">Log out</Link>
          </div>
        </header>

        <section className="status-strip" aria-label="Operational status">
          {metrics.map((metric) => (
            <div className={`metric-card signal-${metric.status}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </div>
          ))}
        </section>

        {children}
      </main>
    </div>
  );
}

export function PageIntro({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <section className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{detail}</p>
    </section>
  );
}
