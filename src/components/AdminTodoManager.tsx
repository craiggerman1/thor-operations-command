"use client";

import { useEffect, useMemo, useState } from "react";
import { Tag } from "@/components/TocCards";
import type { AccessRole } from "@/lib/access";
import { tocFetch } from "@/lib/toc-client-auth";

type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  important?: boolean;
  sharedWith?: string;
  ownerRole: string;
  ownerScope: string;
  createdAt: string;
  updatedAt: string;
};

const regions = ["National", "Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"];
const roles: AccessRole[] = ["admin", "manager", "director"];

async function fetchTodos() {
  const response = await tocFetch("/api/todos?all=true", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "To Do database read failed.");
  return (payload.todos || []) as TodoItem[];
}

async function mutateTodo(body: Record<string, unknown>) {
  const response = await tocFetch("/api/todos", {
    method: "POST",
    body: JSON.stringify({ ...body, all: true })
  }, true);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "To Do update failed.");
  return (payload.todos || []) as TodoItem[];
}

export function AdminTodoManager() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [text, setText] = useState("");
  const [role, setRole] = useState<AccessRole>("manager");
  const [scope, setScope] = useState("Brisbane");
  const [important, setImportant] = useState(false);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const openTodos = useMemo(() => todos.filter((todo) => !todo.done), [todos]);
  const recentTodos = useMemo(() => [...todos].slice(0, 16), [todos]);

  useEffect(() => {
    function syncTodos() {
      fetchTodos()
        .then(setTodos)
        .catch((error: Error) => setMessage(error.message));
    }

    syncTodos();
    window.addEventListener("toc.todos.updated", syncTodos);
    const refreshInterval = window.setInterval(syncTodos, 20000);
    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("toc.todos.updated", syncTodos);
    };
  }, []);

  async function createTodo() {
    const task = text.trim();
    if (!task) {
      setMessage("Add a task first.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      const nextTodos = await mutateTodo({ action: "create", text: task, role, scope, important, sharedWith: role === "manager" ? `${scope} Manager` : role });
      setTodos(nextTodos);
      setText("");
      setImportant(false);
      setMessage("To Do item issued.");
      window.dispatchEvent(new Event("toc.todos.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not issue To Do item.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateTodo(id: string, updates: Record<string, unknown>, successMessage: string) {
    setMessage("");
    try {
      const nextTodos = await mutateTodo({ action: "update", id, ...updates });
      setTodos(nextTodos);
      setMessage(successMessage);
      window.dispatchEvent(new Event("toc.todos.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update To Do item.");
    }
  }

  async function deleteTodo(id: string) {
    if (!window.confirm("Are you sure you want to delete this To Do item?")) return;
    setMessage("");
    try {
      const nextTodos = await mutateTodo({ action: "delete", id });
      setTodos(nextTodos);
      setMessage("To Do item deleted.");
      window.dispatchEvent(new Event("toc.todos.updated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete To Do item.");
    }
  }

  return (
    <div className="admin-action-console">
      <div className="admin-action-form">
        <div>
          <strong>Issue To Do item</strong>
          <small>Assign a task to a role and scope. Managers see their scoped items in the floating To Do list.</small>
        </div>
        <label><span>Task</span><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Task for manager follow-up" /></label>
        <div className="admin-action-grid">
          <label><span>Access level</span><select value={role} onChange={(event) => setRole(event.target.value as AccessRole)}>{roles.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>Scope</span><select value={scope} onChange={(event) => setScope(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <label className="admin-checkbox-row"><input type="checkbox" checked={important} onChange={(event) => setImportant(event.target.checked)} /><span>Mark as important</span></label>
        <button type="button" onClick={createTodo} disabled={isSaving}>{isSaving ? "Issuing..." : "Issue To Do Item"}</button>
        {message ? <small className="admin-hint-message">{message}</small> : null}
      </div>
      <div className="admin-action-list">
        <div className="admin-list-head">
          <div>
            <strong>To Do task register</strong>
            <small>{openTodos.length} open items. {todos.length} total database tasks.</small>
          </div>
        </div>
        {recentTodos.map((todo) => (
          <article className={`admin-action-card ${todo.important ? "needs-update" : ""}`} key={todo.id}>
            <div className="admin-action-card-head">
              <div>
                <strong>{todo.text}</strong>
                <small>{todo.ownerRole} - {todo.ownerScope}</small>
              </div>
              <Tag tone={todo.done ? "green" : todo.important ? "red" : "blue"}>{todo.done ? "Done" : todo.important ? "Important" : "Open"}</Tag>
            </div>
            <div className="admin-action-controls">
              <button type="button" onClick={() => void updateTodo(todo.id, { done: !todo.done }, todo.done ? "To Do reopened." : "To Do marked done.")}>{todo.done ? "Reopen" : "Mark Done"}</button>
              <button type="button" onClick={() => void updateTodo(todo.id, { important: !todo.important }, "Importance updated.")}>{todo.important ? "Normal" : "Important"}</button>
              <button type="button" className="danger-button" onClick={() => void deleteTodo(todo.id)}>Delete</button>
            </div>
          </article>
        ))}
        {recentTodos.length ? null : <div className="empty-state">No To Do items are currently loaded from the database.</div>}
      </div>
    </div>
  );
}
