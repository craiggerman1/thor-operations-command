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

function getTodoStorageKey() {
  const session = JSON.parse(localStorage.getItem("toc.session") || "null");
  return `toc.todos.${session?.role || "admin"}.${session?.scope || "National"}`;
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

  function loadTodos() {
    setTodos(JSON.parse(localStorage.getItem(getTodoStorageKey()) || "[]"));
    setFloatingEnabled(getFloatingSetting());
  }

  useEffect(() => {
    loadTodos();
    window.addEventListener("storage", loadTodos);
    window.addEventListener("toc.todos.updated", loadTodos);
    return () => {
      window.removeEventListener("storage", loadTodos);
      window.removeEventListener("toc.todos.updated", loadTodos);
    };
  }, []);

  function saveTodos(nextTodos: TodoItem[]) {
    setTodos(nextTodos);
    localStorage.setItem(getTodoStorageKey(), JSON.stringify(nextTodos));
    dispatchTodoUpdate();
  }

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = todoText.trim();
    if (!text) return;
    saveTodos([{ id: crypto.randomUUID(), text, done: false, important: false }, ...todos]);
    setTodoText("");
  }

  function updateTodo(id: string, updates: Partial<TodoItem>) {
    saveTodos(todos.map((item) => item.id === id ? { ...item, ...updates } : item));
  }

  function removeTodo(id: string) {
    saveTodos(todos.filter((item) => item.id !== id));
  }

  function setFloating(value: boolean) {
    setFloatingEnabled(value);
    localStorage.setItem("toc.todoFloating", value ? "on" : "off");
    dispatchTodoUpdate();
  }

  if (mode === "floating" && !floatingEnabled) {
    return null;
  }

  return (
    <section className={`panel todo-panel ${mode === "page" ? "todo-page-panel" : ""}`} id="todo" aria-label="Personal to do list">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Manager memory</span>
          <h2>{mode === "page" ? "Personal to do control" : "Personal to do list"}</h2>
        </div>
        {mode === "page" ? (
          <label className="todo-toggle">
            <input type="checkbox" checked={floatingEnabled} onChange={(event) => setFloating(event.target.checked)} />
            <span>Keep floating panel</span>
          </label>
        ) : null}
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
              <strong>{todo.text}</strong>
              {todo.sharedWith ? <small>Shared with {todo.sharedWith}</small> : <small>Private task</small>}
            </div>
            <div className="todo-actions">
              <button className={todo.important ? "important-active" : ""} type="button" onClick={() => updateTodo(todo.id, { important: !todo.important })}>
                Important
              </button>
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
