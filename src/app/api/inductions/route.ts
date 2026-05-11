import { NextResponse } from "next/server";
import { staffInductionsSheet } from "@/lib/toc-data";
import { readSheetSourceConfig, scopedEmptyInductionFeed, syncInductionSheetToDatabase } from "@/lib/sheet-feed-sync";
import { requireTocScope } from "@/lib/toc-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestedScope = new URL(request.url).searchParams.get("scope") || "National";
  const scopePermission = await requireTocScope(request, requestedScope);
  if (scopePermission.error) return scopePermission.error;

  const config = await readSheetSourceConfig("inductions", scopePermission.scope);

  if (!config.connected || scopePermission.scope !== config.region) {
    return NextResponse.json(scopedEmptyInductionFeed(scopePermission.scope));
  }

  try {
    const result = await syncInductionSheetToDatabase(config);
    return NextResponse.json(result.feed);
  } catch {
    return NextResponse.json(staffInductionsSheet);
  }
}
