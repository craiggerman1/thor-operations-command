"use client";

import { useEffect, useState } from "react";

export const operationsNewsKey = "toc.operationsNews";
export const defaultOperationsNews = "Thor Operations Currently Normal";
export const operationsNewsUpdatedEvent = "toc.operationsNews.updated";

export function getStoredOperationsNews() {
  if (typeof window === "undefined") return defaultOperationsNews;

  try {
    const storedNews = localStorage.getItem(operationsNewsKey);
    return storedNews?.trim() || defaultOperationsNews;
  } catch {
    return defaultOperationsNews;
  }
}

export function saveOperationsNews(message: string) {
  const cleanMessage = message.trim();
  localStorage.setItem(operationsNewsKey, cleanMessage);
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
    setMessage(getStoredOperationsNews());
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
        <span>Title bar news</span>
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={defaultOperationsNews} />
      </label>
      <div className="urgent-broadcast-actions">
        <button type="button" onClick={saveNews}>Update news</button>
        <button type="button" className="secondary-button" onClick={resetNews}>Reset normal</button>
      </div>
      {savedMessage ? <small>{savedMessage}</small> : null}
    </div>
  );
}
