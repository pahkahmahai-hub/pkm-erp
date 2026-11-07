import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { DocEditor } from "@/components/sales/DocEditor";
import { createSalesDoc } from "../../actions";
import { editorData } from "@/lib/sales/queries";
import { DOC_META, type SalesDocType } from "@/lib/sales/types";

export const dynamic = "force-dynamic";

export default async function NewDoc({ searchParams }: { searchParams: Promise<{ type?: string; error?: string }> }) {
  const { type = "quotation", error } = await searchParams;
  const docType = (type in DOC_META ? type : "quotation") as SalesDocType;
  const supabase = await createClient();
  const data = await editorData(supabase);
  return (
    <div className="space-y-6">
      <Header title={`สร้าง${DOC_META[docType].th}`} />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <form action={createSalesDoc} className="space-y-6">
        <DocEditor docType={docType} {...data} />
        <div className="flex gap-3"><button className="btn-primary">บันทึกฉบับร่าง</button><a href={`/sales/docs?type=${docType}`} className="btn-ghost">ยกเลิก</a></div>
        <p className="text-xs text-ink-soft">บันทึกเป็นฉบับร่างก่อน ตรวจแล้วค่อยกด "ออกเอกสาร" ในหน้าถัดไป (เลขที่เอกสารจะถูกจองตั้งแต่บันทึกร่าง)</p>
      </form>
    </div>
  );
}
