import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

function isDevelopmentSession() {
  try {
    const session = JSON.parse(localStorage.getItem("toc.session") || "null");
    return session?.authMode === "developer";
  } catch {
    return false;
  }
}

export async function getTocRequestHeaders(includeJson = false) {
  const headers: Record<string, string> = includeJson ? { "Content-Type": "application/json" } : {};
  const supabase = getSupabaseBrowserClient();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;

  if (token) headers.Authorization = `Bearer ${token}`;
  if (!token && isDevelopmentSession()) headers["x-toc-development-session"] = "true";

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
