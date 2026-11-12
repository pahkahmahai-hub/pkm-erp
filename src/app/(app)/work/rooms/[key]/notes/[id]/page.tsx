import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { RoomTabs } from "@/components/work/RoomTabs";
import { loadRoomAccess } from "@/lib/work/queries";
import type { Note } from "@/lib/work/types";
import { fmtDateTime } from "@/lib/format";
import { NoteEditor } from "@/components/work/NoteEditor";

export const dynamic = "force-dynamic";

export default async function NotePage({ params, searchParams }: { params: Promise<{ key: string; id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { key, id } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const acc = await loadRoomAccess(supabase, key, session);
  if (!acc) notFound();
  if (!acc.isMember) redirect("/work?denied=1");
  let note: Note | null = null;
  if (id !== "new") {
    const { data } = await supabase.from("work_notes").select("*, work_note_files(*), app_users!work_notes_created_by_fkey(display_name, email)").eq("id", id).eq("room_id", acc.room.id).maybeSingle();
    if (!data) notFound();
    note = data as Note;
  }
  const canEdit = !note || session.isAdmin || acc.isLead || note.created_by === session.appUser.id;
  const crumbs: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }, { href: `/work/rooms/${key}`, label: acc.room.name }, { href: `/work/rooms/${key}/notes`, label: "โน้ต" }];
  return (
    <div className="space-y-4 max-w-3xl">
      <Header crumbs={crumbs} title={note ? note.title : "โน้ตใหม่"} sub={note ? `โดย ${note.app_users?.display_name ?? note.app_users?.email ?? "—"} · แก้ไขล่าสุด ${fmtDateTime(note.updated_at)}` : acc.room.name} />
      <RoomTabs roomKey={key} tab="notes" />
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      <NoteEditor roomKey={key} roomId={acc.room.id} note={note} canEdit={canEdit} />
    </div>
  );
}
