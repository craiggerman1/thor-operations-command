"use client";

import { useEffect, useState } from "react";

export const operationsNewsKey = "toc.operationsNews";
export const defaultOperationsNews = "Thor Operations Currently Normal";
export const operationsNewsUpdatedEvent = "toc.operationsNews.updated";

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

export function OperationsNewsControls() {
  const [message, setMessage] = useState(defaultOperationsNews);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    setMessage(getStoredOperationsNewsItems().join("\n"));
  }, []);

  function saveNews() {
    saveOperationsNews(message);
    setSavedMessage("Operations news updated.");
  }

  function resetNews() {
    clearOperationsNews();
    setMessage(defaultOperationsNews);
    setSavedMessage("Operations news reset to normal.");
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
