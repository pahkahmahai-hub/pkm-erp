import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { MonthPicker } from "@/components/MonthPicker";
import { fmtDateTime, currentYm, monthRange } from "@/lib/format";
import { MOVEMENT_TH, type Movement, type MovementType } from "@/lib/stock/types";
import { ExportMovements } from "./ExportMovements";
import Link from "next/link";
import { MATERIAL_TH, type MaterialMovement, type MaterialKind } from "@/lib/stock/types";

export const dynamic = "force-dynamic";

const MAT_TYPE_TH: Record<string, string> = { opening: "ยอดเริ่มต้น", receive: "รับเข้า", issue: "เบิกออก", adjust: "ปรับยอด" };
type MatMove = MaterialMovement & { materials: { name: string; code: string | null; kind: MaterialKind; unit: string } | null; contacts: { name: string } | null };

export default async function MovementsPage({ searchParams }: { searchParams: Promise<{ ym?: string; type?: string; q?: string; kind?: string }> }) {
  const { ym = currentYm(), type = "", q = "", kind = "products" } = await searchParams;
  const { from, to } = monthRange(ym);
  const supabase = await createClient();

  if (kind === "materials") {
    let mq = supabase.from("material_movements").select("*, materials!inner(name, code, kind, unit), contacts(name), app_users(display_name)")
      .gte("created_at", from + "T00:00:00+07:00").lte("created_at", to + "T23:59:59+07:00").order("created_at", { ascending: false }).limit(1000);
    if (q) mq = mq.ilike("materials.name", `%${q}%`);
    const { data } = await mq;
    const mrows = (data ?? []) as MatMove[];
    return (
      <div className="space-y-6">
        <Header title="ประวัติเคลื่อนไหว" sub={`ลายผ้า & แพคเกจจิ้ง · ${mrows.length} รายการ`} />
        <Tabs kind={kind} />
        <form className="flex flex-wrap gap-2 items-end">
          <input type="hidden" name="kind" value="materials" />
          <MonthPicker value={ym} />
          <div><label className="label">ชื่อ</label><input name="q" defaultValue={q} className="input w-56" /></div>
          <button className="btn-outline">แสดง</button>
        </form>
        <div className="card overflow-x-auto">
          <table className="tbl min-w-[760px]">
            <thead><tr><th>เวลา</th><th>ประเภท</th><th>รายการ</th><th className="text-right">จำนวน</th><th className="text-right">คงเหลือ</th><th>ซัพพลายเออร์</th><th>โดย</th><th>หมายเหตุ</th></tr></thead>
            <tbody>
              {mrows.map((m) => (
                <tr key={m.id}>
                  <td className="text-xs whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                  <td><span className="badge-off">{MAT_TYPE_TH[m.movement_type] ?? m.movement_type}</span></td>
                  <td><span className="badge-ok mr-1">{m.materials ? MATERIAL_TH[m.materials.kind].name : ""}</span>{m.materials?.name}</td>
                  <td className={`text-right font-semibold ${Number(m.qty) < 0 ? "text-red" : "text-green"}`}>{Number(m.qty) > 0 ? "+" : ""}{Number(m.qty).toLocaleString()} {m.materials?.unit}</td>
                  <td className="text-right">{Number(m.balance_after).toLocaleString()}</td>
                  <td className="text-xs">{m.contacts?.name ?? "—"}</td>
                  <td className="text-xs">{m.app_users?.display_name ?? "ระบบ"}</td>
                  <td className="text-xs text-ink-soft">{m.note}</td>
                </tr>
              ))}
              {!mrows.length && <tr><td colSpan={8} className="text-center text-ink-soft py-8">ไม่มีรายการ</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  let query = supabase.from("stock_movements").select("*, products!inner(code, name, barcode), app_users(display_name, email)")
    .gte("created_at", from + "T00:00:00+07:00").lte("created_at", to + "T23:59:59+07:00").order("created_at", { ascending: false }).limit(1000);
  if (type) query = query.eq("movement_type", type);
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`, { referencedTable: "products" });
  const { data } = await query;
  const rows = (data ?? []) as Movement[];

  return (
    <div className="space-y-6">
      <Header title="ประวัติเคลื่อนไหว" sub={`สินค้า · ${rows.length} รายการ`} action={<ExportMovements rows={rows} ym={ym} />} />
      <Tabs kind={kind} />
      <form className="flex flex-wrap gap-2 items-end">
        <MonthPicker value={ym} />
        <div><label className="label">ประเภท</label>
          <select name="type" defaultValue={type} className="input w-48"><option value="">ทั้งหมด</option>{(Object.keys(MOVEMENT_TH) as MovementType[]).map((k) => <option key={k} value={k}>{MOVEMENT_TH[k]}</option>)}</select></div>
        <div><label className="label">สินค้า</label><input name="q" defaultValue={q} className="input w-56" placeholder="ชื่อ / รหัส" /></div>
        <button className="btn-outline">แสดง</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[820px]">
          <thead><tr><th>เวลา</th><th>ประเภท</th><th>สินค้า</th><th className="text-right">จำนวน</th><th className="text-right">คงเหลือ</th><th>อ้างอิง</th><th>โดย</th><th>หมายเหตุ</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="text-xs whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                <td><span className="badge-off">{MOVEMENT_TH[m.movement_type]}</span></td>
                <td><span className="font-mono text-xs text-ink-soft mr-1">{m.products?.code}</span>{m.products?.name}</td>
                <td className={`text-right font-semibold ${m.qty < 0 ? "text-red" : m.qty > 0 ? "text-green" : ""}`}>{m.qty !== 0 ? (m.qty > 0 ? `+${m.qty}` : m.qty) : `${m.defect_delta > 0 ? "+" : ""}${m.defect_delta} เสีย`}</td>
                <td className="text-right">{m.balance_after}</td>
                <td className="font-mono text-xs">{m.ref_no ?? "—"}</td>
                <td className="text-xs">{m.app_users?.display_name ?? "ระบบ"}</td>
                <td className="text-xs text-ink-soft">{m.note}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="text-center text-ink-soft py-8">ไม่มีรายการ</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tabs({ kind }: { kind: string }) {
  return (
    <div className="flex gap-2">
      <Link href="/stock/movements" className={kind !== "materials" ? "btn-primary py-1.5 px-3" : "btn-outline py-1.5 px-3"}>สินค้า</Link>
      <Link href="/stock/movements?kind=materials" className={kind === "materials" ? "btn-primary py-1.5 px-3" : "btn-outline py-1.5 px-3"}>ลายผ้า & แพคเกจจิ้ง</Link>
    </div>
  );
}
