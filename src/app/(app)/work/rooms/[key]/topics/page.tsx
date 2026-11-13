import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Trash2 } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { loadDirectory, fillEmployees, roomRights } from "@/lib/work/queries";
import type { Room, RoomMember, Topic } from "@/lib/work/types";
import { saveTopic, deleteTopic } from "../../../actions";

export const dynamic = "force-dynamic";
const COLORS = ["#452a79", "#7c3aed", "#0363b1", "#06acb4", "#00856b", "#e74f99", "#c2410c", "#e42213", "#8a5a00", "#6b7280"];

export default async function TopicsPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ saved?: string; deleted?: string; error?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const { data: room } = await supabase.from("work_rooms").select("*").eq("key", key).maybeSingle();
  if (!room) notFound();
  const r = room as Room;
  const [{ data: members }, dir, { data: topics }] = await Promise.all([
    supabase.from("work_room_members").select("*, employees(id, first_name, nickname, emp_code)").eq("room_id", r.id),
    loadDirectory(supabase),
    supabase.from("work_topics").select("*").eq("room_id", r.id).order("sort_order").order("name"),
  ]);
  const mem = fillEmployees(members as RoomMember[], dir, "employee_id");
  const myId = session.employee?.id ?? null;
  const rights = await roomRights(supabase, r.id, session.isAdmin);
  const isLead = rights.isLead;
  if (!rights.isMember) redirect("/work?denied=1");
  const canEdit = (empId: string | null) => session.isAdmin || isLead || (!!empId && empId === myId);
  const list = (topics ?? []) as Topic[];
  const groups = [...mem.map((m) => ({ id: m.employee_id as string | null, name: m.employees?.nickname ?? m.employees?.first_name ?? "—" })), { id: null, name: "หัวข้อกลางของห้อง" }];
  const crumbs: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }, { href: `/work/rooms/${key}`, label: r.name }, { href: `/work/rooms/${key}/calendar`, label: "ปฏิทิน" }];

  return (
    <div className="space-y-4">
      <Header crumbs={crumbs} title="หัวข้อ Routine ประจำสัปดาห์" sub="หัวข้องานของแต่ละคน ใช้เลือกตอนลงงานในปฏิทิน — ทุกคนเพิ่ม/ลบหัวข้อของตัวเองได้ หัวหน้าห้องและผู้บริหารแก้ได้ทุกคน" action={<Link href={`/work/rooms/${key}/calendar`} className="btn-outline"><CalendarDays size={16} /> กลับปฏิทิน</Link>} />
      {sp.saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {sp.deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบแล้ว</div>}
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      <div className="grid md:grid-cols-2 gap-4">
        {groups.map((g) => {
          const mine = list.filter((t) => (t.employee_id ?? null) === g.id);
          if (!canEdit(g.id) && !mine.length) return null;
          return (
            <div key={g.id ?? "room"} className="card p-5 space-y-3">
              <h2 className="font-display font-bold">{g.name}</h2>
              <ul className="space-y-1.5">
                {mine.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ background: t.color }} /><span className="flex-1">{t.name}</span>
                    {canEdit(g.id) && <form action={deleteTopic.bind(null, key, t.id)}><button className="text-ink-soft hover:text-red" title="ลบหัวข้อ (งานที่ลงไว้ยังอยู่)"><Trash2 size={13} /></button></form>}
                  </li>))}
                {!mine.length && <li className="text-xs text-ink-soft">ยังไม่มีหัวข้อ</li>}
              </ul>
              {canEdit(g.id) && (
                <form action={saveTopic.bind(null, key)} className="flex flex-wrap items-end gap-2 pt-2 border-t border-line">
                  <input type="hidden" name="room_id" value={r.id} /><input type="hidden" name="employee_id" value={g.id ?? ""} /><input type="hidden" name="sort_order" value={(mine[mine.length - 1]?.sort_order ?? 0) + 1} />
                  <div className="flex-1 min-w-[160px]"><label className="label">เพิ่มหัวข้อ</label><input name="name" className="input" required placeholder="เช่น New Graphic" /></div>
                  <div><label className="label">สี</label><select name="color" className="input w-24" defaultValue={COLORS[mine.length % COLORS.length]}>{COLORS.map((c) => <option key={c} value={c} style={{ color: c }}>{c}</option>)}</select></div>
                  <button className="btn-primary py-2">เพิ่ม</button>
                </form>
              )}
            </div>);
        })}
      </div>
    </div>
  );
}
