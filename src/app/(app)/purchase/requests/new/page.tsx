import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireAdmin } from "@/lib/session";
import { Header } from "@/components/ui";
import { PurchaseForm } from "@/components/purchase/PurchaseForm";
import { purchaseEditorData } from "@/lib/purchase/queries";
import { createPurchaseDoc } from "../../actions";

export const dynamic = "force-dynamic";
const TYPE = "pr" as "pr" | "po";

export default async function NewPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = TYPE === "po" ? await requireAdmin() : await getSession();
  const supabase = await createClient();
  const data = await purchaseEditorData(supabase);
  const buyer = session.employee ? `${session.employee.first_name} ${session.employee.last_name}` : session.authUser.name ?? undefined;
  return (
    <div className="space-y-6">
      <Header title={TYPE === "pr" ? "เปิดใบขอซื้อภายใน (PR)" : "เปิดใบสั่งซื้อ (PO)"} sub={TYPE === "pr" ? "ระบุของที่ต้องการ → ส่งให้ผู้บริหารอนุมัติ → แปลงเป็น PO" : "สั่งซื้อตรงกับซัพพลายเออร์ (ผู้บริหาร)"} />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <form action={createPurchaseDoc.bind(null, TYPE)} className="space-y-6">
        <PurchaseForm type={TYPE} {...data} buyerDefault={buyer} />
        <div className="flex flex-wrap gap-3">
          {TYPE === "pr" ? <><button name="submit_mode" value="pending" className="btn-primary">ส่งขออนุมัติ</button><button name="submit_mode" value="draft" className="btn-outline">บันทึกร่าง</button></> : <button className="btn-primary">บันทึก PO (ร่าง)</button>}
          <Link href="/purchase/requests" className="btn-ghost">ยกเลิก</Link>
        </div>
      </form>
    </div>
  );
}
