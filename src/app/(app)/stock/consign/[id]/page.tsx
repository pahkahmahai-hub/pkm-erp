import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { KIND_TH, type ConsignLocation, type ConsignMove, type ConsignStockRow } from "@/lib/stock/consign";
import { ConsignLocationForm } from "../ConsignLocationForm";
import { ConsignQtyForm } from "./ConsignQtyForm";
import { consignReturn, consignReconcile } from "../../actions";

export const dynamic = "force-dynamic";
const TABS = [["stock", "คงเหลือที่ห้าง"], ["moves", "ความเคลื่อนไหว"], ["reconcile", "กระทบยอด"], ["return", "รับคืน"], ["settings", "ตั้งค่า"]] as const;

export default async function ConsignDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; saved?: string; done?: string; n?: string; error?: string; q?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "stock";
  const [{ data: loc }, { data: stock }, { data: moves }, { data: products }, { data: customers }] = await Promise.all([
    supabase.from("consign_locations").select("*").eq("id", id).maybeSingle(),
    supabase.from("consign_stock").select("*, products(id, code, name, unit, price, stock_qty)").eq("location_id", id).neq("qty", 0),
    tab === "moves" ? supabase.from("consign_movements").select("*, products(code, name)").eq("location_id", id).order("created_at", { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
    tab === "reconcile" || tab === "return" ? supabase.from("products").select("id, code, name, unit, barcode").eq("is_active", true).order("code") : Promise.resolve({ data: [] }),
    tab === "settings" && session.isAdmin ? supabase.from("contacts").select("id, name, code").eq("kind", "customer").eq("is_active", true).order("name") : Promise.resolve({ data: [] }),
  ]);
  if (!loc) notFound();
  const l = loc as ConsignLocation;
  const rows = ((stock ?? []) as ConsignStockRow[]).sort((a, b) => (a.products?.code ?? "").localeCompare(b.products?.code ?? ""));
  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const neg = rows.filter((r) => r.qty < 0).length;
  const q = (sp.q ?? "").trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.products?.code.toLowerCase().includes(q) || r.products?.name.toLowerCase().includes(q)) : rows;
  const balances = Object.fromEntries(rows.map((r) => [r.product_id, r.qty]));

  return (
    <div className="space-y-4">
      <Header title={`คลังฝากขาย · ${l.name}`} sub={`${totalQty.toLocaleString()} ชิ้น · ${rows.filter((r) => r.qty > 0).length} SKU อยู่ที่ห้าง`} action={<Link href="/stock/consign" className="btn-outline"><ArrowLeft size={16} /> ทุกห้าง</Link>} />
      {sp.saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {sp.done === "return" && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">รับคืนเข้าคลังหลักแล้ว</div>}
      {sp.done === "reconcile" && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">กระทบยอดแล้ว — ปรับ {sp.n ?? 0} รายการ</div>}
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      {neg > 0 && <div className="rounded-xl bg-yellow/20 text-sm px-4 py-3 flex items-center gap-2"><AlertTriangle size={14} /> มี {neg} SKU ติดลบ (ห้างขายได้มากกว่าที่ระบบบันทึกว่าส่ง) — ส่วนใหญ่เกิดจากของที่ส่งก่อนเริ่มใช้ระบบ ให้กระทบยอดตามรายงานคงเหลือของห้าง</div>}

      <div className="flex flex-wrap gap-2">{TABS.filter(([k]) => k !== "settings" || session.isAdmin).map(([k, label]) => <Link key={k} href={`/stock/consign/${id}?tab=${k}`} className={tab === k ? "btn-primary py-1.5 px-4" : "btn-outline py-1.5 px-4"}>{label}</Link>)}</div>

      {tab === "stock" && (
        <div className="card overflow-x-auto">
          <form className="p-3 border-b border-line"><input type="hidden" name="tab" value="stock" /><input name="q" defaultValue={sp.q ?? ""} className="input max-w-xs" placeholder="ค้นหารหัส / ชื่อสินค้า" /></form>
          <table className="tbl">
            <thead><tr><th>รหัส</th><th>สินค้า</th><th className="text-right">อยู่ที่ห้าง</th><th className="text-right">คลังหลัก</th><th className="text-right">ราคาขาย</th><th className="text-right">มูลค่า</th></tr></thead>
            <tbody>
              {shown.map((r) => <tr key={r.product_id}><td className="font-mono text-xs">{r.products?.code}</td><td>{r.products?.name}</td><td className={`text-right font-semibold ${r.qty < 0 ? "text-red" : ""}`}>{r.qty.toLocaleString()} {r.products?.unit}</td><td className="text-right text-ink-soft">{r.products?.stock_qty}</td><td className="text-right">{Number(r.products?.price ?? 0).toLocaleString()}</td><td className="text-right">{(r.qty * Number(r.products?.price ?? 0)).toLocaleString()}</td></tr>)}
              {!shown.length && <tr><td colSpan={6} className="text-center text-ink-soft py-6">ยังไม่มีของที่ห้างนี้ — ออกใบส่งของชั่วคราวให้ลูกค้าที่ผูกกับห้างนี้เพื่อโอนของเข้า</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "moves" && (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>เวลา</th><th>ประเภท</th><th>เอกสาร</th><th>สินค้า</th><th className="text-right">จำนวน</th><th className="text-right">คงเหลือ</th><th>หมายเหตุ</th></tr></thead>
            <tbody>
              {((moves ?? []) as ConsignMove[]).map((m) => <tr key={m.id}><td className="text-xs whitespace-nowrap">{fmtDateTime(m.created_at)}</td><td className="text-xs">{KIND_TH[m.kind]}</td>
                <td className="text-xs">{m.ref_type === "sales_doc" && m.ref_id ? <Link href={`/sales/docs/${m.ref_id}`} className="text-purple underline">{m.ref_no}</Link> : m.ref_no}</td>
                <td className="text-xs"><span className="font-mono">{m.products?.code}</span> {m.products?.name}</td><td className={`text-right font-semibold ${m.qty < 0 ? "text-red" : "text-green"}`}>{m.qty > 0 ? "+" : ""}{m.qty}</td><td className="text-right">{m.balance_after}</td><td className="text-xs text-ink-soft">{m.note}</td></tr>)}
              {!(moves ?? []).length && <tr><td colSpan={7} className="text-center text-ink-soft py-6">ยังไม่มีความเคลื่อนไหว</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "reconcile" && <ConsignQtyForm mode="reconcile" action={consignReconcile.bind(null, id)} products={(products ?? []) as { id: string; code: string; name: string; unit: string; barcode: string | null }[]} balances={balances} />}
      {tab === "return" && <ConsignQtyForm mode="return" action={consignReturn.bind(null, id)} products={(products ?? []) as { id: string; code: string; name: string; unit: string; barcode: string | null }[]} balances={balances} />}
      {tab === "settings" && session.isAdmin && <ConsignLocationForm loc={l} customers={(customers ?? []) as { id: string; name: string; code: string | null }[]} />}
    </div>
  );
}
