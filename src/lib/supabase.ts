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

type StockOrderItemRow = {
  item_name: string;
};

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function getSupabaseRegionsStatus(): Promise<SupabaseRegionsStatus> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return {
      configured: false,
      connected: false,
      regionCount: 0,
      message: "Supabase environment variables are not configured for this deployment."
    };
  }

  try {
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

export async function getApprovedStockItems(fallbackItems: string[]) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) return fallbackItems;

  try {
    const { data, error } = await supabase
      .from("stock_order_items")
      .select("item_name")
      .eq("is_active", true)
      .order("item_name", { ascending: true });

    if (error) return fallbackItems;

    const stockItems = ((data as StockOrderItemRow[] | null) || [])
      .map((item) => item.item_name)
      .filter(Boolean);

    return stockItems.length ? stockItems : fallbackItems;
  } catch {
    return fallbackItems;
  }
}
