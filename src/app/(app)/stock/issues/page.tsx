import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { Issue } from "@/lib/stock/types";

export const dynamic = "force-dynamic";

export default async function IssuesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("issues").select("*, contacts(name), app_users(display_name)").order("issue_date", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as Issue[];
  return (
    <div className="space-y-6">
      <Header title="ใบเบิกสินค้า" sub={`${rows.length} ใบ`} action={<Link href="/stock/issues/new" className="btn-primary"><Plus size={16} /> สร้างใบเบิก</Link>} />
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[720px]">
          <thead><tr><th>เลขที่</th><th>วันที่</th><th>ลูกค้า / ปลายทาง</th><th>ที่มา</th><th>เบิกไปทำอะไร</th><th className="text-right">จำนวน</th><th>โดย</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/stock/issues/${r.id}`} className="font-mono text-xs text-purple hover:underline">{r.issue_no}</Link></td>
                <td>{fmtDate(r.issue_date)}</td>
                <td>{r.contacts?.name ?? "—"}</td>
                <td className="text-xs">{r.source === "manual" ? "กรอกเอง" : <span className="badge-off">FlowAccount {r.source_doc_no}</span>}</td>
                <td className="text-xs">{r.purpose ?? "—"}</td>
                <td className="text-right font-semibold">{r.total_qty}</td>
                <td className="text-xs">{r.app_users?.display_name ?? "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="text-center text-ink-soft py-8">ยังไม่มีใบเบิก</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
