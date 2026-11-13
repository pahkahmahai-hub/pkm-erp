"use client";

import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";

export interface UpFile { path: string; kind: "bill" | "slip" | "other"; url: string; name: string }

/** อัปโหลดรูปบิล/สลิปเข้า bucket expense-files (ย่อรูปก่อน) */
export async function uploadExpenseFiles(files: File[], kind: UpFile["kind"]): Promise<UpFile[]> {
  const supabase = createClient();
  const out: UpFile[] = [];
  for (const raw of files) {
    const isPdf = raw.type === "application/pdf";
    const f = isPdf ? raw : await compressImage(raw, 2000, 0.85);
    const d = new Date();
    const path = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${isPdf ? "pdf" : "jpg"}`;
    const { error } = await supabase.storage.from("expense-files").upload(path, f, { contentType: isPdf ? "application/pdf" : "image/jpeg" });
    if (error) throw new Error(error.message);
    out.push({ path, kind, url: isPdf ? "" : URL.createObjectURL(f), name: raw.name });
  }
  return out;
}
