import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { getProductivitySiteSlug } from "@/lib/productivity-utils";

type ProductivitySiteRow = {
  id: string;
  site_name: string;
  productivity_score: number | null;
  latest_note: string | null;
  created_at: string;
  updated_at: string;
  region?: { name: string } | { name: string }[] | null;
};

type ProductivityResponseRow = {
  response: string;
  created_at: string;
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function mapSite(row: ProductivitySiteRow, latestResponse?: ProductivityResponseRow | null) {
  const region = firstRelated(row.region);
  const site = row.site_name;
  const productivityScore = Math.round(Number(row.productivity_score ?? 0));

  return {
    id: row.id,
    site,
    slug: getProductivitySiteSlug(site),
    region: region?.name || "National",
    productivityScore,
    queue: row.latest_note || "No productivity queue currently loaded.",
    action: row.latest_note || "Review site productivity and record manager action where needed.",
    units: 0,
    labourHours: 0,
    latestNote: row.latest_note || "",
    latestResponse: latestResponse?.response || "",
    latestResponseAt: latestResponse?.created_at || "",
    updatedAt: row.updated_at
  };
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ sites: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");

  const { data, error } = await supabase
    .from("productivity_sites")
    .select("id,site_name,productivity_score,latest_note,created_at,updated_at,region:regions(name)")
    .order("site_name", { ascending: true });

  if (error) {
    return NextResponse.json({ sites: [], connected: false, error: error.message }, { status: 500 });
  }

  const rows = ((data as ProductivitySiteRow[] | null) || []);
  const filteredRows = slug ? rows.filter((row) => getProductivitySiteSlug(row.site_name) === slug) : rows;
  const siteIds = filteredRows.map((row) => row.id);
  let responses: Record<string, ProductivityResponseRow | null> = {};

  if (siteIds.length) {
    const { data: responseData, error: responseError } = await supabase
      .from("productivity_responses")
      .select("productivity_site_id,response,created_at")
      .in("productivity_site_id", siteIds)
      .order("created_at", { ascending: false });

    if (responseError) {
      return NextResponse.json({ sites: [], connected: false, error: responseError.message }, { status: 500 });
    }

    responses = ((responseData as (ProductivityResponseRow & { productivity_site_id: string })[] | null) || []).reduce((lookup, response) => {
      if (!lookup[response.productivity_site_id]) lookup[response.productivity_site_id] = response;
      return lookup;
    }, {} as Record<string, ProductivityResponseRow | null>);
  }

  return NextResponse.json({
    sites: filteredRows.map((row) => mapSite(row, responses[row.id])),
    connected: true
  });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  const payload = await request.json();
  const siteId = payload.siteId;
  const response = String(payload.response || "").trim();

  if (!siteId) return NextResponse.json({ error: "Productivity site id is required." }, { status: 400 });
  if (!response) return NextResponse.json({ error: "Manager response cannot be empty." }, { status: 400 });

  const { error } = await supabase.from("productivity_responses").insert({
    productivity_site_id: siteId,
    response
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return GET(new Request(`${request.url}?slug=${encodeURIComponent(payload.slug || "")}`));
}
