import Link from "next/link";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, Stat } from "@/components/ui";
import { loadDirectory, myLeadRoomIds } from "@/lib/work/queries";
import { fmtDateShort, todayBkk } from "@/lib/format";
import { unitOf } from "@/lib/work/workType";

type Period = "week" | "month" | "year";
const TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_D = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

/** ช่วงเวลา [start, end) + ป้ายชื่อ + ช่องย่อยสำหรับกราฟ */
function range(p: Period, anchor: string) {
  const d = new Date(`${anchor}T00:00:00Z`);
  if (p === "week") {
    const start = addDays(anchor, -((d.getUTCDay() + 6) % 7)); const end = addDays(start, 7);
    const buckets = Array.from({ length: 7 }, (_, i) => ({ label: TH_D[i], from: addDays(start, i), to: addDays(start, i + 1) }));
    return { start, end, label: `สัปดาห์ ${fmtDateShort(start)} – ${fmtDateShort(addDays(end, -1))}`, prev: addDays(start, -7), next: end, buckets };
  }
  if (p === "month") {
    const start = `${anchor.slice(0, 7)}-01`; const nd = new Date(`${start}T00:00:00Z`); nd.setUTCMonth(nd.getUTCMonth() + 1); const end = iso(nd);
    const pd = new Date(`${start}T00:00:00Z`); pd.setUTCMonth(pd.getUTCMonth() - 1);
    const buckets: { label: string; from: string; to: string }[] = [];
    for (let s = start, w = 1; s < end; s = addDays(s, 7), w++) buckets.push({ label: `สัปดาห์ ${w}`, from: s, to: addDays(s, 7) < end ? addDays(s, 7) : end });
    return { start, end, label: `${TH_M[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`, prev: iso(pd), next: end, buckets };
  }
  const y = d.getUTCFullYear(); const start = `${y}-01-01`; const end = `${y + 1}-01-01`;
  const buckets = TH_M.map((m, i) => ({ label: m, from: `${y}-${String(i + 1).padStart(2, "0")}-01`, to: i === 11 ? end : `${y}-${String(i + 2).padStart(2, "0")}-01` }));
  return { start, end, label: `ปี ${y + 543}`, prev: `${y - 1}-06-01`, next: end, buckets };
}

