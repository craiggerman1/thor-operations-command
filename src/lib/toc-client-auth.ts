import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export async function getTocRequestHeaders(includeJson = false) {
  const headers: Record<string, string> = includeJson ? { "Content-Type": "application/json" } : {};
  const supabase = getSupabaseBrowserClient();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const token = data.session?.access_token;

  if (token) headers.Authorization = `Bearer ${token}`;

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
