import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

let cachedAuthorizationHeader: string | null = null;
let cachedAuthorizationUntil = 0;
const authorizationCacheMs = 30000;
const inFlightFetches = new Map<string, Promise<Response>>();
let inFlightAuthorizationHeader: Promise<string | null> | null = null;

async function resolveAuthorizationHeader() {
  const now = Date.now();

  if (cachedAuthorizationHeader && cachedAuthorizationUntil > now) {
    return cachedAuthorizationHeader;
  }

  if (inFlightAuthorizationHeader) return inFlightAuthorizationHeader;

  inFlightAuthorizationHeader = (async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const token = data.session?.access_token;

    if (!token) {
      cachedAuthorizationHeader = null;
      cachedAuthorizationUntil = 0;
      return null;
    }

    cachedAuthorizationHeader = `Bearer ${token}`;
    cachedAuthorizationUntil = Date.now() + authorizationCacheMs;
    return cachedAuthorizationHeader;
  })();

  try {
    return await inFlightAuthorizationHeader;
  } finally {
    inFlightAuthorizationHeader = null;
  }
}

export async function getTocRequestHeaders(includeJson = false) {
  const headers: Record<string, string> = includeJson ? { "Content-Type": "application/json" } : {};
  const authorizationHeader = await resolveAuthorizationHeader();
  if (authorizationHeader) headers.Authorization = authorizationHeader;

  return headers;
}

export async function tocFetch(input: RequestInfo | URL, init: RequestInit = {}, includeJson = false) {
  return fetch(input, {
    ...init,
    headers: {
      ...(await getTocRequestHeaders(includeJson)),
      ...(init.headers as Record<string, string> | undefined)
    }
  });
}

export async function tocJson<T = unknown>(input: RequestInfo | URL, init: RequestInit = {}, options: { includeJson?: boolean; dedupeKey?: string } = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const dedupeKey = options.dedupeKey || (method === "GET" ? String(input) : "");

  if (dedupeKey && inFlightFetches.has(dedupeKey)) {
    const response = await inFlightFetches.get(dedupeKey);
    return response?.clone().json() as Promise<T>;
  }

  const request = tocFetch(input, init, options.includeJson);
  if (dedupeKey) inFlightFetches.set(dedupeKey, request);

  try {
    const response = await request;
    if (!response.ok) throw new Error(`TOC request failed: ${response.status}`);
    return await response.clone().json() as T;
  } finally {
    if (dedupeKey) inFlightFetches.delete(dedupeKey);
  }
}
