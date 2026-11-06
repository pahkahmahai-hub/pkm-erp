import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { ProductForm } from "../ProductForm";
import { saveProduct, adjustStock, uploadImage, deleteProduct } from "../../actions";
import { MOVEMENT_TH, type Product, type Movement } from "@/lib/stock/types";
import { ConfirmDelete } from "@/components/stock/ConfirmDelete";
import { ImageUploader } from "@/components/stock/ImageUploader";

export const dynamic = "force-dynamic";

export default async function ProductDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const [{ data: p }, { data: moves }, { data: cats }] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("stock_movements").select("*, app_users(display_name, email)").eq("product_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("products").select("dept, sub_dept"),
  ]);
  if (!p) notFound();
  const product = p as Product;
  const depts = [...new Set((cats ?? []).map((d) => d.dept).filter(Boolean))] as string[];
  const subs = [...new Set((cats ?? []).map((d) => d.sub_dept).filter(Boolean))] as string[];

  return (
    <div className="space-y-6">
      <Header title={product.name} sub={`${product.code} · ${product.barcode ?? "ไม่มีบาร์โค้ด"}`} />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}

      <div className="grid lg:grid-cols-[240px_1fr] gap-6">
        <div className="space-y-4">
          <div className="card p-4">
            <ImageUploader action={uploadImage.bind(null, "products", id)} current={product.image_url} />
          </div>
          <div className="card p-4">
            <div className="text-xs text-ink-soft font-semibold">คงเหลือ (ดี)</div>
            <div className={`font-display text-4xl font-bold ${product.stock_qty === 0 ? "text-red" : ""}`}>{product.stock_qty}</div>
            <div className="text-xs text-ink-soft mt-1">ของเสียค้าง {product.defect_qty} · ขั้นต่ำ {product.min_alert}</div>
          </div>
          <form action={adjustStock.bind(null, id)} className="card p-4 space-y-2">
            <div className="text-sm font-semibold">ปรับยอด (นับสต็อก)</div>
            <input name="new_qty" type="number" min={0} defaultValue={product.stock_qty} className="input" required />
            <input name="reason" className="input" placeholder="เหตุผล (บังคับ)" required />
            <button className="btn-outline w-full">บันทึกยอดใหม่</button>
            <p className="text-[11px] text-ink-soft">ระบบจะบันทึกชื่อผู้ปรับและผลต่างไว้ในประวัติ</p>
          </form>
        </div>

        <div className="space-y-6">
          <form action={saveProduct.bind(null, id)} className="card p-6 space-y-6">
            <ProductForm p={product} depts={depts} subDepts={subs} />
            <div className="flex flex-wrap gap-3 items-center">
              <button className="btn-primary">บันทึก</button>
              <a href="/stock/products" className="btn-ghost">กลับ</a>
              <span className="ml-auto"><ConfirmDelete action={deleteProduct.bind(null, id)} label="ลบสินค้า" warning="ลบได้เฉพาะสินค้าที่ยังไม่มีประวัติรับเข้า/เบิก ถ้ามีแล้วให้ติ๊ก 'ปิดใช้งาน' แทน" /></span>
            </div>
          </form>

          <section className="card overflow-x-auto">
            <div className="px-5 pt-4 font-display font-bold">ประวัติเคลื่อนไหว</div>
            <table className="tbl">
              <thead><tr><th>เวลา</th><th>ประเภท</th><th className="text-right">จำนวน</th><th className="text-right">คงเหลือ</th><th>อ้างอิง</th><th>โดย</th><th>หมายเหตุ</th></tr></thead>
              <tbody>
                {((moves ?? []) as Movement[]).map((m) => (
                  <tr key={m.id}>
                    <td className="text-xs whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                    <td><span className="badge-off">{MOVEMENT_TH[m.movement_type]}</span></td>
                    <td className={`text-right font-semibold ${m.qty < 0 ? "text-red" : m.qty > 0 ? "text-green" : ""}`}>{m.qty !== 0 ? (m.qty > 0 ? `+${m.qty}` : m.qty) : `${m.defect_delta > 0 ? "+" : ""}${m.defect_delta} เสีย`}</td>
                    <td className="text-right">{m.balance_after}</td>
                    <td className="font-mono text-xs">{m.ref_no ?? "—"}</td>
                    <td className="text-xs">{m.app_users?.display_name ?? "ระบบ"}</td>
                    <td className="text-xs text-ink-soft">{m.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
