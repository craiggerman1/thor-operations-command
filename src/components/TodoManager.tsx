"use client";

import { FormEvent, useEffect, useState } from "react";

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  important?: boolean;
  sharedWith?: string;
};

const shareTargets = ["National Ops", "Workshop", "Brisbane Manager", "Sydney Manager", "Director"];
const floatingStartTop = 186;
const floatingDockTop = 28;

function getTodoStorageKey() {
  const session = JSON.parse(localStorage.getItem("toc.session") || "null");
  return `toc.todos.${session?.role || "admin"}.${session?.scope || "National"}`;
}

function getStoredSession() {
  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return {
      role: session?.role || "admin",
      scope: session?.scope || "National"
    };
  } catch {
    return { role: "admin", scope: "National" };
  }
}

function getFloatingSetting() {
  return localStorage.getItem("toc.todoFloating") !== "off";
}

function dispatchTodoUpdate() {
  window.dispatchEvent(new Event("toc.todos.updated"));
}

export function TodoManager({ mode = "floating" }: { mode?: "floating" | "page" }) {
  const [todoText, setTodoText] = useState("");
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [floatingEnabled, setFloatingEnabled] = useState(true);
  const [floatingTop, setFloatingTop] = useState(floatingStartTop);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  async function loadTodos() {
    const floatingSetting = getFloatingSetting();
    const session = getStoredSession();

    try {
      const response = await fetch(`/api/todos?role=${encodeURIComponent(session.role)}&scope=${encodeURIComponent(session.scope)}`, { cache: "no-store" });
      const payload = await response.json();
      setTodos(payload.todos || []);
    } catch {
      try {
        setTodos(JSON.parse(localStorage.getItem(getTodoStorageKey()) || "[]"));
      } catch {
        setTodos([]);
      }
    }

    setFloatingEnabled(floatingSetting);
    if (mode === "floating") {
      document.body.classList.toggle("todo-floating-disabled", !floatingSetting);
    }
  }

  useEffect(() => {
    void loadTodos();
    window.addEventListener("storage", loadTodos);
    window.addEventListener("toc.todos.updated", loadTodos);
    window.addEventListener("toc.scopechange", loadTodos);
    const refreshInterval = window.setInterval(loadTodos, 15000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("storage", loadTodos);
      window.removeEventListener("toc.todos.updated", loadTodos);
      window.removeEventListener("toc.scopechange", loadTodos);
      if (mode === "floating") {
        document.body.classList.remove("todo-floating-disabled");
      }
    };
  }, []);

  useEffect(() => {
    if (mode !== "floating") return undefined;

    function syncFloatingTop() {
      const header = document.querySelector<HTMLElement>(".topbar");
      const headerStop = header
        ? header.offsetTop + header.offsetHeight - window.scrollY + 16
        : floatingStartTop - window.scrollY;
      const nextTop = Math.max(floatingDockTop, headerStop);
      setFloatingTop(nextTop);
    }

    const frameId = window.requestAnimationFrame(syncFloatingTop);
    const header = document.querySelector<HTMLElement>(".topbar");
    const observer = header ? new ResizeObserver(syncFloatingTop) : null;
    if (header && observer) observer.observe(header);
    window.addEventListener("scroll", syncFloatingTop, { passive: true });
    window.addEventListener("resize", syncFloatingTop);
    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener("scroll", syncFloatingTop);
      window.removeEventListener("resize", syncFloatingTop);
    };
  }, [mode]);

  async function saveTodoMutation(payload: Record<string, unknown>, optimisticTodos?: TodoItem[]) {
    if (optimisticTodos) setTodos(optimisticTodos);

    const session = getStoredSession();
    try {
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, role: session.role, scope: session.scope })
      });
      const result = await response.json();
      if (response.ok) {
        setTodos(result.todos || []);
        localStorage.setItem(getTodoStorageKey(), JSON.stringify(result.todos || []));
      }
    } catch {
      if (optimisticTodos) localStorage.setItem(getTodoStorageKey(), JSON.stringify(optimisticTodos));
    }

    dispatchTodoUpdate();
  }

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = todoText.trim();
    if (!text) return;
    const optimistic = [{ id: crypto.randomUUID(), text, done: false, important: false }, ...todos];
    void saveTodoMutation({ action: "create", text }, optimistic);
    setTodoText("");
  }

  function updateTodo(id: string, updates: Partial<TodoItem>) {
    const optimistic = todos.map((item) => item.id === id ? { ...item, ...updates } : item);
    const payload: Record<string, unknown> = { action: "update", id };
    if ("text" in updates) payload.text = updates.text;
    if ("done" in updates) payload.done = updates.done;
    if ("important" in updates) payload.important = updates.important;
    if ("sharedWith" in updates) payload.sharedWith = updates.sharedWith;
    void saveTodoMutation(payload, optimistic);
  }

  function removeTodo(id: string) {
    void saveTodoMutation({ action: "delete", id }, todos.filter((item) => item.id !== id));
  }

  function startEditing(todo: TodoItem) {
    setEditingId(todo.id);
    setEditingText(todo.text);
  }

  function saveEdit(id: string) {
    const text = editingText.trim();
    if (!text) return;
    updateTodo(id, { text });
    setEditingId(null);
    setEditingText("");
  }

  function setFloating(value: boolean) {
    setFloatingEnabled(value);
    localStorage.setItem("toc.todoFloating", value ? "on" : "off");
    document.body.classList.toggle("todo-floating-disabled", !value);
    dispatchTodoUpdate();
  }

  if (mode === "floating" && !floatingEnabled) {
    return null;
  }

  const floatingStyle = mode === "floating"
    ? { top: `${floatingTop}px`, maxHeight: `calc(100dvh - ${floatingTop + 28}px)` }
    : undefined;

  return (
    <section className={`panel todo-panel ${mode === "page" ? "todo-page-panel" : ""}`} id="todo" aria-label="Personal to do list" style={floatingStyle}>
      <div className="panel-head">
        <div>
          {mode === "page" ? <span className="eyebrow">Manager memory</span> : null}
          <h2>{mode === "page" ? "Personal to do control" : "Manager To Do List"}</h2>
        </div>
        {mode === "page" ? (
          <label className="todo-toggle">
            <input type="checkbox" checked={floatingEnabled} onChange={(event) => setFloating(event.target.checked)} />
            <span>Keep floating panel</span>
          </label>
        ) : (
          <button className="todo-hide-button" type="button" onClick={() => setFloating(false)}>Hide</button>
        )}
      </div>
      <form className="todo-form" onSubmit={addTodo}>
        <input value={todoText} onChange={(event) => setTodoText(event.target.value)} placeholder="Add a task as it comes in" autoComplete="off" />
        <button type="submit">Add</button>
      </form>
      <div className="todo-list">
        {todos.length ? todos.map((todo) => (
          <article className={`todo-item ${todo.done ? "done" : ""} ${todo.important ? "important" : ""}`} key={todo.id}>
            <input
              type="checkbox"
              checked={todo.done}
              aria-label="Mark task complete"
              onChange={(event) => updateTodo(todo.id, { done: event.target.checked })}
            />
            <div className="todo-copy">
              {editingId === todo.id ? (
                <input value={editingText} onChange={(event) => setEditingText(event.target.value)} aria-label="Edit to do item" />
              ) : (
                <strong>{todo.text}</strong>
              )}
              {todo.sharedWith ? <small>Shared with {todo.sharedWith}</small> : <small>Private task</small>}
            </div>
            <div className="todo-actions">
              <button className={todo.important ? "important-active" : ""} type="button" onClick={() => updateTodo(todo.id, { important: !todo.important })}>
                Important
              </button>
              {editingId === todo.id ? (
                <button type="button" onClick={() => saveEdit(todo.id)}>Save</button>
              ) : (
                <button type="button" onClick={() => startEditing(todo)}>Edit</button>
              )}
              {mode === "page" ? (
                <select value={todo.sharedWith || ""} aria-label="Share to do item" onChange={(event) => updateTodo(todo.id, { sharedWith: event.target.value || undefined })}>
                  <option value="">Share</option>
                  {shareTargets.map((target) => <option value={target} key={target}>{target}</option>)}
                </select>
              ) : null}
              <button type="button" onClick={() => removeTodo(todo.id)}>Remove</button>
            </div>
          </article>
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
    </section>
  );
}
