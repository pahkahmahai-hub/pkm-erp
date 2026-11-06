import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { Issue, IssueItem } from "@/lib/stock/types";

export const dynamic = "force-dynamic";

export default async function IssueDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const supabase = await createClient();
  const [{ data: r }, { data: items }] = await Promise.all([
    supabase.from("issues").select("*, contacts(name), app_users(display_name)").eq("id", id).maybeSingle(),
    supabase.from("issue_items").select("*, products(code, name)").eq("issue_id", id),
  ]);
  if (!r) notFound();
  const is = r as Issue;
  return (
    <div className="space-y-6">
      <Header title={`ใบเบิก ${is.issue_no}`} sub={`${fmtDate(is.issue_date)} · ${is.contacts?.name ?? "ไม่ระบุลูกค้า"}`} action={<Link href="/stock/issues" className="btn-ghost">กลับ</Link>} />
      {saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกใบเบิกและตัดสต็อกแล้ว</div>}
      <div className="grid md:grid-cols-3 gap-4 text-sm">
        <div className="card p-4"><div className="text-xs text-ink-soft">เบิกไปทำอะไร</div><div className="font-semibold">{is.purpose ?? "—"}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-soft">ที่มา</div><div className="font-semibold">{is.source === "manual" ? "กรอกเอง" : `FlowAccount ${is.source_doc_no ?? ""}`}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-soft">บันทึกโดย</div><div className="font-semibold">{is.app_users?.display_name ?? "—"}</div><div className="text-xs text-ink-soft">{fmtDateTime(is.created_at)}</div></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>รหัส</th><th>สินค้า</th><th className="text-right">จำนวน</th><th>หมายเหตุ</th></tr></thead>
          <tbody>
            {((items ?? []) as IssueItem[]).map((i) => (
              <tr key={i.id}><td className="font-mono text-xs">{i.products?.code}</td><td>{i.products?.name}</td><td className="text-right font-semibold">{i.qty}</td><td className="text-xs text-ink-soft">{i.note}</td></tr>
            ))}
            <tr><td colSpan={2} className="text-right font-semibold">รวม</td><td className="text-right font-bold">{is.total_qty}</td><td></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
