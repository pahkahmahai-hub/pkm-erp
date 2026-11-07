import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { DOC_META, STATUS_TH, STATUS_BADGE, CHANNEL_TH, type SalesDoc, type SalesDocType, type SalesDocStatus } from "@/lib/sales/types";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

export default async function DocsList({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; q?: string; company?: string; deleted?: string }> }) {
  const { type = "invoice", status = "", q = "", company = "", deleted } = await searchParams;
  const docType = (type in DOC_META ? type : "invoice") as SalesDocType;
  const supabase = await createClient();
  let query = supabase.from("sales_docs").select("*, companies(code, name_th)").eq("doc_type", docType).order("doc_date", { ascending: false }).order("doc_no", { ascending: false }).limit(300);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`doc_no.ilike.%${q}%,customer_name.ilike.%${q}%,ref_doc_no.ilike.%${q}%,po_no.ilike.%${q}%`);
  const [{ data }, { data: companies }] = await Promise.all([query, supabase.from("companies").select("id, code").order("code")]);
  let rows = (data ?? []) as SalesDoc[];
  if (company) rows = rows.filter((r) => r.companies?.code === company);
  const total = rows.filter((r) => r.status !== "cancelled" && r.status !== "draft").reduce((a, r) => a + Number(r.grand_total), 0);

  return (
    <div className="space-y-6">
      <Header title={DOC_META[docType].th} sub={`${rows.length} ใบ · รวม ฿${fmt(total)}`} action={<Link href={`/sales/docs/new?type=${docType}`} className="btn-primary"><Plus size={16} /> สร้าง{DOC_META[docType].th}</Link>} />
      {deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบฉบับร่างแล้ว</div>}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(DOC_META) as SalesDocType[]).map((t) => <Link key={t} href={`/sales/docs?type=${t}`} className={t === docType ? "btn-primary py-1 px-3 text-xs" : "btn-outline py-1 px-3 text-xs"} style={t === docType ? { background: DOC_META[t].color } : {}}>{DOC_META[t].prefix} {DOC_META[t].th}</Link>)}
      </div>
      <form className="flex flex-wrap gap-2 items-end">
        <input type="hidden" name="type" value={docType} />
        <input name="q" defaultValue={q} className="input w-64" placeholder="เลขที่ / ลูกค้า / PO / อ้างอิง" />
        <select name="status" defaultValue={status} className="input w-40"><option value="">ทุกสถานะ</option>{(Object.keys(STATUS_TH) as SalesDocStatus[]).map((s) => <option key={s} value={s}>{STATUS_TH[s]}</option>)}</select>
        <select name="company" defaultValue={company} className="input w-32"><option value="">ทุกบริษัท</option>{companies?.map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}</select>
        <button className="btn-outline">ค้นหา</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[860px]">
          <thead><tr><th>เลขที่</th><th>วันที่</th><th>ลูกค้า</th><th>ช่องทาง</th><th>อ้างอิง</th><th className="text-right">ยอดรวม</th><th>สถานะ</th><th>บริษัท</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.status === "cancelled" ? "text-ink-soft line-through" : ""}>
                <td><Link href={`/sales/docs/${r.id}`} className="font-mono text-xs text-purple hover:underline">{r.doc_no}</Link></td>
                <td>{fmtDate(r.doc_date)}</td>
                <td className="font-medium">{r.customer_name}</td>
                <td className="text-xs">{CHANNEL_TH[r.channel]}</td>
                <td className="text-xs font-mono">{r.ref_doc_no ?? r.po_no ?? "—"}</td>
                <td className="text-right font-semibold">{fmt(r.grand_total)}</td>
                <td><span className={STATUS_BADGE[r.status]}>{STATUS_TH[r.status]}</span></td>
                <td className="text-xs">{r.companies?.code}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="text-center text-ink-soft py-8">ยังไม่มีเอกสาร</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
