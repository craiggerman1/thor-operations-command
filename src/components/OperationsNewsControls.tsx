"use client";

import { useEffect, useState } from "react";
import { tocFetch } from "@/lib/toc-client-auth";

export const operationsNewsKey = "toc.operationsNews";
export const defaultOperationsNews = "Thor Operations Currently Normal";
export const operationsNewsUpdatedEvent = "toc.operationsNews.updated";
const operationsNewsApi = "/api/operations-news";

function parseOperationsNews(storedNews: string | null) {
  if (!storedNews?.trim()) return [defaultOperationsNews];

  try {
    const parsedNews = JSON.parse(storedNews) as unknown;
    if (Array.isArray(parsedNews)) {
      const cleanLines = parsedNews.map((item) => String(item).trim()).filter(Boolean);
      return cleanLines.length ? cleanLines : [defaultOperationsNews];
    }
  } catch {
    // Older builds stored a single plain text message.
  }

  const cleanLines = storedNews.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return cleanLines.length ? cleanLines : [defaultOperationsNews];
}

export function getStoredOperationsNewsItems() {
  if (typeof window === "undefined") return [defaultOperationsNews];

  try {
    return parseOperationsNews(localStorage.getItem(operationsNewsKey));
  } catch {
    return [defaultOperationsNews];
  }
}

export function saveOperationsNews(message: string) {
  const cleanLines = parseOperationsNews(message).filter(Boolean);
  localStorage.setItem(operationsNewsKey, JSON.stringify(cleanLines));
  window.dispatchEvent(new Event(operationsNewsUpdatedEvent));
}

export function clearOperationsNews() {
  localStorage.removeItem(operationsNewsKey);
  window.dispatchEvent(new Event(operationsNewsUpdatedEvent));
}

export async function fetchOperationsNewsItems() {
  const response = await fetch(operationsNewsApi, { cache: "no-store" });
  if (!response.ok) throw new Error("Operations news database read failed.");
  const payload = await response.json() as { items?: unknown[] };
  return parseOperationsNews(JSON.stringify(payload.items || []));
}

export function OperationsNewsControls() {
  const [message, setMessage] = useState(defaultOperationsNews);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    let isActive = true;
    setMessage(getStoredOperationsNewsItems().join("\n"));
    fetchOperationsNewsItems()
      .then((items) => {
        if (!isActive) return;
        setMessage(items.join("\n"));
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, []);

  async function saveNews() {
    const items = parseOperationsNews(message);
    saveOperationsNews(message);
    try {
      const response = await tocFetch(operationsNewsApi, {
        method: "POST",
        body: JSON.stringify({ items })
      }, true);
      if (!response.ok) throw new Error("Operations news database update failed.");
      setSavedMessage("Operations news updated for all users.");
    } catch {
      setSavedMessage("Saved on this browser. Database update needs Supabase server key.");
    }
  }

  async function resetNews() {
    clearOperationsNews();
    setMessage(defaultOperationsNews);
    try {
      const response = await tocFetch(operationsNewsApi, {
        method: "POST",
        body: JSON.stringify({ items: [defaultOperationsNews] })
      }, true);
      if (!response.ok) throw new Error("Operations news database reset failed.");
      setSavedMessage("Operations news reset to normal for all users.");
    } catch {
      setSavedMessage("Reset on this browser. Database update needs Supabase server key.");
    }
  }

  return (
    <div className="operations-news-controls">
      <label>
        <span>Title bar news lines</span>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={`${defaultOperationsNews}\nAdd another line here`} rows={4} />
      </label>
      <div className="urgent-broadcast-actions">
        <button type="button" onClick={saveNews}>Update news</button>
        <button type="button" className="secondary-button" onClick={resetNews}>Reset normal</button>
      </div>
      {savedMessage ? <small>{savedMessage}</small> : null}
    </div>
  );
}
