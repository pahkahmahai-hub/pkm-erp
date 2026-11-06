import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { saveMaterial } from "../actions";
import { MATERIAL_TH, type Material, type MaterialKind } from "@/lib/stock/types";

export const dynamic = "force-dynamic";

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ kind?: string; error?: string; deleted?: string }> }) {
  const { kind = "fabric", error, deleted } = await searchParams;
  const k = (kind === "packaging" ? "packaging" : "fabric") as MaterialKind;
  const supabase = await createClient();
  const { data } = await supabase.from("materials").select("*").eq("kind", k).eq("is_active", true).order("name");
  const rows = (data ?? []) as Material[];

  return (
    <div className="space-y-6">
      <Header title="ลายผ้า & แพคเกจจิ้ง" sub={`${MATERIAL_TH[k].name} ${rows.length} รายการ · รวม ${rows.reduce((a, r) => a + Number(r.qty), 0).toLocaleString()} ${MATERIAL_TH[k].unit}`} />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      {deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบรายการแล้ว</div>}
      <div className="flex gap-2">
        <Link href="/stock/materials?kind=fabric" className={k === "fabric" ? "btn-primary py-1.5 px-3" : "btn-outline py-1.5 px-3"}>ลายผ้า (ผืน)</Link>
        <Link href="/stock/materials?kind=packaging" className={k === "packaging" ? "btn-primary py-1.5 px-3" : "btn-outline py-1.5 px-3"}>แพคเกจจิ้ง (ชิ้น)</Link>
      </div>

      <form action={saveMaterial.bind(null, null)} className="card p-4 grid sm:grid-cols-[1fr_2fr_1fr_1fr_auto] gap-2 items-end">
        <input type="hidden" name="kind" value={k} />
        <div><label className="label">รหัส</label><input name="code" className="input" placeholder={k === "fabric" ? "F-001" : "PK-001"} /></div>
        <div><label className="label">ชื่อ{k === "fabric" ? "ลาย" : "แพคเกจ"} *</label><input name="name" className="input" required /></div>
        <div><label className="label">ยอดเริ่มต้น ({MATERIAL_TH[k].unit})</label><input name="opening_qty" type="number" step="0.01" defaultValue={0} className="input" /></div>
        <div><label className="label">ขั้นต่ำ</label><input name="min_alert" type="number" step="0.01" defaultValue={0} className="input" /></div>
        <button className="btn-primary">+ เพิ่ม</button>
      </form>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {rows.map((m) => {
          const low = Number(m.min_alert) > 0 && Number(m.qty) <= Number(m.min_alert);
          return (
            <Link key={m.id} href={`/stock/materials/${m.id}`} className="card overflow-hidden hover:border-purple transition">
              {m.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.image_url} alt="" className="w-full aspect-square object-cover" /> : <div className="w-full aspect-square bg-lavender/30 grid place-items-center text-ink-soft text-xs">ยังไม่มีรูป</div>}
              <div className="p-3">
                <div className="font-semibold truncate">{m.name}</div>
                <div className="text-xs text-ink-soft">{m.code ?? "—"}</div>
                <div className={`mt-1 font-display text-xl font-bold ${Number(m.qty) === 0 ? "text-red" : low ? "text-[#8a6a00]" : ""}`}>{Number(m.qty).toLocaleString()} <span className="text-xs font-normal text-ink-soft">{m.unit}</span></div>
              </div>
            </Link>
          );
        })}
        {!rows.length && <div className="card p-8 text-center text-ink-soft col-span-full">ยังไม่มีรายการ — เพิ่มจากฟอร์มด้านบน</div>}
      </div>
    </div>
  );
}
