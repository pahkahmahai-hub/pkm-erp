import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { Header } from "@/components/ui";
import { saveContact, deleteContact } from "../actions";
import type { Contact } from "@/lib/stock/types";

export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; edit?: string; saved?: string; error?: string }> }) {
  const { kind = "customer", q = "", edit, saved, error } = await searchParams;
  const k = kind === "supplier" ? "supplier" : "customer";
  const session = await getSession();
  const supabase = await createClient();
  let query = supabase.from("contacts").select("*").eq("kind", k).eq("is_active", true).order("name").limit(500);
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,tax_id.ilike.%${q}%,contact_name.ilike.%${q}%`);
  const [{ data }, { data: editing }] = await Promise.all([query, edit ? supabase.from("contacts").select("*").eq("id", edit).maybeSingle() : Promise.resolve({ data: null })]);
  const rows = (data ?? []) as Contact[];
  const e = editing as Contact | null;

  return (
    <div className="space-y-6">
      <Header title="สมุดรายชื่อ" sub={`${k === "customer" ? "ลูกค้า" : "ซัพพลายเออร์"} ${rows.length} ราย`} />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <div className="flex flex-wrap gap-2 items-end">
        <Link href="/stock/contacts?kind=customer" className={k === "customer" ? "btn-primary py-1.5 px-3" : "btn-outline py-1.5 px-3"}>ลูกค้า</Link>
        <Link href="/stock/contacts?kind=supplier" className={k === "supplier" ? "btn-primary py-1.5 px-3" : "btn-outline py-1.5 px-3"}>ซัพพลายเออร์</Link>
        <form className="flex gap-2 ml-auto"><input type="hidden" name="kind" value={k} /><input name="q" defaultValue={q} className="input w-64" placeholder="ค้นหา ชื่อ / รหัส / เลขภาษี" /><button className="btn-outline">ค้นหา</button></form>
      </div>

      <form action={saveContact.bind(null, e?.id ?? null)} className="card p-5 grid md:grid-cols-4 gap-3">
        <input type="hidden" name="kind" value={e?.kind ?? k} />
        <div className="md:col-span-4 font-display font-bold">{e ? `แก้ไข: ${e.name}` : `เพิ่ม${k === "customer" ? "ลูกค้า" : "ซัพพลายเออร์"}ใหม่`}</div>
        <div className="md:col-span-2"><label className="label">ชื่อ *</label><input name="name" defaultValue={e?.name ?? ""} className="input" required /></div>
        <div><label className="label">รหัส</label><input name="code" defaultValue={e?.code ?? ""} className="input" /></div>
        <div><label className="label">ประเภท</label><select name="entity_type" defaultValue={e?.entity_type ?? "company"} className="input"><option value="company">นิติบุคคล</option><option value="person">บุคคลธรรมดา</option></select></div>
        <div><label className="label">เลขผู้เสียภาษี</label><input name="tax_id" defaultValue={e?.tax_id ?? ""} className="input font-mono" /></div>
        <div><label className="label">สาขา</label><input name="branch_code" defaultValue={e?.branch_code ?? ""} className="input" placeholder="00000" /></div>
        <div><label className="label">ผู้ติดต่อ</label><input name="contact_name" defaultValue={e?.contact_name ?? ""} className="input" /></div>
        <div><label className="label">มือถือ</label><input name="mobile" defaultValue={e?.mobile ?? ""} className="input" /></div>
        <div className="md:col-span-2"><label className="label">ที่อยู่</label><input name="address" defaultValue={e?.address ?? ""} className="input" /></div>
        <div><label className="label">รหัสไปรษณีย์</label><input name="postcode" defaultValue={e?.postcode ?? ""} className="input" /></div>
        <div><label className="label">อีเมล</label><input name="email" defaultValue={e?.email ?? ""} className="input" /></div>
        <div><label className="label">โทรสำนักงาน</label><input name="office_phone" defaultValue={e?.office_phone ?? ""} className="input" /></div>
        <div><label className="label">เครดิต (วัน)</label><input name="credit_days" type="number" defaultValue={e?.credit_days ?? 0} className="input" /></div>
        {k === "customer" && <>
          <div><label className="label">ส่วนลด / GP ประจำ (%)</label><input name="default_discount_pct" type="number" step="0.01" min={0} max={100} defaultValue={(e as unknown as { default_discount_pct?: number })?.default_discount_pct ?? 0} className="input" placeholder="เช่น 35" /></div>
          <div><label className="label">ช่องทางประจำ</label><select name="default_channel" defaultValue={(e as unknown as { default_channel?: string })?.default_channel ?? ""} className="input"><option value="">—</option><option value="store">ห้างสรรพสินค้า</option><option value="corporate">Corporate / B2B</option><option value="online">ออนไลน์</option><option value="export">ต่างประเทศ</option><option value="intercompany">ระหว่างบริษัท</option></select></div>
          <div><label className="label">VAT ประจำ</label><select name="default_vat_mode" defaultValue={(e as unknown as { default_vat_mode?: string })?.default_vat_mode ?? ""} className="input"><option value="">ตามค่าเริ่มต้น</option><option value="inclusive">ราคารวม VAT</option><option value="exclusive">ราคาก่อน VAT</option></select></div>
        </>}
        <div className="md:col-span-2"><label className="label">หมายเหตุ</label><input name="note" defaultValue={e?.note ?? ""} className="input" /></div>
        <div className="md:col-span-4 flex gap-2"><button className="btn-primary">{e ? "บันทึกการแก้ไข" : "เพิ่ม"}</button>{e && <Link href={`/stock/contacts?kind=${k}`} className="btn-ghost">ยกเลิก</Link>}</div>
      </form>

      <div className="card overflow-x-auto">
        <table className="tbl min-w-[760px]">
          <thead><tr><th>รหัส</th><th>ชื่อ</th><th>เลขภาษี</th><th>ผู้ติดต่อ</th><th>โทร</th><th>เครดิต</th>{k === "customer" && <th>GP%</th>}<th></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="font-mono text-xs">{c.code ?? "—"}</td>
                <td className="font-medium">{c.name}{c.branch_code && <span className="text-xs text-ink-soft ml-1">สาขา {c.branch_code}</span>}</td>
                <td className="font-mono text-xs">{c.tax_id ?? "—"}</td>
                <td className="text-xs">{c.contact_name ?? "—"}</td>
                <td className="text-xs">{c.mobile ?? c.office_phone ?? "—"}</td>
                <td className="text-xs">{c.credit_days ? `${c.credit_days} วัน` : "—"}</td>
                {k === "customer" && <td className="text-xs font-semibold">{Number((c as unknown as { default_discount_pct?: number }).default_discount_pct ?? 0) > 0 ? `${(c as unknown as { default_discount_pct?: number }).default_discount_pct}%` : "—"}</td>}
                <td className="whitespace-nowrap text-xs">
                  <Link href={`/stock/contacts?kind=${k}&edit=${c.id}`} className="text-purple mr-3">แก้ไข</Link>
                  {session.isAdmin && <form action={deleteContact.bind(null, c.id)} className="inline"><button className="text-red">ลบ</button></form>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="text-center text-ink-soft py-8">ไม่พบรายชื่อ</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
