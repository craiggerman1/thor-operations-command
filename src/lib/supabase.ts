import { createClient } from "@supabase/supabase-js";

type RegionRow = {
  id: string;
  name: string;
  is_active: boolean;
};

export type SupabaseRegionsStatus = {
  configured: boolean;
  connected: boolean;
  regionCount: number;
  message: string;
};

export async function getSupabaseRegionsStatus(): Promise<SupabaseRegionsStatus> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      configured: false,
      connected: false,
      regionCount: 0,
      message: "Supabase environment variables are not configured for this deployment."
    };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data, error } = await supabase
      .from("regions")
      .select("id,name,is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return {
        configured: true,
        connected: false,
        regionCount: 0,
        message: error.message
      };
    }

    return {
      configured: true,
      connected: true,
      regionCount: (data as RegionRow[] | null)?.length || 0,
      message: "Regions table read connected."
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      regionCount: 0,
      message: error instanceof Error ? error.message : "Unknown Supabase connection error."
    };
  }
}
