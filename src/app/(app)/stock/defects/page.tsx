import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { updateDefect } from "../actions";
import { DEFECT_TH, type Defect, type DefectStatus } from "@/lib/stock/types";

export const dynamic = "force-dynamic";

const TABS: [string, string][] = [["open", "ค้างอยู่"], ["review", "รอพิจารณา"], ["return_pending", "รอส่งคืน"], ["closed", "ปิดแล้ว"]];

export default async function DefectsPage({ searchParams }: { searchParams: Promise<{ tab?: string; error?: string }> }) {
  const { tab = "open", error } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("defects").select("*, products(code, name), contacts(name), receipts(receipt_no), app_users!defects_created_by_fkey(display_name)").order("created_at", { ascending: false }).limit(300);
  if (tab === "open") q = q.in("status", ["review", "return_pending"]);
  else if (tab === "closed") q = q.in("status", ["returned", "disposed", "restored"]);
  else q = q.eq("status", tab);
  const { data } = await q;
  const rows = (data ?? []) as Defect[];
  const badge = (s: DefectStatus) => s === "review" ? "badge-pending" : s === "return_pending" ? "badge-rejected" : s === "restored" ? "badge-ok" : "badge-off";

  return (
    <div className="space-y-6">
      <Header title="ของเสีย / ส่งคืน" sub={`${rows.length} รายการ · ${rows.reduce((a, r) => a + r.qty, 0)} ชิ้น`} />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(([k, l]) => <Link key={k} href={`/stock/defects?tab=${k}`} className={tab === k ? "btn-primary py-1.5 px-3" : "btn-outline py-1.5 px-3"}>{l}</Link>)}
      </div>
      <div className="space-y-3">
        {rows.map((d) => {
          const open = d.status === "review" || d.status === "return_pending";
          return (
            <div key={d.id} className="card p-4 grid md:grid-cols-[1fr_auto] gap-4 text-sm">
              <div>
                <div className="font-semibold">{d.products?.name} <span className="font-mono text-xs text-ink-soft">{d.products?.code}</span> · <b className="text-red">{d.qty} ชิ้น</b></div>
                <div className="text-xs text-ink-soft mt-1">
                  <span className={badge(d.status)}>{DEFECT_TH[d.status]}</span> · {fmtDate(d.created_at)} · {d.contacts?.name ?? "ไม่ระบุซัพพลายเออร์"}{d.receipts?.receipt_no ? ` · ${d.receipts.receipt_no}` : ""} · โดย {d.app_users?.display_name ?? "—"}
                </div>
                {d.note && <div className="text-xs mt-1">{d.note}</div>}
              </div>
              {open && (
                <form className="flex flex-col gap-2 md:w-72">
                  <input name="note" className="input" placeholder="หมายเหตุ (ถ้ามี)" />
                  <div className="grid grid-cols-2 gap-2">
                    {d.status === "review" && <button formAction={updateDefect.bind(null, d.id, "return_pending")} className="btn-outline py-1.5 text-xs">→ รอส่งคืน</button>}
                    <button formAction={updateDefect.bind(null, d.id, "restored")} className="btn-outline py-1.5 text-xs">ใช้ได้ → เข้าสต็อก</button>
                    <button formAction={updateDefect.bind(null, d.id, "returned")} className="btn-primary py-1.5 text-xs">ส่งคืนแล้ว</button>
                    <button formAction={updateDefect.bind(null, d.id, "disposed")} className="btn-danger py-1.5 text-xs">ตัดทิ้ง</button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
        {!rows.length && <div className="card p-8 text-center text-ink-soft">ไม่มีรายการ</div>}
      </div>
    </div>
  );
}
