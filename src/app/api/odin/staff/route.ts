import { NextResponse } from "next/server";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { readOdinStaffEntities } from "@/lib/odin-staff";

export async function GET(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const url = new URL(request.url);
  const includeProtected = url.searchParams.get("includeProtected") !== "false";
  const result = await readOdinStaffEntities({ includeProtected });

  return NextResponse.json({
    connected: result.connected,
    source: result.source,
    error: result.error,
    protectedFieldsIncluded: result.protectedFieldsIncluded,
    count: result.staff.length,
    staff: result.staff,
    instructions: {
      purpose: "Odin staff entities for roster, availability, induction and manager follow-up reasoning.",
      protectedFields: "Contact fields are server/Odin/National only and must not be shown to standard manager views.",
      prohibitedActions: ["message_staff_without_rule", "change_roster_without_approval", "change_user_or_password"]
    }
  }, { status: result.connected || result.staff.length ? 200 : 503 });
}
