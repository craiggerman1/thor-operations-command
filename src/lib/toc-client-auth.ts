import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

let cachedAuthorizationHeader: string | null = null;
let cachedAuthorizationUntil = 0;
const authorizationCacheMs = 30000;

export async function getTocRequestHeaders(includeJson = false) {
  const headers: Record<string, string> = includeJson ? { "Content-Type": "application/json" } : {};
  const now = Date.now();

  if (cachedAuthorizationHeader && cachedAuthorizationUntil > now) {
    headers.Authorization = cachedAuthorizationHeader;
    return headers;
  }

  const supabase = getSupabaseBrowserClient();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;

  if (token) {
    cachedAuthorizationHeader = `Bearer ${token}`;
    cachedAuthorizationUntil = now + authorizationCacheMs;
    headers.Authorization = cachedAuthorizationHeader;
  } else {
    cachedAuthorizationHeader = null;
    cachedAuthorizationUntil = 0;
  }

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
