"use client";

import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";

export interface Uploaded { url: string; name: string; is_image: boolean }

/** อัปโหลดหลายไฟล์จากเบราว์เซอร์ตรงไป storage (ย่อรูปก่อน) — ไม่ผ่าน server action จึงไม่ติดขนาด body */
export async function uploadRoomFiles(roomId: string, files: File[], onProgress?: (done: number, total: number) => void): Promise<Uploaded[]> {
  const supabase = createClient();
  const out: Uploaded[] = [];
  let done = 0;
  for (const raw of files) {
    const isImage = raw.type.startsWith("image/");
    const f = isImage ? await compressImage(raw, 2000, 0.85) : raw;
    if (f.size > 25 * 1024 * 1024) throw new Error(`${raw.name} ใหญ่เกิน 25 MB`);
    const ext = (f.name.split(".").pop() ?? "bin").toLowerCase();
    const path = `rooms/${roomId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("work-files").upload(path, f, { contentType: f.type || undefined });
    if (error) throw new Error(error.message);
    out.push({ url: supabase.storage.from("work-files").getPublicUrl(path).data.publicUrl, name: raw.name, is_image: isImage });
    onProgress?.(++done, files.length);
  }
  return out;
}

export const isImageUrl = (u: string) => /\.(png|jpe?g|gif|webp|avif|heic)(\?|$)/i.test(u);
