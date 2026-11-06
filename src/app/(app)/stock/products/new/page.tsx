import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { canSeeCost } from "@/lib/access";
import { Header } from "@/components/ui";
import { ProductForm } from "../ProductForm";
import { saveProduct } from "../../actions";

export default async function NewProduct({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("dept, sub_dept");
  const depts = [...new Set((data ?? []).map((d) => d.dept).filter(Boolean))] as string[];
  const subs = [...new Set((data ?? []).map((d) => d.sub_dept).filter(Boolean))] as string[];
  return (
    <div className="space-y-6">
      <Header title="เพิ่มสินค้า" />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <form action={saveProduct.bind(null, null)} className="card p-6 space-y-6">
        <ProductForm depts={depts} subDepts={subs} showCost={canSeeCost(session)} />
        <div className="flex gap-3"><button className="btn-primary">บันทึก</button><a href="/stock/products" className="btn-ghost">ยกเลิก</a></div>
      </form>
    </div>
  );
}
