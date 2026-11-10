import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { PrintButton } from "@/components/sales/PrintButton";
import type { Company } from "@/lib/sales/types";
import type { ProductionOrder, ProductionOrderItem, ProductionIssue, Requirement } from "@/lib/production/types";
import { KIND_TH } from "@/lib/production/types";

export const dynamic = "force-dynamic";
const dmy = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const fmt = (n: number, d = 2) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d });
const COLOR = "#2f6b4f";

export default async function PrintMo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ issue?: string }> }) {
  const { id } = await params; const { issue } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: o }, { data: items }, { data: req }, { data: iss }] = await Promise.all([
    supabase.from("production_orders").select("*, companies(*)").eq("id", id).maybeSingle(),
    supabase.from("production_order_items").select("*, products(code, name, barcode, unit)").eq("order_id", id).order("line_no"),
    supabase.rpc("mo_requirements", { p_order: id }),
    issue ? supabase.from("production_issues").select("*, production_issue_items(id, material_id, qty, unit_cost, materials(name, unit, kind, code))").eq("id", issue).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!o) notFound();
  const d = o as ProductionOrder & { companies: Company };
  const c = d.companies;
  const its = (items ?? []) as ProductionOrderItem[];
  const reqs = (req?.lines ?? []) as Requirement[];
  const one = iss as unknown as (Omit<ProductionIssue, "production_issue_items"> & { production_issue_items: { id: string; qty: number; materials: { name: string; unit: string; kind: Requirement["kind"]; code: string | null } | null }[] }) | null;
  const title = one ? "ใบเบิกวัสดุ" : "ใบสั่งผลิต";
  const showWage = session.isAdmin && !one;
  return (
    <>
      <title>{one ? one.issue_no : d.doc_no}</title>
      <style>{`
        * { box-sizing: border-box; } body { margin: 0; font-family: "IBM Plex Sans Thai", sans-serif; color: #222; font-size: 12px; background: #f3f0ea; }
        .page { width: 210mm; min-height: 297mm; margin: 12px auto; background: #fff; padding: 14mm; position: relative; display: flex; flex-direction: column; }
        .head { display: flex; justify-content: space-between; gap: 24px; } .co { font-size: 11px; line-height: 1.5; } .co b { font-size: 12.5px; }
        .title h1 { margin: 0 0 2px; font-size: 20px; color: ${COLOR}; text-align: right; } .metaT { margin-top: 8px; font-size: 11px; border-top: 1px solid #ddd; padding-top: 6px; } .metaT td { padding: 1px 6px 1px 0; } .metaT td:first-child { color: #777; width: 90px; }
        .box { margin-top: 14px; font-size: 11px; line-height: 1.5; } .lbl { color: ${COLOR}; font-weight: 600; font-size: 10px; letter-spacing: .05em; }
        table.items { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; } table.items th { background: ${COLOR}; color: #fff; padding: 6px; text-align: left; font-size: 10.5px; } table.items td { padding: 6px; border-bottom: 1px solid #eee; vertical-align: top; }
        .r { text-align: right; } .notes { margin-top: 12px; font-size: 10.5px; white-space: pre-wrap; } .foot { margin-top: auto; padding-top: 28px; }
        .signs { display: flex; justify-content: space-between; gap: 30px; margin-top: 30px; } .sig { flex: 1; border-top: 1px solid #999; padding-top: 4px; font-size: 10px; color: #555; text-align: center; }
        @media print { body { background: #fff; } .page { margin: 0; } .noprint { display: none !important; } }
      `}</style>
      <PrintButton />
      <div className="page">
        <div className="head">
          <div className="co">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={c.logo_path ?? "/brand/logo-horizontal.png"} alt="" style={{ height: 44, marginBottom: 6 }} /><br />
            <b>{c.name_th}</b>{c.branch && ` (${c.branch})`}<br />{c.address_th}<br />เลขประจำตัวผู้เสียภาษี {c.tax_id}{c.phone && <><br />โทร. {c.phone}</>}</div>
          <div className="title"><h1>{title}</h1>
            <table className="metaT"><tbody>
              <tr><td>เลขที่</td><td><b>{one ? one.issue_no : d.doc_no}</b></td></tr>
              {one && <tr><td>ใบสั่งผลิต</td><td>{d.doc_no}</td></tr>}
              <tr><td>วันที่</td><td>{dmy(one ? one.issued_at : d.doc_date)}</td></tr>
              {!one && <tr><td>กำหนดส่งงาน</td><td>{dmy(d.due_date)}</td></tr>}
            </tbody></table></div>
        </div>
        <div className="box"><div className="lbl">โรงงาน / ผู้ผลิต</div><div><b>{d.factory_name ?? "—"}</b></div></div>

        {!one && <table className="items"><thead><tr><th>#</th><th>สินค้า</th><th>บาร์โค้ด</th><th className="r">จำนวน</th>{showWage && <><th className="r">ค่าจ้าง/ชิ้น</th><th className="r">รวม</th></>}<th>หมายเหตุ</th></tr></thead>
          <tbody>{its.map((i) => <tr key={i.id}><td>{i.line_no}</td><td>{i.products?.name}<div style={{ color: "#777", fontSize: 10 }}>{i.products?.code}</div></td><td style={{ fontFamily: "monospace", fontSize: 10 }}>{i.products?.barcode}</td><td className="r">{i.qty_ordered} {i.products?.unit}</td>{showWage && <><td className="r">{fmt(i.wage_per_piece)}</td><td className="r">{fmt(i.qty_ordered * Number(i.wage_per_piece))}</td></>}<td>{i.note}</td></tr>)}
            <tr><td colSpan={3} className="r"><b>รวม</b></td><td className="r"><b>{its.reduce((a, i) => a + i.qty_ordered, 0)} ชิ้น</b></td>{showWage && <><td /><td className="r"><b>{fmt(its.reduce((a, i) => a + i.qty_ordered * Number(i.wage_per_piece), 0))}</b></td></>}<td /></tr></tbody></table>}

        <div className="box"><div className="lbl">{one ? "วัสดุที่เบิก" : "วัสดุที่ต้องเบิกตาม BOM"}</div></div>
        <table className="items"><thead><tr><th>#</th><th>วัสดุ</th><th>ประเภท</th><th className="r">{one ? "จำนวนเบิก" : "ต้องใช้"}</th>{!one && <th className="r">เบิกแล้ว</th>}<th style={{ width: 90 }}>ตรวจรับ</th></tr></thead>
          <tbody>{one ? one.production_issue_items.map((x, i) => <tr key={x.id}><td>{i + 1}</td><td>{x.materials?.name}<div style={{ color: "#777", fontSize: 10 }}>{x.materials?.code}</div></td><td>{x.materials ? KIND_TH[x.materials.kind] : ""}</td><td className="r">{fmt(x.qty)} {x.materials?.unit}</td><td>☐</td></tr>)
            : reqs.map((r, i) => <tr key={r.material_id}><td>{i + 1}</td><td>{r.name}<div style={{ color: "#777", fontSize: 10 }}>{r.code}</div></td><td>{KIND_TH[r.kind]}</td><td className="r">{fmt(r.required)} {r.unit}</td><td className="r">{fmt(r.issued)}</td><td>☐</td></tr>)}
            {!one && !reqs.length && <tr><td colSpan={6} style={{ color: "#999", textAlign: "center" }}>ไม่มีวัสดุจาก BOM</td></tr>}</tbody></table>
        {(d.notes || one?.note) && <div className="notes"><div className="lbl">หมายเหตุ</div>{one?.note ?? d.notes}</div>}
        <div className="foot"><div className="signs"><div className="sig">ผู้เบิก / ผู้สั่งผลิต</div><div className="sig">ผู้รับวัสดุ (โรงงาน)</div><div className="sig">ผู้อนุมัติ</div></div></div>
      </div>
    </>
  );
}
