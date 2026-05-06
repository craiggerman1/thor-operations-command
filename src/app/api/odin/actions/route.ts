import { NextResponse } from "next/server";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { createOdinDirectActionItems } from "@/lib/odin-actions";

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const payload = await request.json().catch(() => ({}));

  try {
    const result = await createOdinDirectActionItems({
      payload,
      actorKind: permission.kind,
      actor: permission.kind === "toc" ? permission.user : undefined
    });

    return NextResponse.json({ connected: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Odin action could not be created." }, { status: 400 });
  }
}
