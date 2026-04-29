"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

const nav = [
  ["Home", "/home"],
  ["Action Centre", "/actions"],
  ["Region Health", "/overview"],
  ["Compliance", "/compliance"],
  ["Stock Orders", "/stock-orders"],
  ["Operations", "/operations"],
  ["Chat", "/chat"],
  ["Director", "/director"],
  ["Admin", "/admin"],
  ["Portal", "/portal"],
  ["Fleetio", "/fleet"],
  ["To Do", "/todo"]
];

export function TocShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [todoText, setTodoText] = useState("");
  const [todos, setTodos] = useState<{ id: string; text: string; done: boolean }[]>([]);

  function todoStorageKey() {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return `toc.todos.${session?.email || "next-admin"}`;
  }

  useEffect(() => {
    setTodos(JSON.parse(localStorage.getItem(todoStorageKey()) || "[]"));
  }, []);

  function saveTodos(nextTodos: { id: string; text: string; done: boolean }[]) {
    setTodos(nextTodos);
    localStorage.setItem(todoStorageKey(), JSON.stringify(nextTodos));
  }

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = todoText.trim();
    if (!text) return;
    saveTodos([{ id: crypto.randomUUID(), text, done: false }, ...todos]);
    setTodoText("");
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
          {nav.map(([label, href]) => (
            <Link key={href} href={href} className={pathname === href ? "active" : ""} onClick={() => setNavOpen(false)}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="rail-card offline-feed-card">
          <span className="label">Data feeds</span>
          <strong>Demo data only</strong>
          <small>Portal, Unity and Fleetio feeds are not connected yet. API and webhook integrations offline.</small>
        </div>
      </aside>

      <main className="workspace">
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
              <em>Build 0.038</em>
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
            <button className="manual-refresh-button" type="button">Manual Refresh</button>
            <Link className="logout-button" href="/">Log out</Link>
          </div>
        </header>

        {children}

        <aside className="panel todo-panel" id="todo" aria-label="Personal to do list">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Manager memory</span>
              <h2>Personal to do list</h2>
            </div>
          </div>
          <form className="todo-form" onSubmit={addTodo}>
            <input value={todoText} onChange={(event) => setTodoText(event.target.value)} placeholder="Add a task as it comes in" autoComplete="off" />
            <button type="submit">Add</button>
          </form>
          <div className="todo-list">
            {todos.length ? todos.map((todo) => (
              <div className={`todo-item ${todo.done ? "done" : ""}`} key={todo.id}>
                <input
                  type="checkbox"
                  checked={todo.done}
                  aria-label="Mark task complete"
                  onChange={(event) => saveTodos(todos.map((item) => item.id === todo.id ? { ...item, done: event.target.checked } : item))}
                />
                <span>{todo.text}</span>
                <button type="button" onClick={() => saveTodos(todos.filter((item) => item.id !== todo.id))}>Remove</button>
              </div>
            )) : (
              <div className="brief-item">
                <span className="brief-dot" />
                <div>
                  <strong>No manager notes yet.</strong>
                  <small>Add tasks as they arrive.</small>
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
    </>
  );
}

export function PageIntro({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return (
    <section className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {detail ? <p>{detail}</p> : null}
    </section>
  );
}
