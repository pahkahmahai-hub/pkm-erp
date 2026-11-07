import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { StoreReportImport } from "@/components/sales/StoreReportImport";
import { editorData } from "@/lib/sales/queries";

export const dynamic = "force-dynamic";

export default async function StoreReportsPage() {
  const supabase = await createClient();
  const { companies, customers } = await editorData(supabase);
  return (
    <div className="space-y-6">
      <Header title="นำเข้ารายงานยอดขายห้าง" sub="อัปโหลดไฟล์รายงานจากห้าง → ระบบสรุปยอดต่อสินค้า หัก GP → สร้างใบกำกับ/ใบเสร็จฉบับร่าง 1 ใบต่อสาขาต่อเดือน" />
      <StoreReportImport companies={companies} customers={customers} />
    </div>
  );
}
