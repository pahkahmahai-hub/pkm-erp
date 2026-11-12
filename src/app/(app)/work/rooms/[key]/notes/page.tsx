import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus, Pin, Paperclip } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { RoomTabs } from "@/components/work/RoomTabs";
import { loadRoomAccess } from "@/lib/work/queries";
import type { Note } from "@/lib/work/types";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function NotesPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ q?: string; deleted?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const acc = await loadRoomAccess(supabase, key, session);
  if (!acc) notFound();
  if (!acc.isMember) redirect("/work?denied=1");
  let qb = supabase.from("work_notes").select("*, work_note_files(id, url, is_image, sort_order), app_users!work_notes_created_by_fkey(display_name, email)").eq("room_id", acc.room.id).order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(300);
  const q = (sp.q ?? "").trim();
  if (q) qb = qb.or(`title.ilike.%${q.replace(/[%,()]/g, " ")}%,body.ilike.%${q.replace(/[%,()]/g, " ")}%`);
  const { data, error } = await qb;
  const notes = (data ?? []) as Note[];
  const crumbs: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }, { href: `/work/rooms/${key}`, label: acc.room.name }];

  return (
    <div className="space-y-4">
      <Header crumbs={crumbs} title={`โน้ต · ${acc.room.name}`} sub="บันทึกข้อความ ข้อมูลอ้างอิง ขั้นตอน รหัส/ลิงก์ที่ใช้บ่อย พร้อมแนบรูป — ทุกคนในห้องเห็น" action={<Link href={`/work/rooms/${key}/notes/new`} className="btn-primary"><Plus size={16} /> โน้ตใหม่</Link>} />
      <RoomTabs roomKey={key} tab="notes" />
      {sp.deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบโน้ตแล้ว</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">ยังไม่ได้รัน SQL 0025 — {error.message}</div>}
      <form><input name="q" defaultValue={q} className="input max-w-sm" placeholder="ค้นหาในโน้ต…" /></form>
      <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 [&>*]:mb-4">
        {notes.map((n) => {
          const imgs = (n.work_note_files ?? []).filter((f) => f.is_image).sort((a, b) => a.sort_order - b.sort_order);
          const others = (n.work_note_files ?? []).length - imgs.length;
          return (
            <Link key={n.id} href={`/work/rooms/${key}/notes/${n.id}`} className="block break-inside-avoid rounded-2xl border border-line p-4 shadow-sm hover:shadow-md transition" style={{ background: n.color }}>
              <div className="flex items-start gap-2"><h2 className="font-display font-bold flex-1 leading-snug">{n.title}</h2>{n.pinned && <Pin size={14} className="text-purple shrink-0 mt-1" />}</div>
              {n.body && <p className="text-sm text-ink/80 whitespace-pre-wrap line-clamp-6 mt-1.5">{n.body}</p>}
              {imgs.length > 0 && <div className={`mt-3 grid gap-1 ${imgs.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>{imgs.slice(0, imgs.length === 1 ? 1 : 3).map((f) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={f.id} src={f.url} alt="" className={`w-full rounded-lg object-cover ${imgs.length === 1 ? "max-h-48" : "aspect-square"}`} />)}</div>}
              <div className="mt-3 flex items-center justify-between text-[11px] text-ink-soft"><span>{n.app_users?.display_name ?? n.app_users?.email ?? ""} · {fmtDateTime(n.updated_at)}</span><span className="flex items-center gap-2">{imgs.length > 3 && `+${imgs.length - 3} รูป`}{others > 0 && <span className="flex items-center gap-0.5"><Paperclip size={11} />{others}</span>}</span></div>
            </Link>);
        })}
      </div>
      {!notes.length && !error && <div className="card p-8 text-center text-ink-soft">{q ? "ไม่พบโน้ตที่ค้นหา" : "ยังไม่มีโน้ตในห้องนี้ — กด \"โน้ตใหม่\" เพื่อเริ่ม"}</div>}
    </div>
  );
}
