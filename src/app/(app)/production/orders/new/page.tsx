import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { Header } from "@/components/ui";
import { MoForm } from "@/components/production/MoForm";
import { moEditorData } from "@/lib/production/queries";
import { createProductionOrder } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewMo({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const data = await moEditorData(supabase);
  return (
    <div className="space-y-6">
      <Header title="เปิดใบสั่งผลิต" sub="เลือกโรงงาน + สินค้า/จำนวน → บันทึก → หน้าถัดไปจะคำนวณวัสดุที่ต้องเบิกตาม BOM" />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <form action={createProductionOrder} className="space-y-6">
        <MoForm {...data} showCost={session.isAdmin} />
        <div className="flex gap-3"><button className="btn-primary">บันทึกใบสั่งผลิต</button><Link href="/production" className="btn-ghost">ยกเลิก</Link></div>
      </form>
    </div>
  );
}
