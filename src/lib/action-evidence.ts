import { getSupabaseAdminClient } from "@/lib/supabase";

export type ActionEvidenceFile = {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  url: string;
  purpose: string;
};

type EvidenceRow = {
  id: string;
  file_name: string;
  content_type: string;
  file_size: number | null;
  object_path: string;
  bucket: string | null;
  purpose: string | null;
};

export async function signedActionEvidenceFiles(filters: { actionId?: string; requestId?: string }) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  try {
    let query = supabase
      .from("action_evidence_files")
      .select("id,file_name,content_type,file_size,object_path,bucket,purpose")
      .order("created_at", { ascending: true });

    if (filters.requestId) query = query.eq("national_request_id", filters.requestId);
    if (filters.actionId) query = query.eq("action_id", filters.actionId);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data as EvidenceRow[] | null) || [];
    const files = await Promise.all(rows.map(async (row) => {
      const bucket = row.bucket || "action-evidence";
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(row.object_path, 60 * 60 * 24 * 7);
      return {
        id: row.id,
        fileName: row.file_name,
        contentType: row.content_type,
        fileSize: row.file_size || 0,
        url: signed?.signedUrl || "",
        purpose: row.purpose || "closeout"
      };
    }));

    return files.filter((file) => file.url);
  } catch {
    return [];
  }
}

export async function linkEvidenceToNationalRequest(input: { attachmentIds: string[]; actionId: string; requestId: string }) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !input.attachmentIds.length) return;

  await supabase
    .from("action_evidence_files")
    .update({ national_request_id: input.requestId })
    .eq("action_id", input.actionId)
    .in("id", input.attachmentIds);
}
