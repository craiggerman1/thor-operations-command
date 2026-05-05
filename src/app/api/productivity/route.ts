import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { requireTocNationalAccess, requireTocScope, requireTocUser } from "@/lib/toc-auth";
import { getProductivitySiteSlug } from "@/lib/productivity-utils";

type ProductivitySiteRow = {
  id: string;
  site_name: string;
  region_id?: string | null;
  productivity_score: number | null;
  latest_note: string | null;
  linked_action_id?: string | null;
  created_at: string;
  updated_at: string;
  region?: { name: string } | { name: string }[] | null;
};

type RegionRow = {
  id: string;
  name: string;
};

type ProductivityResponseRow = {
  response: string;
  created_at: string;
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function clampScore(value: unknown) {
  const score = Math.round(Number(value));
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

async function getRegionId(regionName: string) {
  if (!regionName || regionName === "National") return null;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("regions")
    .select("id,name")
    .eq("name", regionName)
    .maybeSingle();

  if (error) throw error;
  return (data as RegionRow | null)?.id || null;
}

function scopedRequest(request: Request, payload: Record<string, unknown>) {
  const url = new URL(request.url);
  if (payload.all === true) {
    url.searchParams.set("all", "true");
  } else if (typeof payload.scope === "string" && payload.scope) {
    url.searchParams.set("scope", payload.scope);
  }
  if (typeof payload.slug === "string" && payload.slug) {
    url.searchParams.set("slug", payload.slug);
  }

  return new Request(url, { method: "GET", headers: request.headers });
}

function productivityActionPriority(score: number) {
  if (score < 40) return { directive: "National Ops Directive", priority: "urgent" };
  if (score < 50) return { directive: "National Ops Directive", priority: "high" };
  return { directive: "Scheduled Directive", priority: "normal" };
}

async function syncLinkedAction(site: ProductivitySiteRow) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const score = clampScore(site.productivity_score);
  const shouldHaveAction = score < 80;
  const actionConfig = productivityActionPriority(score);
  const title = `Productivity action: ${site.site_name}`;
  const detail = site.latest_note || `${site.site_name} requires productivity improvement action.`;

  if (shouldHaveAction && site.linked_action_id) {
    const { error } = await supabase
      .from("action_items")
      .update({
        title,
        detail,
        source_page: "productivity",
        directive_type: actionConfig.directive,
        priority: actionConfig.priority,
        status: "open",
        assigned_region_id: site.region_id || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", site.linked_action_id);

    if (error) throw error;
    return site.linked_action_id;
  }

  if (shouldHaveAction) {
    const { data, error } = await supabase
      .from("action_items")
      .insert({
        title,
        detail,
        source_page: "productivity",
        directive_type: actionConfig.directive,
        priority: actionConfig.priority,
        status: "open",
        assigned_region_id: site.region_id || null,
        due_at: null
      })
      .select("id")
      .single();

    if (error) throw error;
    const { error: linkError } = await supabase
      .from("productivity_sites")
      .update({ linked_action_id: data.id, updated_at: new Date().toISOString() })
      .eq("id", site.id);
    if (linkError) throw linkError;
    return data.id as string;
  }

  if (!shouldHaveAction && site.linked_action_id) {
    const { error: actionError } = await supabase.from("action_items").delete().eq("id", site.linked_action_id);
    if (actionError) throw actionError;
    const { error: unlinkError } = await supabase
      .from("productivity_sites")
      .update({ linked_action_id: null, updated_at: new Date().toISOString() })
      .eq("id", site.id);
    if (unlinkError) throw unlinkError;
  }

  return null;
}

async function syncNationalProductivityResponse(site: ProductivitySiteRow, response: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const title = `Productivity response: ${site.site_name}`;
  const requestPayload = {
    request_type: "manager_update",
    title,
    detail: response,
    status: "awaiting_review",
    source_action_id: site.linked_action_id || null,
    assigned_region_id: site.region_id || null,
    manager_response: response,
    evidence: "Manager productivity response submitted from the Productivity page.",
    source_page: "productivity",
    directive_type: "Scheduled Directive",
    national_response: null,
    reviewed_at: null,
    updated_at: new Date().toISOString()
  };

  let existingRequestId: string | null = null;

  if (site.linked_action_id) {
    const { data, error } = await supabase
      .from("national_requests")
      .select("id")
      .eq("request_type", "manager_update")
      .eq("source_action_id", site.linked_action_id)
      .in("status", ["awaiting_review", "returned"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    existingRequestId = data?.id || null;
  }

  if (!existingRequestId) {
    let requestLookup = supabase
      .from("national_requests")
      .select("id")
      .eq("request_type", "manager_update")
      .eq("title", title)
      .in("status", ["awaiting_review", "returned"])
      .order("created_at", { ascending: false })
      .limit(1);

    requestLookup = site.region_id ? requestLookup.eq("assigned_region_id", site.region_id) : requestLookup.is("assigned_region_id", null);

    const { data, error } = await requestLookup.maybeSingle();

    if (error) throw error;
    existingRequestId = data?.id || null;
  }

  if (existingRequestId) {
    const { error } = await supabase
      .from("national_requests")
      .update(requestPayload)
      .eq("id", existingRequestId);

    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("national_requests").insert(requestPayload);
  if (error) throw error;
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
    actionHref: row.linked_action_id ? `/actions/${row.linked_action_id}` : "",
    updatedAt: row.updated_at
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scopePermission = await requireTocScope(request, url.searchParams.get("scope") || (url.searchParams.get("all") === "true" ? "National" : null));
  if (scopePermission.error) return scopePermission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ sites: [], connected: false, error: "Supabase server key is not configured." }, { status: 503 });
  }

  const slug = url.searchParams.get("slug");
  const scope = scopePermission.scope;
  const showAll = url.searchParams.get("all") === "true" || scope === "National";

  const { data, error } = await supabase
    .from("productivity_sites")
    .select("id,site_name,region_id,productivity_score,latest_note,linked_action_id,created_at,updated_at,region:regions(name)")
    .order("site_name", { ascending: true });

  if (error) {
    return NextResponse.json({ sites: [], connected: false, error: error.message }, { status: 500 });
  }

  const rows = ((data as ProductivitySiteRow[] | null) || []);
  const filteredRows = rows.filter((row) => {
    const region = firstRelated(row.region)?.name || "National";
    const matchesSlug = !slug || getProductivitySiteSlug(row.site_name) === slug;
    const matchesScope = showAll || region === scope;
    return matchesSlug && matchesScope;
  });
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
  const payload = await request.json();
  const action = payload.action || "response";
  const nationalOnlyActions = new Set(["createSite", "updateSite", "deleteSite"]);
  const permission = nationalOnlyActions.has(action)
    ? await requireTocNationalAccess(request)
    : await requireTocUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });
  }

  if (action === "createSite") {
    const siteName = String(payload.siteName || "").trim();
    if (!siteName) return NextResponse.json({ error: "Productivity site name is required." }, { status: 400 });

    const { data, error } = await supabase
      .from("productivity_sites")
      .insert({
        site_name: siteName,
        region_id: await getRegionId(payload.region || "National"),
        productivity_score: clampScore(payload.productivityScore),
        latest_note: payload.latestNote || "Review site productivity and record manager action where needed."
      })
      .select("id,site_name,region_id,productivity_score,latest_note,linked_action_id,created_at,updated_at,region:regions(name)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await syncLinkedAction(data as ProductivitySiteRow);
    return GET(scopedRequest(request, payload));
  }

  if (action === "updateSite") {
    if (!payload.id) return NextResponse.json({ error: "Productivity site id is required." }, { status: 400 });
    const updates = payload.updates || {};
    const dbUpdates: Record<string, string | number | null> = { updated_at: new Date().toISOString() };

    if (typeof updates.siteName === "string") dbUpdates.site_name = updates.siteName.trim();
    if (typeof updates.region === "string") dbUpdates.region_id = await getRegionId(updates.region);
    if (typeof updates.productivityScore !== "undefined") dbUpdates.productivity_score = clampScore(updates.productivityScore);
    if (typeof updates.latestNote === "string") dbUpdates.latest_note = updates.latestNote;

    const { data, error } = await supabase
      .from("productivity_sites")
      .update(dbUpdates)
      .eq("id", payload.id)
      .select("id,site_name,region_id,productivity_score,latest_note,linked_action_id,created_at,updated_at,region:regions(name)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await syncLinkedAction(data as ProductivitySiteRow);
    return GET(scopedRequest(request, payload));
  }

  if (action === "deleteSite") {
    if (!payload.id) return NextResponse.json({ error: "Productivity site id is required." }, { status: 400 });

    const { data: site, error: readError } = await supabase
      .from("productivity_sites")
      .select("linked_action_id")
      .eq("id", payload.id)
      .maybeSingle();

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

    const { error: responseError } = await supabase.from("productivity_responses").delete().eq("productivity_site_id", payload.id);
    if (responseError) return NextResponse.json({ error: responseError.message }, { status: 500 });

    const { error } = await supabase.from("productivity_sites").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (site?.linked_action_id) {
      const { error: actionError } = await supabase.from("action_items").delete().eq("id", site.linked_action_id);
      if (actionError) return NextResponse.json({ error: actionError.message }, { status: 500 });
    }

    return GET(scopedRequest(request, payload));
  }

  const siteId = payload.siteId;
  const response = String(payload.response || "").trim();

  if (!siteId) return NextResponse.json({ error: "Productivity site id is required." }, { status: 400 });
  if (!response) return NextResponse.json({ error: "Manager response cannot be empty." }, { status: 400 });

  const { data: site, error: siteError } = await supabase
    .from("productivity_sites")
    .select("id,site_name,region_id,productivity_score,latest_note,linked_action_id,created_at,updated_at,region:regions(name)")
    .eq("id", siteId)
    .maybeSingle();

  if (siteError) return NextResponse.json({ error: siteError.message }, { status: 500 });
  if (!site) return NextResponse.json({ error: "Productivity site was not found." }, { status: 404 });

  const { error } = await supabase.from("productivity_responses").insert({
    productivity_site_id: siteId,
    response
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await syncNationalProductivityResponse(site as ProductivitySiteRow, response);

  return GET(scopedRequest(request, payload));
}