interface Row { id: string; task_no: number; title: string; status: string; due_date: string | null; done_at: string | null; reviewed_at: string | null; updated_at: string; work_type: string | null; work_qty: number | null; work_rooms: { name: string; color: string } | null }
const bkkDate = (ts: string | null) => (ts ? new Date(new Date(ts).getTime() + 7 * 3600e3).toISOString().slice(0, 10) : null);

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ p?: string; d?: string; emp?: string; view?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const p: Period = sp.p === "month" || sp.p === "year" ? sp.p : "week";
  const today = todayBkk();
  const anchor = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const R = range(p, anchor);

  // ใครดูได้: ตัวเอง · หัวหน้าห้องดูลูกทีมในห้อง · ผู้บริหารดูทุกคน
  const dir = await loadDirectory(supabase);
  let allowed: string[] = session.employee ? [session.employee.id] : [];
  if (session.isAdmin) allowed = dir.map((e) => e.id);
  else {
    const lead = await myLeadRoomIds(supabase);
    if (lead.length) {
      const { data: mem } = await supabase.from("work_room_members").select("employee_id").in("room_id", lead);
      allowed = [...new Set([...allowed, ...((mem ?? []) as { employee_id: string }[]).map((m) => m.employee_id)])];
    }
  }
  const teamView = allowed.length > 1 && (sp.view === "team" || (!session.employee && !sp.emp));
  const emp = sp.emp && allowed.includes(sp.emp) ? sp.emp : session.employee?.id ?? allowed[0] ?? null;
  const empName = (id: string | null) => { const e = dir.find((x) => x.id === id); return e ? e.nickname ?? e.first_name : "—"; };

  // ---------- มุมมองทั้งทีม ----------
  type TeamRow = { id: string; name: string; done: number; onTime: number; withDue: number; open: number; overdue: number; types: Record<string, { n: number; qty: number }> };
  let team: TeamRow[] = [];
  if (teamView) {
    const [{ data: accAll }, { data: openAll }] = await Promise.all([
      supabase.from("work_tasks").select("assignee_id, co_assignee_ids, due_date, done_at, reviewed_at, updated_at, work_type, work_qty").eq("status", "accepted").gte("updated_at", `${addDays(R.start, -1)}T00:00:00+07:00`).limit(5000),
      supabase.from("work_tasks").select("assignee_id, co_assignee_ids, due_date").not("status", "in", "(accepted,cancelled)").limit(5000),
    ]);
    const m = new Map<string, TeamRow>(allowed.map((id) => [id, { id, name: empName(id), done: 0, onTime: 0, withDue: 0, open: 0, overdue: 0, types: {} }]));
    const people = (t: { assignee_id: string | null; co_assignee_ids: string[] | null }) => [...new Set([t.assignee_id, ...(t.co_assignee_ids ?? [])].filter((x): x is string => !!x && m.has(x)))];
    for (const t of (accAll ?? []) as { assignee_id: string | null; co_assignee_ids: string[] | null; due_date: string | null; done_at: string | null; reviewed_at: string | null; updated_at: string; work_type: string | null; work_qty: number | null }[]) {
      const fin = bkkDate(t.reviewed_at ?? t.done_at ?? t.updated_at)!;
      if (fin < R.start || fin >= R.end) continue;
      const sent = bkkDate(t.done_at ?? t.reviewed_at ?? t.updated_at)!;
      for (const id of people(t)) {
        const x = m.get(id)!; x.done++;
        if (t.due_date) { x.withDue++; if (sent <= t.due_date) x.onTime++; }
        if (t.work_type) { x.types[t.work_type] = x.types[t.work_type] ?? { n: 0, qty: 0 }; x.types[t.work_type].n++; x.types[t.work_type].qty += t.work_qty ?? 0; }
      }
    }
    for (const t of (openAll ?? []) as { assignee_id: string | null; co_assignee_ids: string[] | null; due_date: string | null }[]) {
      for (const id of people(t)) { const x = m.get(id)!; x.open++; if (t.due_date && t.due_date < today) x.overdue++; }
    }
    team = [...m.values()].sort((a, b) => b.done - a.done || a.name.localeCompare(b.name));
  }

  let done: (Row & { finished: string; onTime: boolean | null })[] = [];
  let openCount = 0, overdueOpen = 0;
  if (emp && !teamView) {
    const who = `assignee_id.eq.${emp},co_assignee_ids.cs.{${emp}}`;
    const [{ data: acc }, { data: open }] = await Promise.all([
      supabase.from("work_tasks").select("id, task_no, title, status, due_date, done_at, reviewed_at, updated_at, work_type, work_qty, work_rooms(name, color)")
        .or(who).eq("status", "accepted").gte("updated_at", `${addDays(R.start, -1)}T00:00:00+07:00`).order("updated_at", { ascending: false }).limit(1000),
      supabase.from("work_tasks").select("id, due_date, status").or(who).not("status", "in", "(accepted,cancelled)"),
    ]);
    done = ((acc ?? []) as unknown as Row[]).map((t) => {
      const finished = bkkDate(t.reviewed_at ?? t.done_at ?? t.updated_at)!;
      const sent = bkkDate(t.done_at ?? t.reviewed_at ?? t.updated_at)!;
      return { ...t, finished, onTime: t.due_date ? sent <= t.due_date : null };
    }).filter((t) => t.finished >= R.start && t.finished < R.end);
    const o = (open ?? []) as { due_date: string | null }[];
    openCount = o.length; overdueOpen = o.filter((t) => t.due_date && t.due_date < today).length;
  }
  const withDue = done.filter((t) => t.onTime !== null);
  const onTime = withDue.filter((t) => t.onTime).length;
  const pct = withDue.length ? Math.round((onTime / withDue.length) * 100) : null;
  const byType = Object.entries(done.reduce<Record<string, { n: number; qty: number }>>((a, t) => { const k = t.work_type ?? "ไม่ระบุประเภท"; a[k] = a[k] ?? { n: 0, qty: 0 }; a[k].n++; a[k].qty += t.work_qty ?? 0; return a; }, {})).sort((a, b) => b[1].n - a[1].n);
  const bars = R.buckets.map((b) => ({ ...b, n: done.filter((t) => t.finished >= b.from && t.finished < b.to).length }));
  const maxBar = Math.max(1, ...bars.map((b) => b.n));
  const qs = (o: Record<string, string>) => { const q = new URLSearchParams({ p, d: anchor, ...(teamView ? { view: "team" } : emp && emp !== session.employee?.id ? { emp } : {}), ...o }); return `/work/performance?${q}`; };

  return (
    <div className="space-y-6">
      <Header title={teamView ? "ผลงานทีม" : emp === session.employee?.id ? "ผลงานของฉัน" : `ผลงาน · ${empName(emp)}`} sub="งานที่ทำเสร็จ (ตรวจรับแล้ว) ตามช่วงเวลา" crumbs={[{ href: "/work", label: "งาน · ห้องหลัก" }]} />

      <div className="flex flex-wrap items-center gap-2">
        {(["week", "month", "year"] as Period[]).map((k) => <Link key={k} href={qs({ p: k, d: anchor })} className={p === k ? "btn-primary py-1.5 px-4" : "btn-outline py-1.5 px-4"}>{k === "week" ? "สัปดาห์" : k === "month" ? "เดือน" : "ปี"}</Link>)}
        <div className="flex items-center gap-1 ml-2">
          <Link href={qs({ d: R.prev })} className="btn-ghost px-2">‹</Link>
          <span className="font-semibold text-sm min-w-[150px] text-center">{R.label}</span>
          <Link href={qs({ d: R.next })} className={`btn-ghost px-2 ${R.end > today ? "opacity-30 pointer-events-none" : ""}`}>›</Link>
          {(today < R.start || today >= R.end) && <Link href={qs({ d: today })} className="text-xs text-purple underline ml-1">ปัจจุบัน</Link>}
        </div>
        {allowed.length > 1 && (
          <form className="ml-auto flex items-center gap-2" action="/work/performance">
            <Link href={`/work/performance?p=${p}&d=${anchor}&view=team`} className={teamView ? "btn-primary py-1.5" : "btn-outline py-1.5"}>👥 ทั้งทีม</Link>
            <input type="hidden" name="p" value={p} /><input type="hidden" name="d" value={anchor} />
            <select name="emp" defaultValue={teamView ? "" : emp ?? ""} className="input !py-1.5 w-44">{teamView && <option value="" disabled>รายคน…</option>}{allowed.map((id) => <option key={id} value={id}>{empName(id)}{id === session.employee?.id ? " (ฉัน)" : ""}</option>)}</select>
            <button className="btn-outline py-1.5">ดู</button>
          </form>
        )}
      </div>

      {teamView ? (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="งานที่เสร็จ (ทั้งทีม)" value={team.reduce((a, x) => a + x.done, 0)} tone="purple" />
          <Stat label="ส่งตรงเวลา" value={(() => { const w = team.reduce((a, x) => a + x.withDue, 0); return w ? `${Math.round((team.reduce((a, x) => a + x.onTime, 0) / w) * 100)}%` : "—"; })()} tone="teal" />
          <Stat label="ค้างอยู่ตอนนี้" value={team.reduce((a, x) => a + x.open, 0)} tone="yellow" />
          <Stat label="เลยกำหนด (ค้าง)" value={team.reduce((a, x) => a + x.overdue, 0)} tone="coral" />
        </div>
        <div className="card overflow-x-auto">
          <table className="tbl text-sm">
            <thead><tr><th>พนักงาน</th><th className="text-right">เสร็จ</th><th className="w-40"></th><th className="text-right">ตรงเวลา</th><th className="text-right">ค้าง</th><th className="text-right">เลยกำหนด</th><th>ประเภทงาน</th></tr></thead>
            <tbody>
              {(() => { const mx = Math.max(1, ...team.map((x) => x.done)); return team.map((x) => (
                <tr key={x.id}>
                  <td><Link href={`/work/performance?p=${p}&d=${anchor}&emp=${x.id}`} className="font-semibold hover:underline">{x.name}</Link></td>
                  <td className="text-right font-semibold">{x.done}</td>
                  <td><div className="h-2 rounded-full bg-lavender/30"><div className="h-2 rounded-full bg-purple" style={{ width: `${(x.done / mx) * 100}%` }} /></div></td>
                  <td className="text-right">{x.withDue ? `${Math.round((x.onTime / x.withDue) * 100)}%` : "—"}</td>
                  <td className="text-right">{x.open}</td>
                  <td className={`text-right ${x.overdue ? "text-red font-semibold" : ""}`}>{x.overdue}</td>
                  <td className="text-xs text-ink-soft">{Object.entries(x.types).map(([k, v]) => `${k} ${v.n}${v.qty ? ` (${v.qty} ${unitOf(k)})` : ""}`).join(" · ") || "—"}</td>
                </tr>
              )); })()}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-soft">นับงานที่ตรวจรับแล้วในช่วงนี้ · งานที่มีผู้ร่วมงานนับให้ทุกคนในงาน · กดชื่อเพื่อดูรายละเอียดรายคน</p>
      </>) : !emp ? <div className="card p-8 text-center text-ink-soft">บัญชีนี้ยังไม่ได้ผูกกับประวัติพนักงาน</div> : (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="งานที่เสร็จ" value={done.length} tone="purple" />
          <Stat label="ส่งตรงเวลา" value={pct === null ? "—" : `${pct}%`} tone="teal" />
          <Stat label="ค้างอยู่ตอนนี้" value={openCount} tone="yellow" />
          <Stat label="เลยกำหนด (ค้าง)" value={overdueOpen} tone="coral" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="card p-5 lg:col-span-2">
            <h2 className="font-display font-bold mb-4">งานที่เสร็จ · {p === "week" ? "รายวัน" : p === "month" ? "รายสัปดาห์" : "รายเดือน"}</h2>
            <div className="flex items-end gap-2 h-40">
              {bars.map((b) => (
                <div key={b.from} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                  <span className="text-[11px] font-semibold text-purple">{b.n || ""}</span>
                  <div className="w-full rounded-t-md bg-purple/80" style={{ height: `${(b.n / maxBar) * 100}%`, minHeight: b.n ? 4 : 1, opacity: b.n ? 1 : 0.15 }} />
                  <span className="text-[10px] text-ink-soft whitespace-nowrap">{b.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-display font-bold mb-3">แยกตามประเภทงาน</h2>
            {byType.length ? <ul className="space-y-2 text-sm">{byType.map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-2"><span className="truncate">{k}</span><span className="text-right whitespace-nowrap"><b>{v.n}</b> งาน{v.qty ? <span className="text-ink-soft"> · {v.qty} {unitOf(k)}</span> : null}</span></li>
            ))}</ul> : <div className="text-sm text-ink-soft">ยังไม่มีงานที่เสร็จในช่วงนี้</div>}
            {withDue.length > 0 && <div className="mt-4 pt-3 border-t border-line text-xs text-ink-soft">ตรงเวลา {onTime} · ช้า {withDue.length - onTime} (จากงานที่มีกำหนดส่ง {withDue.length} งาน)</div>}
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table className="tbl text-sm">
            <thead><tr><th>เลขที่</th><th>งาน</th><th>ห้อง</th><th>ประเภท</th><th>กำหนด</th><th>เสร็จ</th><th>ตรงเวลา</th></tr></thead>
            <tbody>
              {done.map((t) => (
                <tr key={t.id}>
                  <td className="font-mono text-xs">#{t.task_no}</td>
                  <td><Link href={`/work/tasks/${t.id}`} className="hover:underline">{t.title}</Link></td>
                  <td>{t.work_rooms && <span className="text-[11px] text-white rounded px-1.5" style={{ background: t.work_rooms.color }}>{t.work_rooms.name}</span>}</td>
                  <td className="text-xs">{t.work_type ? `${t.work_type}${t.work_qty ? ` · ${t.work_qty} ${unitOf(t.work_type)}` : ""}` : "—"}</td>
                  <td className="text-xs whitespace-nowrap">{t.due_date ? fmtDateShort(t.due_date) : "—"}</td>
                  <td className="text-xs whitespace-nowrap">{fmtDateShort(t.finished)}</td>
                  <td>{t.onTime === null ? "—" : t.onTime ? <span className="badge-approved">ตรงเวลา</span> : <span className="badge-rejected">ช้า</span>}</td>
                </tr>
              ))}
              {!done.length && <tr><td colSpan={7} className="text-center text-ink-soft py-8">ยังไม่มีงานที่ตรวจรับแล้วในช่วงนี้</td></tr>}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}
