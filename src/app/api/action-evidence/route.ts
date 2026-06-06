import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { canAccessScope, requireTocUser } from "@/lib/toc-auth";
import { signedActionEvidenceFiles } from "@/lib/action-evidence";

type ActionRow = {
  id: string;
  assigned_region_id: string | null;
  region?: { name: string } | { name: string }[] | null;
};

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "evidence-file";
}

export async function POST(request: Request) {
  const permission = await requireTocUser(request);
  if (permission.error) return permission.error;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured." }, { status: 503 });

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Upload form data is required." }, { status: 400 });

  const actionId = String(formData.get("actionId") || "");
  const purpose = String(formData.get("purpose") || "closeout") === "blocked" ? "blocked" : "closeout";
  const file = formData.get("file");

  if (!actionId) return NextResponse.json({ error: "Action id is required." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a photo or evidence file to upload." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Evidence file must be 10MB or smaller." }, { status: 400 });

  const { data: actionRow, error: actionError } = await supabase
    .from("action_items")
    .select("id,assigned_region_id,region:regions(name)")
    .eq("id", actionId)
    .maybeSingle();

  if (actionError) return NextResponse.json({ error: actionError.message }, { status: 500 });
  if (!actionRow) return NextResponse.json({ error: "Action item was not found." }, { status: 404 });

  const region = firstRelated((actionRow as ActionRow).region)?.name || "National";
  if (!canAccessScope(permission.user, region)) {
    return NextResponse.json({ error: "You do not have permission to upload evidence for this action." }, { status: 403 });
  }

  const objectPath = `${actionId}/${Date.now()}-${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from("action-evidence")
    .upload(objectPath, file, { contentType: file.type || "application/octet-stream", upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: evidenceRow, error: insertError } = await supabase
    .from("action_evidence_files")
    .insert({
      action_id: actionId,
      bucket: "action-evidence",
      object_path: objectPath,
      file_name: file.name,
      content_type: file.type || "application/octet-stream",
      file_size: file.size,
      uploaded_by: permission.user.id || null,
      purpose
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const files = await signedActionEvidenceFiles({ actionId });
  return NextResponse.json({ attachment: files.find((item) => item.id === evidenceRow.id) || null, attachments: files, connected: true });
}
