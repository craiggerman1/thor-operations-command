import { NextResponse } from "next/server";
import { getFleetCompleteAssets } from "@/lib/fleet-complete";
import { requireTocScope } from "@/lib/toc-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedScope = url.searchParams.get("scope") || "National";
  const scopePermission = await requireTocScope(request, requestedScope);
  if (scopePermission.error) return scopePermission.error;

  try {
    const snapshot = await getFleetCompleteAssets(scopePermission.scope, {
      force: url.searchParams.get("refresh") === "true"
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json({
      connected: false,
      source: "Fleet Complete Unity API",
      generatedAt: new Date().toISOString(),
      cacheTtlSeconds: Number(process.env.FLEET_COMPLETE_CACHE_SECONDS || 120),
      scope: scopePermission.scope,
      fleetName: "Fleet Complete",
      totalAssets: 0,
      assets: [],
      summary: [
        { label: "Units loaded", value: "0", detail: "Fleet Complete connection unavailable", severity: "amber" },
        { label: "Moving", value: "0", detail: "No live GPS feed", severity: "blue" },
        { label: "Stale", value: "0", detail: "No stale units detected", severity: "green" },
        { label: "Offline", value: "0", detail: "No offline units detected", severity: "green" }
      ],
      error: error instanceof Error ? error.message : "Fleet Complete asset tracking failed."
    }, { status: 503 });
  }
}
