import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { WhtCertificate } from "@/lib/expenses/types";

import { monthBkk } from "@/lib/today";

export const dynamic = "force-dynamic";
const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });

export default async function WhtList({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const ym = month ?? monthBkk();
  const from = `${ym}-01`; const to = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data } = await supabase.from("wht_certificates").select("*, companies(code)").gte("pay_date", from).lte("pay_date", to).order("cert_no");
  type Row = WhtCertificate & { companies: { code: string } };
  const rows = (data ?? []) as Row[];
  const by = (f: "pnd3" | "pnd53") => rows.filter((r) => r.form === f);
  const sum = (l: Row[]) => l.reduce((a, r) => a + Number(r.wht_amount), 0);
  return (
    <div className="space-y-6">
      <Header title="หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)" sub="สรุปรายเดือนสำหรับยื่น ภ.ง.ด.3 (บุคคล) และ ภ.ง.ด.53 (นิติบุคคล) ภายในวันที่ 7 ของเดือนถัดไป"
        action={<form><input type="month" name="month" defaultValue={ym} className="input" onChange={undefined} /><button className="btn-ghost ml-2">ดู</button></form>} />
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="card p-5"><div className="text-xs text-ink-soft font-semibold">ภ.ง.ด.3 — บุคคลธรรมดา</div><div className="font-display text-2xl font-bold">฿{fmt(sum(by("pnd3")))}</div><div className="text-xs text-ink-soft">{by("pnd3").length} ฉบับ</div></div>
        <div className="card p-5"><div className="text-xs text-ink-soft font-semibold">ภ.ง.ด.53 — นิติบุคคล</div><div className="font-display text-2xl font-bold">฿{fmt(sum(by("pnd53")))}</div><div className="text-xs text-ink-soft">{by("pnd53").length} ฉบับ</div></div>
      </div>
      <div className="card overflow-x-auto"><table className="tbl">
        <thead><tr><th>เลขที่</th><th>แบบ</th><th>วันที่จ่าย</th><th>ผู้ถูกหัก</th><th>เลขผู้เสียภาษี</th><th>ประเภทเงินได้</th><th className="text-right">ฐานเงินได้</th><th className="text-right">%</th><th className="text-right">ภาษีที่หัก</th><th></th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td className="font-mono text-xs">{r.cert_no}<div className="text-[10px] text-ink-soft">{r.companies.code}</div></td><td className="text-xs">{r.form === "pnd53" ? "ภ.ง.ด.53" : "ภ.ง.ด.3"}</td><td>{fmtDate(r.pay_date)}</td><td className="font-medium">{r.payee_name}</td><td className="font-mono text-xs">{r.payee_tax_id ?? "—"}</td><td className="text-xs">{r.income_type}</td><td className="text-right">{fmt(r.income_amount)}</td><td className="text-right">{Number(r.wht_pct)}</td><td className="text-right font-bold">{fmt(r.wht_amount)}</td><td><a href={`/print/wht/${r.id}`} target="_blank" className="text-xs text-purple underline">พิมพ์</a>{r.expense_id && <Link href={`/expenses/${r.expense_id}`} className="text-xs text-ink-soft ml-2">บิล</Link>}</td></tr>)}
          {!rows.length && <tr><td colSpan={10} className="text-center text-ink-soft py-8">ไม่มีการหัก ณ ที่จ่ายในเดือนนี้</td></tr>}</tbody></table></div>
    </div>
  );
}
