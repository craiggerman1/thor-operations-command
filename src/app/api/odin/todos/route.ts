import { NextResponse } from "next/server";
import { requireOdinOrTocNationalUser } from "@/lib/odin-auth";
import { handleOdinTodoItems } from "@/lib/odin-todos";

export async function POST(request: Request) {
  const permission = await requireOdinOrTocNationalUser(request);
  if (permission.error) return permission.error;

  const payload = await request.json().catch(() => ({}));

  try {
    const result = await handleOdinTodoItems({
      payload,
      actorKind: permission.kind,
      actor: permission.kind === "toc" ? permission.user : undefined
    });

    return NextResponse.json({ connected: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Odin To Do request could not be completed." }, { status: 400 });
  }
}
