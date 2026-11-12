import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { RoomTabs } from "@/components/work/RoomTabs";
import { loadRoomAccess } from "@/lib/work/queries";
import type { Album, AlbumPhoto } from "@/lib/work/types";
import { fmtDate } from "@/lib/format";
import { AlbumView } from "@/components/work/AlbumView";
import { updateAlbum, deleteAlbum } from "../../../../actions";

export const dynamic = "force-dynamic";

export default async function AlbumPage({ params, searchParams }: { params: Promise<{ key: string; albumId: string }>; searchParams: Promise<{ error?: string; edit?: string }> }) {
  const { key, albumId } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const acc = await loadRoomAccess(supabase, key, session);
  if (!acc) notFound();
  if (!acc.isMember) redirect("/work?denied=1");
  const [{ data: album }, { data: photos }] = await Promise.all([
    supabase.from("work_albums").select("*").eq("id", albumId).eq("room_id", acc.room.id).maybeSingle(),
    supabase.from("work_album_photos").select("*, app_users(display_name)").eq("album_id", albumId).order("sort_order").order("created_at"),
  ]);
  if (!album) notFound();
  const a = album as Album;
  const canManage = session.isAdmin || acc.isLead || a.created_by === session.appUser.id;
  const crumbs: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }, { href: `/work/rooms/${key}`, label: acc.room.name }, { href: `/work/rooms/${key}/gallery`, label: "แกลเลอรี" }];
  return (
    <div className="space-y-4">
      <Header crumbs={crumbs} title={a.title} sub={[a.event_date && fmtDate(a.event_date), a.description].filter(Boolean).join(" · ") || undefined} />
      <RoomTabs roomKey={key} tab="gallery" />
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      {canManage && sp.edit && (
        <form action={updateAlbum.bind(null, key, a.id)} className="card p-5 grid sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-2"><label className="label">ชื่ออัลบั้ม</label><input name="title" defaultValue={a.title} className="input" required /></div>
          <div><label className="label">วันที่</label><input type="date" name="event_date" defaultValue={a.event_date ?? ""} className="input" /></div>
          <div><button className="btn-primary">บันทึก</button></div>
          <div className="sm:col-span-4"><input name="description" defaultValue={a.description ?? ""} className="input" placeholder="คำอธิบาย" /></div>
        </form>
      )}
      <AlbumView roomKey={key} roomId={acc.room.id} album={a} photos={(photos ?? []) as AlbumPhoto[]} meId={session.appUser.id} canManage={canManage} deleteAlbumAction={deleteAlbum.bind(null, key, a.id)} />
    </div>
  );
}
