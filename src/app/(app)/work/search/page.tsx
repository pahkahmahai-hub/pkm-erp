import Link from "next/link";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { TaskSearchBox } from "@/components/work/TaskSearchBox";
import { loadDirectory, fillEmployees, isOverdue } from "@/lib/work/queries";
import { STATUS_BADGE, statusLabel, type Task } from "@/lib/work/types";
import { fmtDateShort } from "@/lib/format";
import { unitOf } from "@/lib/work/workType";

/** ค้นหางานจากเลขงาน (#123) หรือคำในชื่องาน — เห็นเฉพาะงานที่ตัวเองมีสิทธิ์ (RLS) */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; all?: string }> }) {
  const { q: raw = "", all } = await searchParams;
  await getSession();
  const supabase = await createClient();
  const q = raw.trim();
  const num = q.replace(/^#/, "");
  let rows: Task[] = [];
  if (q) {
    let query = supabase.from("work_tasks").select("*, work_rooms(key, name, color), employees!work_tasks_assignee_id_fkey(first_name, nickname)");
    if (/^\d+$/.test(num)) query = query.or(`task_no.eq.${num},title.ilike.%${num}%`);
    else {
      // ทุกคำต้องอยู่ในชื่องาน (ค้นหลายคำได้)
      for (const w of q.split(/\s+/).filter(Boolean).slice(0, 5)) query = query.ilike("title", `%${w.replace(/[%_,()]/g, "")}%`);
    }
    if (!all) query = query.neq("status", "cancelled");
    const { data } = await query.order("created_at", { ascending: false }).limit(100);
    rows = fillEmployees((data ?? []) as Task[], await loadDirectory(supabase), "assignee_id");
    // เลขงานตรงเป๊ะขึ้นก่อน
    rows.sort((a, b) => Number(String(b.task_no) === num) - Number(String(a.task_no) === num));
  }
  const exact = rows.length === 1 && String(rows[0].task_no) === num ? rows[0] : null;

  return (
    <div className="space-y-5">
      <Header title="ค้นหางาน" sub="พิมพ์เลขงาน เช่น 16587 หรือคำในชื่องาน เช่น ศิเทค" crumbs={[{ href: "/work", label: "งาน · ห้องหลัก" }]} />
      <div className="flex flex-wrap items-center gap-3">
        <TaskSearchBox defaultValue={q} className="flex-1 min-w-[260px] max-w-xl" />
        {q && <Link href={`/work/search?q=${encodeURIComponent(q)}${all ? "" : "&all=1"}`} className="text-xs text-purple underline">{all ? "ซ่อนงานที่ยกเลิก" : "รวมงานที่ยกเลิก"}</Link>}
      </div>
      {exact && <div className="text-sm"><Link href={`/work/tasks/${exact.id}`} className="btn-primary">เปิดงาน #{exact.task_no} →</Link></div>}
      {q && (
        <div className="card divide-y divide-line">
          {rows.map((t) => {
            const od = isOverdue(t);
            return (
              <Link key={t.id} href={`/work/tasks/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream">
                <span className="font-mono text-xs text-ink-soft w-16 shrink-0">#{t.task_no}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{t.title}</div>
                  <div className="text-[11px] text-ink-soft flex flex-wrap items-center gap-x-2">
                    {t.work_rooms && <span className="text-white rounded px-1.5" style={{ background: t.work_rooms.color }}>{t.work_rooms.name}</span>}
                    <span>{t.employees ? t.employees.nickname ?? t.employees.first_name : "ยังไม่มอบหมาย"}</span>
                    {t.work_type && <span className="text-purple">{t.work_type}{t.work_qty ? ` · ${t.work_qty} ${unitOf(t.work_type)}` : ""}</span>}
                  </div>
                </div>
                {t.due_date && <span className={`text-xs whitespace-nowrap ${od ? "text-red font-semibold" : "text-ink-soft"}`}>{od ? "เลย " : ""}{fmtDateShort(t.due_date)}</span>}
                <span className={`${STATUS_BADGE[t.status]} whitespace-nowrap`}>{statusLabel(t.status, t.work_rooms?.key)}</span>
              </Link>
            );
          })}
          {!rows.length && <div className="p-8 text-center text-ink-soft text-sm">ไม่พบงานที่ตรงกับ “{q}”</div>}
        </div>
      )}
    </div>
  );
}
