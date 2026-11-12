import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus, Images } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { RoomTabs } from "@/components/work/RoomTabs";
import { loadRoomAccess } from "@/lib/work/queries";
import type { Album } from "@/lib/work/types";
import { fmtDate } from "@/lib/format";
import { todayBkk } from "@/lib/today";
import { createAlbum } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function GalleryPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ new?: string; deleted?: string; error?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const acc = await loadRoomAccess(supabase, key, session);
  if (!acc) notFound();
  if (!acc.isMember) redirect("/work?denied=1");
  const { data, error } = await supabase.from("work_albums").select("*, work_album_photos(count)").eq("room_id", acc.room.id).order("event_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  const albums = (data ?? []) as Album[];
  const crumbs: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }, { href: `/work/rooms/${key}`, label: acc.room.name }];
  return (
    <div className="space-y-4">
      <Header crumbs={crumbs} title={`แกลเลอรี · ${acc.room.name}`} sub="รวมรูปเป็นอัลบั้ม — งานอีเวนต์ ออกบูธ ถ่ายสินค้า ผลงาน ทุกคนในห้องเพิ่มรูปได้" action={<Link href={`/work/rooms/${key}/gallery?new=1`} className="btn-primary"><Plus size={16} /> อัลบั้มใหม่</Link>} />
      <RoomTabs roomKey={key} tab="gallery" />
      {sp.deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบอัลบั้มแล้ว</div>}
      {(sp.error || error) && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error ?? `ยังไม่ได้รัน SQL 0025 — ${error?.message}`}</div>}
      {sp.new && (
        <form action={createAlbum.bind(null, key, acc.room.id)} className="card p-5 grid sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-2"><label className="label">ชื่ออัลบั้ม *</label><input name="title" className="input" required autoFocus placeholder="เช่น ออกบูธ Central Chidlom พ.ย. 69" /></div>
          <div><label className="label">วันที่</label><input type="date" name="event_date" defaultValue={todayBkk()} className="input" /></div>
          <div className="flex gap-2"><button className="btn-primary">สร้างแล้วเพิ่มรูป</button><Link href={`/work/rooms/${key}/gallery`} className="btn-outline">ยกเลิก</Link></div>
          <div className="sm:col-span-4"><input name="description" className="input" placeholder="คำอธิบาย (ถ้ามี)" /></div>
        </form>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {albums.map((a) => { const n = a.work_album_photos?.[0]?.count ?? 0; return (
          <Link key={a.id} href={`/work/rooms/${key}/gallery/${a.id}`} className="group block">
            <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-cream ring-1 ring-line relative">
              {a.cover_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.cover_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" /> : <div className="w-full h-full grid place-items-center text-ink-soft/50"><Images size={40} /></div>}
              <span className="absolute right-2 bottom-2 rounded-full bg-ink/70 text-white text-xs px-2 py-0.5">{n} รูป</span>
            </div>
            <div className="mt-2 font-semibold leading-tight">{a.title}</div>
            <div className="text-xs text-ink-soft">{a.event_date ? fmtDate(a.event_date) : fmtDate(a.created_at)}</div>
          </Link>); })}
      </div>
      {!albums.length && !error && !sp.new && <div className="card p-8 text-center text-ink-soft">ยังไม่มีอัลบั้ม — กด &quot;อัลบั้มใหม่&quot;</div>}
    </div>
  );
}
