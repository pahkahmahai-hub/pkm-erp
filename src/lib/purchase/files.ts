import type { SupabaseClient } from "@supabase/supabase-js";

export interface PurchaseFile { id: string; doc_id: string; path: string; file_name: string; mime: string | null; size_bytes: number | null; kind: "quote" | "image" | "other"; note: string | null; uploaded_by: string | null; created_at: string; url: string; from_doc_no: string | null; is_image: boolean }

/** ไฟล์ของเอกสารนี้ + PR ต้นทาง + PO ที่เปิดจากเอกสารนี้ (ดูประวัติครบในที่เดียว) พร้อม signed URL 1 ชม. */
export async function loadPurchaseFiles(supabase: SupabaseClient, docId: string, refDocId: string | null, childIds: string[], docNos: Record<string, string>): Promise<PurchaseFile[]> {
  const ids = [docId, ...(refDocId ? [refDocId] : []), ...childIds];
  const { data, error } = await supabase.from("purchase_doc_files").select("*").in("doc_id", ids).order("created_at", { ascending: false });
  if (error || !data?.length) return [];
  const { data: signed } = await supabase.storage.from("purchase-files").createSignedUrls(data.map((f) => f.path as string), 3600);
  return data.map((f, i) => ({
    ...(f as Omit<PurchaseFile, "url" | "from_doc_no" | "is_image">),
    url: signed?.[i]?.signedUrl ?? "",
    from_doc_no: f.doc_id === docId ? null : docNos[f.doc_id as string] ?? "เอกสารที่เกี่ยวข้อง",
    is_image: String(f.mime ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(String(f.file_name)),
  }));
}
