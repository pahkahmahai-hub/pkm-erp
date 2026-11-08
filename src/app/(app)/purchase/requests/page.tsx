import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { Header } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { PSTATUS_TH, PSTATUS_BADGE, type PurchaseDoc, type PurchaseStatus } from "@/lib/purchase/types";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
const TYPE = "pr" as "pr" | "po";
const TABS: { key: string; label: string }[] = TYPE === "pr"
  ? [{ key: "", label: "ทั้งหมด" }, { key: "pending", label: "รออนุมัติ" }, { key: "approved", label: "อนุมัติแล้ว" }, { key: "ordered", label: "เปิด PO แล้ว" }, { key: "rejected", label: "ไม่อนุมัติ" }, { key: "draft", label: "ร่าง" }]
  : [{ key: "", label: "ทั้งหมด" }, { key: "draft", label: "ร่าง" }, { key: "sent", label: "รอของ" }, { key: "partial", label: "รับบางส่วน" }, { key: "received", label: "รับครบ" }, { key: "cancelled", label: "ยกเลิก" }];

export default async function ListPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status = "", q = "" } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  let query = supabase.from("purchase_docs").select("*, companies(code)").eq("doc_type", TYPE).order("doc_date", { ascending: false }).order("created_at", { ascending: false }).limit(300);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`doc_no.ilike.%${q}%,supplier_name.ilike.%${q}%,purpose.ilike.%${q}%`);
  const { data } = await query;
  const rows = (data ?? []) as (PurchaseDoc & { companies: { code: string } })[];
  return (
    <div className="space-y-6">
      <Header title="ใบขอซื้อภายใน (PR)" sub={`${rows.length} ใบ`} action={TYPE === "pr" || session.isAdmin ? <Link href={`/purchase/requests/new`} className="btn-primary"><Plus size={16} /> {TYPE === "pr" ? "เปิดใบขอซื้อ" : "เปิด PO ตรง"}</Link> : undefined} />
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => <Link key={t.key} href={`/purchase/requests?status=${t.key}${q ? `&q=${q}` : ""}`} className={`px-3 py-1.5 rounded-full text-sm ${status === t.key ? "bg-purple text-white" : "bg-white border border-line hover:bg-cream"}`}>{t.label}</Link>)}
        <form className="ml-auto"><input type="hidden" name="status" value={status} /><input name="q" defaultValue={q} placeholder="ค้นหาเลขที่ / ซัพพลายเออร์…" className="input w-64" /></form>
      </div>
      <div className="card overflow-x-auto"><table className="tbl">
        <thead><tr><th>เลขที่</th><th>วันที่</th><th>{TYPE === "pr" ? "ต้องการภายใน" : "กำหนดส่ง"}</th><th>ซัพพลายเออร์</th><th>วัตถุประสงค์</th><th className="text-right">ยอดรวม</th><th>{TYPE === "pr" ? "PO" : "อ้างอิง PR"}</th><th>สถานะ</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}>
          <td><Link href={`/purchase/requests/${r.id}`} className="font-mono text-xs text-purple hover:underline">{r.doc_no}</Link><div className="text-[10px] text-ink-soft">{r.companies?.code}</div></td>
          <td className="whitespace-nowrap">{fmtDate(r.doc_date)}</td><td className="whitespace-nowrap text-xs">{r.need_by ? fmtDate(r.need_by) : "—"}</td>
          <td className="font-medium">{r.supplier_name ?? "—"}</td><td className="text-xs text-ink-soft max-w-[280px] truncate">{r.purpose}</td>
          <td className="text-right font-semibold">{fmt(r.grand_total)}</td><td className="font-mono text-xs">{r.ref_doc_no ?? "—"}</td>
          <td><span className={PSTATUS_BADGE[r.status as PurchaseStatus]}>{PSTATUS_TH[r.status as PurchaseStatus]}</span></td></tr>)}
          {!rows.length && <tr><td colSpan={8} className="text-center text-ink-soft py-10">ไม่มีรายการ</td></tr>}</tbody>
      </table></div>
    </div>
  );
}
