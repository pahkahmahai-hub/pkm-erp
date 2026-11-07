import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { DocEditor } from "@/components/sales/DocEditor";
import { updateSalesDoc } from "../../../actions";
import { editorData } from "@/lib/sales/queries";
import { DOC_META, type SalesDoc, type SalesDocItem } from "@/lib/sales/types";

export const dynamic = "force-dynamic";

export default async function EditDoc({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; from?: string }> }) {
  const { id } = await params;
  const { error, from } = await searchParams;
  const supabase = await createClient();
  const [{ data: doc }, { data: items }, data] = await Promise.all([
    supabase.from("sales_docs").select("*").eq("id", id).maybeSingle(),
    supabase.from("sales_doc_items").select("*").eq("doc_id", id).order("line_no"),
    editorData(supabase),
  ]);
  if (!doc) notFound();
  const d = doc as SalesDoc;
  if (d.status !== "draft") redirect(`/sales/docs/${id}`);
  return (
    <div className="space-y-6">
      <Header title={`แก้ไข ${DOC_META[d.doc_type].th}`} sub={d.doc_no} />
      {from && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">สร้างจากเอกสาร {d.ref_doc_no} แล้ว ตรวจรายการ/วันที่ แล้วบันทึก</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <form action={updateSalesDoc.bind(null, id)} className="space-y-6">
        <DocEditor docType={d.doc_type} doc={d} items={(items ?? []) as SalesDocItem[]} {...data} />
        <div className="flex gap-3"><button className="btn-primary">บันทึก</button><a href={`/sales/docs/${id}`} className="btn-ghost">ยกเลิก</a></div>
      </form>
    </div>
  );
}
