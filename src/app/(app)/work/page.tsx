import { PushToggle } from "@/components/work/PushToggle";
import Link from "next/link";
import { TaskSearchBox } from "@/components/work/TaskSearchBox";
import { Plus, Bell } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, Stat } from "@/components/ui";
import { TaskCard } from "@/components/work/TaskCard";
import { myRooms, ensureRoutines, TASK_SELECT, isOverdue, loadDirectory, fillEmployees, isFutureRoutine, withUnread } from "@/lib/work/queries";
import type { Task } from "@/lib/work/types";
import { fmtDate, fmtDateShort, todayBkk } from "@/lib/format";

export const dynamic = "force-dynamic";
const GC_KEYS = ["gc-room", "graphic", "visual", "content"];
const SW_KEYS = ["sw-room", "office", "operation", "online"];
const MAIN_ROOMS = ["teamwork", "gc-room", "sw-room"];

export default async function WorkHome() {
  const session = await getSession();
  const supabase = await createClient();
  await ensureRoutines(supabase);
  const rooms = await myRooms(supabase, session.employee?.id ?? null, session.isAdmin);
  const empId = session.employee?.id;

  const [{ data: tasksRaw }, { count: unread }, { data: chatUnread }, dir, { data: adminList }] = await Promise.all([
    supabase.from("work_tasks").select(TASK_SELECT).not("status", "in", "(accepted,cancelled)").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500),
    supabase.from("work_notifications").select("id", { count: "exact", head: true }).eq("user_id", session.appUser.id).is("read_at", null),
    supabase.rpc("room_unread_counts"),
    loadDirectory(supabase),
    supabase.from("app_users").select("id, display_name, email").eq("role", "admin"),
  ]);
  // ขั้นตอนในเช็คลิสต์ที่ได้รับมอบหมาย (รวมงานของห้อง/แผนกอื่น) — 0052/0053
  const { data: mySteps } = await supabase.from("work_checklist").select("id, label, due_date, task_id, work_tasks(task_no, title, status, work_rooms(name, color))")
    .or(empId ? `assignee_id.eq.${empId},assignee_user_id.eq.${session.appUser.id}` : `assignee_user_id.eq.${session.appUser.id}`)
    .eq("is_done", false).order("due_date", { ascending: true, nullsFirst: false }).limit(30);
  const steps = ((mySteps ?? []) as unknown as { id: string; label: string; due_date: string | null; task_id: string; work_tasks: { task_no: number; title: string; status: string; work_rooms: { name: string; color: string } | null } | null }[])
    .filter((x) => x.work_tasks && !["accepted", "cancelled"].includes(x.work_tasks.status));
  const todayStr = todayBkk();
  // ขั้นตอนออเดอร์ Corporate ที่มอบหมายให้ผู้บริหาร (ไม่มีงานใน WORK) — 0066
  const { data: corpMine } = await supabase.from("corp_item_steps").select("id, label, due_date, order_id, corp_orders(order_no, customer_name, customer_label), corp_order_items(line_code, name)").eq("assignee_user_id", session.appUser.id).eq("status", "todo").order("due_date", { ascending: true, nullsFirst: false }).limit(30);
  const corpSteps = (corpMine ?? []) as unknown as { id: string; label: string; due_date: string | null; order_id: string; corp_orders: { order_no: string; customer_name: string; customer_label: string | null } | null; corp_order_items: { line_code: string | null; name: string } | null }[];
  // ข้อมูลสำหรับแยก "รอตรวจรับ" (ผู้บริหาร): หัวหน้าห้อง และ user ↔ พนักงาน
  const [{ data: leadRows }, { data: userRows }] = session.isAdmin
    ? await Promise.all([
        supabase.from("work_room_members").select("room_id, employee_id").eq("is_lead", true),
        supabase.from("app_users").select("id, employee_id, role"),
      ])
    : [{ data: [] }, { data: [] }];
  // ห้องย่อย → หัวหน้าห้องหลักตรวจได้ด้วย (0028)
  const { data: roomParents } = session.isAdmin ? await supabase.from("work_rooms").select("*") : { data: [] };
  const rp = (roomParents ?? []) as { id: string; key: string; parent_key?: string | null }[];
  const parentIdOf = new Map(rp.filter((x) => x.parent_key).map((x) => [x.id, rp.find((p) => p.key === x.parent_key)?.id]));
  const unreadByRoom = Object.fromEntries(((chatUnread ?? []) as { room_id: string; unread: number }[]).map((x) => [x.room_id, x.unread]));
  const tasks = await withUnread(supabase, fillEmployees(tasksRaw as Task[], dir, "assignee_id").filter((t) => !isFutureRoutine(t)));   // งานประจำโชว์เฉพาะสัปดาห์นี้
  const mine = tasks.filter((t) => t.assignee_id === empId || (!!empId && (t.co_assignee_ids ?? []).includes(empId)));
  // ห้องที่ฉันเป็นหัวหน้า ★ — เห็นงานค้าง/ตรวจรับของลูกทีมในห้องนั้น (ยกเว้นงานของตัวเอง ซึ่งผู้บริหารตรวจ)
  const leadRoomIds = new Set(rooms.filter((r) => r.is_lead).map((r) => r.id));
  // ผู้บริหารเห็นงานค้างที่สั่งไปทั้งหมด แม้ไม่ได้สั่งเอง · หัวหน้าเห็นของลูกทีมในห้อง + ที่ตัวเองสั่ง
  const assignedByMe = tasks.filter((t) => t.assignee_id !== empId && (session.isAdmin || t.created_by === session.appUser.id || leadRoomIds.has(t.room_id)));
  // แยกงานที่สั่งตามผู้สั่ง: ฉัน / ผู้บริหารอีกคน / หัวหน้า-ทีม / งานประจำที่ระบบสร้าง
  const otherAdmins = new Map(((adminList ?? []) as { id: string; display_name: string | null; email: string }[]).filter((u) => u.id !== session.appUser.id).map((u) => [u.id, u.display_name ?? u.email]));
  const byOrderer = (list: Task[]) => {
    const groups: { key: string; label: string; tone: string; list: Task[] }[] = [
      { key: "me", label: session.isAdmin ? "ผมสั่ง (ฉัน)" : "ฉันสั่ง", tone: "text-purple", list: [] },
      ...[...otherAdmins].map(([id, name]) => ({ key: id, label: `${name} สั่ง`, tone: "text-coral", list: [] as Task[] })),
      { key: "lead", label: "หัวหน้า / ทีมสั่ง", tone: "text-green", list: [] },
      { key: "routine", label: "งานประจำ (ระบบสร้างให้)", tone: "text-ink-soft", list: [] },
    ];
    for (const t of list) {
      const k = t.routine_id ? "routine" : t.created_by === session.appUser.id ? "me" : t.created_by && otherAdmins.has(t.created_by) ? t.created_by : "lead";
      groups.find((g) => g.key === k)!.list.push(t);
    }
    return groups.filter((g) => g.list.length);
  };
  const review = tasks.filter((t) => t.status === "done" && t.assignee_id !== empId && (session.isAdmin || t.created_by === session.appUser.id || leadRoomIds.has(t.room_id)));
  // ผู้บริหาร: แยกงานที่หัวหน้าตรวจรับได้ด้วย ออกจากงานที่ผู้บริหารต้องตรวจเอง
  //   หัวหน้าตรวจได้ = มีหัวหน้า ★ ในห้องที่ไม่ใช่ผู้รับงาน หรือผู้สั่งเป็นพนักงาน (ไม่ใช่ผู้บริหาร/ไม่ใช่ผู้รับงานเอง)
  const users = (userRows ?? []) as { id: string; employee_id: string | null; role: string }[];
  const empOfUser = new Map(users.map((u) => [u.id, u.employee_id]));
  const adminIds = new Set(users.filter((u) => u.role === "admin").map((u) => u.id));
  const nameOfEmp = (id: string) => { const e = dir.find((x) => x.id === id); return e ? e.nickname ?? e.first_name : "หัวหน้า"; };
  const coReviewers = (t: Task): string[] => {
    const out = new Set<string>();
    const pid = parentIdOf.get(t.room_id);
    for (const l of (leadRows ?? []) as { room_id: string; employee_id: string }[]) if ((l.room_id === t.room_id || (pid && l.room_id === pid)) && l.employee_id !== t.assignee_id) out.add(nameOfEmp(l.employee_id));
    if (t.created_by && !adminIds.has(t.created_by)) { const e = empOfUser.get(t.created_by); if (e && e !== t.assignee_id) out.add(nameOfEmp(e)); }
    return [...out];
  };
  const reviewShared = session.isAdmin ? review.filter((t) => coReviewers(t).length) : [];
  const reviewAdminOnly = session.isAdmin ? review.filter((t) => !coReviewers(t).length) : review;
  const overdue = tasks.filter(isOverdue);
  const countByRoom = Object.fromEntries(rooms.map((r) => [r.id, tasks.filter((t) => t.room_id === r.id).length]));

  return (
    <div className="space-y-6">
      <Header crumbs={[]} title="งาน" sub={fmtDate(todayBkk(), { weekday: "long" })} action={
        <div className="flex flex-wrap gap-2">
          <TaskSearchBox className="w-64" />
          <Link href="/work/notifications" className="btn-outline relative"><Bell size={16} /> แจ้งเตือน{(unread ?? 0) > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red text-white text-[10px] rounded-full h-5 min-w-5 px-1 grid place-items-center">{unread}</span>}</Link>
          <Link href="/work/tasks/new" className="btn-primary"><Plus size={16} /> สั่งงาน</Link>
        </div>
      } />
      <PushToggle compact />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="งานของฉัน" value={mine.length} tone="purple" />
        <Stat label="เลยกำหนด" value={overdue.length} tone="coral" />
        <Stat label="รอฉันตรวจรับ" value={review.length} tone="teal" />
        <Stat label={session.isAdmin ? "งานที่สั่งไป (ค้าง)" : "ที่ฉันสั่ง (ค้าง)"} value={assignedByMe.length} tone="yellow" />
      </div>

      <section className="space-y-4">
        {(() => {
          type R = (typeof rooms)[number] & { parent_key?: string | null };
          const card = (r: R, big: boolean) => (
            <Link key={r.id} href={`/work/rooms/${r.key}`} className={`card flex items-center gap-3 hover:border-purple transition ${big ? "p-5" : "p-4"}`}>
              <div className={`${big ? "h-12 w-12 text-lg" : "h-10 w-10"} rounded-xl text-white grid place-items-center font-display font-bold shrink-0`} style={{ background: r.color }}>{r.name[0]}</div>
              <div className="min-w-0 flex-1"><div className="font-semibold truncate">{r.name}</div><div className="text-xs text-ink-soft">{countByRoom[r.id] ?? 0} งานค้าง</div></div>
              {(unreadByRoom[r.id] ?? 0) > 0 && <Link href={`/work/rooms/${r.key}?tab=chat`} className="bg-red text-white text-[11px] rounded-full px-2 py-0.5 font-semibold">{unreadByRoom[r.id]} แชท</Link>}
            </Link>
          );
          const main = (rooms as R[]).filter((r) => MAIN_ROOMS.includes(r.key));
          const subs = (rooms as R[]).filter((r) => !MAIN_ROOMS.includes(r.key));
          // ห้องย่อยแบ่ง 2 ฝั่งตามแผนก (ตาม parent_key · สำรองด้วยรายชื่อห้อง)
          const DEPT: Record<string, string> = { graphic: "gc-room", visual: "gc-room", content: "gc-room", office: "sw-room", operation: "sw-room", online: "sw-room" };
          const deptOf = (r: R) => r.parent_key ?? DEPT[r.key] ?? "other";
          const sides = [
            { key: "gc-room", title: "ทีม GC", sub: "Graphic & Content" },
            { key: "sw-room", title: "ทีม SW", sub: "Sale & Warehouse" },
          ].map((d) => ({ ...d, list: subs.filter((r) => deptOf(r) === d.key) })).filter((d) => d.list.length);
          const others = subs.filter((r) => !["gc-room", "sw-room"].includes(deptOf(r)));
          return (<>
            {main.length > 0 && <div>
              <h2 className="font-display font-bold mb-3">ห้องหลัก <span className="text-xs font-normal text-ink-soft">ทั้งบริษัท · ทีม GC · ทีม SW</span></h2>
              <div className="grid sm:grid-cols-3 gap-3">{main.map((r) => card(r, true))}</div>
            </div>}
            {subs.length > 0 && <div>
              <h2 className="font-display font-bold mb-3">ห้องย่อย <span className="text-xs font-normal text-ink-soft">ตามแผนก</span></h2>
              <div className="grid md:grid-cols-2 gap-4">
                {sides.map((d) => (
                  <div key={d.key} className="rounded-2xl border border-line bg-white/40 p-3">
                    <div className="px-1 mb-2 text-sm font-semibold">{d.title} <span className="text-xs font-normal text-ink-soft">{d.sub}</span></div>
                    <div className="grid gap-2">{d.list.map((r) => card(r, false))}</div>
                  </div>
                ))}
              </div>
              {others.length > 0 && <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">{others.map((r) => card(r, false))}</div>}
            </div>}
          </>);
        })()}
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          {corpSteps.length > 0 && <div className="mb-5">
            <h2 className="font-display font-bold mb-3">ขั้นตอนออเดอร์ Corporate ({corpSteps.length})</h2>
            <div className="card divide-y divide-line">
              {corpSteps.map((x) => { const od = !!x.due_date && x.due_date < todayStr; return (
                <Link key={x.id} href={`/work/rooms/operation/corporate/${x.order_id}#spec`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-cream">
                  <div className="min-w-0 flex-1"><div className="font-semibold truncate">{x.label}</div><div className="text-[11px] text-ink-soft truncate">{x.corp_orders?.order_no} · {x.corp_orders?.customer_label || x.corp_orders?.customer_name} · {x.corp_order_items?.line_code ? `${x.corp_order_items.line_code} ` : ""}{x.corp_order_items?.name}</div></div>
                  {x.due_date && <span className={`text-[11px] rounded-md px-1.5 py-0.5 whitespace-nowrap ${od ? "bg-red/10 text-red font-semibold" : "bg-lavender/30 text-purple"}`}>{od ? "เลย " : ""}{fmtDateShort(x.due_date)}</span>}
                </Link>); })}
            </div>
          </div>}
          {steps.length > 0 && <div className="mb-5">
            <h2 className="font-display font-bold mb-3">ขั้นตอนที่ได้รับมอบหมาย ({steps.length})</h2>
            <div className="card divide-y divide-line">
              {steps.map((x) => { const od = !!x.due_date && x.due_date < todayStr; const td = x.due_date === todayStr; return (
                <Link key={x.id} href={`/work/tasks/${x.task_id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-cream">
                  <div className="min-w-0 flex-1"><div className="font-semibold truncate">{x.label}</div><div className="text-[11px] text-ink-soft truncate">#{x.work_tasks!.task_no} {x.work_tasks!.title}{x.work_tasks!.work_rooms && <span className="ml-1.5 inline-block px-1 rounded text-white" style={{ background: x.work_tasks!.work_rooms.color }}>{x.work_tasks!.work_rooms.name}</span>}</div></div>
                  {x.due_date && <span className={`text-[11px] rounded-md px-1.5 py-0.5 whitespace-nowrap ${od ? "bg-red/10 text-red font-semibold" : td ? "bg-yellow/30 text-[#7a4a00] font-semibold" : "bg-lavender/30 text-purple"}`}>{od ? "เลย " : td ? "วันนี้ " : ""}{fmtDateShort(x.due_date)}</span>}
                </Link>); })}
            </div>
          </div>}
          <h2 className="font-display font-bold mb-3 flex items-baseline gap-2">งานของฉัน ({mine.length})<Link href="/work/mine" className="ml-auto text-xs font-normal text-purple underline">ดูบอร์ดงานที่เกี่ยวกับฉันทุกห้อง (รวมที่ถูก @) →</Link></h2>
          <div className="space-y-2">
            {mine.slice(0, 20).map((t) => <TaskCard key={t.id} t={t} />)}
            {!mine.length && <div className="card p-6 text-center text-ink-soft text-sm">ไม่มีงานค้าง 🎉</div>}
          </div>
        </section>
        <section className="space-y-6">
          {reviewAdminOnly.length > 0 && (
            <div>
              <h2 className="font-display font-bold mb-1">{session.isAdmin ? "รอผู้บริหารตรวจรับ" : "รอตรวจรับ"} ({reviewAdminOnly.length})</h2>
              {session.isAdmin && <p className="text-xs text-ink-soft mb-3">ผมหรือภรรยาต้องตรวจเอง — หัวหน้าตรวจแทนไม่ได้ (เช่น งานของหัวหน้าเอง)</p>}
              <div className="space-y-2">{reviewAdminOnly.slice(0, 10).map((t) => <TaskCard key={t.id} t={t} />)}</div>
            </div>
          )}
          {reviewShared.length > 0 && (
            <div>
              <h2 className="font-display font-bold mb-1">รอตรวจรับ — หัวหน้าตรวจได้ด้วย ({reviewShared.length})</h2>
              <p className="text-xs text-ink-soft mb-3">ผู้บริหารหรือหัวหน้าในวงเล็บ ใครตรวจก่อนก็ได้</p>
              <div className="space-y-2">{reviewShared.slice(0, 10).map((t) => <TaskCard key={t.id} t={t} note={`หัวหน้าตรวจได้: ${coReviewers(t).join(", ")}`} />)}</div>
            </div>
          )}
          {overdue.length > 0 && (
            <div>
              <h2 className="font-display font-bold mb-3 text-red">เลยกำหนด ({overdue.length})</h2>
              <div className="space-y-2">{overdue.slice(0, 10).map((t) => <TaskCard key={t.id} t={t} />)}</div>
            </div>
          )}
        </section>
      </div>

      {assignedByMe.length > 0 && (
        <section>
          <h2 className="font-display font-bold mb-3">{session.isAdmin ? "งานที่สั่งไป ทั้งบริษัท" : "ที่ฉันสั่ง / ลูกทีม"} ({assignedByMe.length})</h2>
          <div className="grid lg:grid-cols-2 gap-6">
            {[{ label: "ฝั่ง GC", keys: GC_KEYS, tone: "bg-purple" }, { label: "ฝั่ง SW", keys: SW_KEYS, tone: "bg-coral" }].map((side) => {
              const list = assignedByMe.filter((t) => side.keys.includes(t.work_rooms?.key ?? ""));
              return (
                <div key={side.label}>
                  <h3 className="font-display font-semibold mb-2 flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${side.tone}`} />{side.label} ({list.length})</h3>
                  {!list.length && <div className="card p-5 text-center text-ink-soft text-sm">ไม่มีงานค้าง</div>}
                  <div className="space-y-4">
                    {byOrderer(list).map((g) => (
                      <div key={g.key} className="rounded-2xl border border-line bg-white/50 p-3">
                        <div className="flex items-center justify-between mb-2 px-1"><span className={`text-sm font-semibold ${g.tone}`}>{g.label}</span><span className="text-xs text-ink-soft">{g.list.length} งาน</span></div>
                        <div className="space-y-2">
                          {g.list.slice(0, 10).map((t) => <TaskCard key={t.id} t={t} />)}
                          {g.list.length > 10 && <p className="text-xs text-ink-soft px-1">+ อีก {g.list.length - 10} งาน — ดูในห้อง</p>}
                        </div>
                      </div>))}
                  </div>
                </div>);
            })}
          </div>
          {assignedByMe.some((t) => !GC_KEYS.includes(t.work_rooms?.key ?? "") && !SW_KEYS.includes(t.work_rooms?.key ?? "")) && (
            <div className="mt-6">
              <h3 className="font-display font-semibold mb-2">TEAMWORK / อื่น ๆ</h3>
              <div className="space-y-2">{assignedByMe.filter((t) => !GC_KEYS.includes(t.work_rooms?.key ?? "") && !SW_KEYS.includes(t.work_rooms?.key ?? "")).slice(0, 10).map((t) => <TaskCard key={t.id} t={t} />)}</div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
