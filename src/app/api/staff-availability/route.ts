import { NextResponse } from "next/server";
import { staffAvailabilitySheet } from "@/lib/toc-data";
import { readSheetSourceConfig, scopedEmptyAvailabilityFeed, syncAvailabilitySheetToDatabase } from "@/lib/sheet-feed-sync";
import { requireTocScope } from "@/lib/toc-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestedScope = new URL(request.url).searchParams.get("scope") || "National";
  const scopePermission = await requireTocScope(request, requestedScope);
  if (scopePermission.error) return scopePermission.error;

  const config = await readSheetSourceConfig("staff-availability", scopePermission.scope);

  if (!config.connected || scopePermission.scope !== config.region) {
    return NextResponse.json(scopedEmptyAvailabilityFeed(scopePermission.scope));
  }

  try {
    const result = await syncAvailabilitySheetToDatabase(config);
    return NextResponse.json(result.feed);
  } catch {
    return NextResponse.json(staffAvailabilitySheet);
  }
}
