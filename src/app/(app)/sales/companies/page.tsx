import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { saveCompany } from "../actions";
import type { Company } from "@/lib/sales/types";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireAdmin();
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("*").order("code");
  const rows = (data ?? []) as Company[];
  return (
    <div className="space-y-6">
      <Header title="ข้อมูลบริษัทบนเอกสาร" sub="ชื่อ ที่อยู่ เลขภาษี ธนาคาร ที่พิมพ์บนเอกสารขาย" />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      {rows.map((c) => (
        <form key={c.id} action={saveCompany.bind(null, c.id)} className="card p-6 grid md:grid-cols-4 gap-3">
          <div className="md:col-span-4 font-display font-bold flex items-center gap-2"><span className="badge-off">{c.code}</span>{c.name_th}</div>
          <div className="md:col-span-2"><label className="label">ชื่อ (ไทย)</label><input name="name_th" defaultValue={c.name_th} className="input" required /></div>
          <div className="md:col-span-2"><label className="label">ชื่อ (อังกฤษ)</label><input name="name_en" defaultValue={c.name_en ?? ""} className="input" /></div>
          <div><label className="label">สาขา</label><input name="branch" defaultValue={c.branch ?? ""} className="input" /></div>
          <div><label className="label">เลขผู้เสียภาษี</label><input name="tax_id" defaultValue={c.tax_id ?? ""} className="input font-mono" /></div>
          <div><label className="label">ภาษาเอกสาร</label><select name="doc_lang" defaultValue={c.doc_lang} className="input"><option value="th">ไทย</option><option value="en">English</option></select></div>
          <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="vat_registered" defaultChecked={c.vat_registered} className="accent-purple" /> จดทะเบียน VAT</label></div>
          <div className="md:col-span-2"><label className="label">ที่อยู่ (ไทย)</label><input name="address_th" defaultValue={c.address_th ?? ""} className="input" /></div>
          <div className="md:col-span-2"><label className="label">ที่อยู่ (อังกฤษ)</label><input name="address_en" defaultValue={c.address_en ?? ""} className="input" /></div>
          <div><label className="label">โทร</label><input name="phone" defaultValue={c.phone ?? ""} className="input" /></div>
          <div><label className="label">มือถือ</label><input name="mobile" defaultValue={c.mobile ?? ""} className="input" /></div>
          <div><label className="label">อีเมล</label><input name="email" defaultValue={c.email ?? ""} className="input" /></div>
          <div><label className="label">เว็บไซต์</label><input name="website" defaultValue={c.website ?? ""} className="input" /></div>
          <div><label className="label">ธนาคาร</label><input name="bank_name" defaultValue={c.bank_name ?? ""} className="input" /></div>
          <div><label className="label">สาขา</label><input name="bank_branch" defaultValue={c.bank_branch ?? ""} className="input" /></div>
          <div><label className="label">ชื่อบัญชี</label><input name="bank_account_name" defaultValue={c.bank_account_name ?? ""} className="input" /></div>
          <div><label className="label">เลขที่บัญชี</label><input name="bank_account_no" defaultValue={c.bank_account_no ?? ""} className="input font-mono" /></div>
          <div className="md:col-span-2"><label className="label">ชื่อผู้มีอำนาจลงนาม (พิมพ์ใต้ลายเซ็น)</label><input name="signer_name" defaultValue={c.signer_name ?? ""} className="input" /></div>
          <div className="md:col-span-4"><button className="btn-primary">บันทึก {c.code}</button></div>
        </form>
      ))}
    </div>
  );
}
