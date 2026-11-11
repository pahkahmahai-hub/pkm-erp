import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { StoreManager } from "@/components/work/StoreManager";
import type { DeliveryStore } from "@/lib/work/deliveries";

export const dynamic = "force-dynamic";

export default async function DeliveryStoresPage({ searchParams }: { searchParams: Promise<{ saved?: string; deleted?: string; error?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session.isAdmin && session.employee?.teams?.abbrev !== "SW") redirect("/work/deliveries");
  const supabase = await createClient();
  const [{ data: stores }, { data: contacts }] = await Promise.all([
    supabase.from("delivery_stores").select("*").order("is_active", { ascending: false }).order("sort_order").order("name"),
    supabase.from("contacts").select("id, name, code").eq("kind", "customer").order("name").limit(1000),
  ]);
  const list = (stores ?? []) as DeliveryStore[];
  return (
    <div className="space-y-4">
      <Header title="จัดการห้าง / สาขา" sub="เพิ่ม แก้ไข ปิด หรือลบห้างในตารางส่งสินค้า — ห้างที่ปิดแล้วจะไม่แสดงในตาราง (ประวัติยังอยู่)" action={<Link href="/work/deliveries" className="btn-outline"><ArrowLeft size={16} /> กลับตาราง</Link>} />
      {sp.saved && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">บันทึกแล้ว</div>}
      {sp.deleted && <div className="rounded-xl bg-green/10 text-green text-sm px-4 py-3">ลบ/ปิดห้างแล้ว</div>}
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      <StoreManager stores={list} contacts={(contacts ?? []) as { id: string; name: string; code: string | null }[]} />
      <p className="text-xs text-ink-soft flex items-center gap-1"><Plus size={12} /> ห้างที่เคยมีประวัติส่งจะถูก “ปิด” แทนการลบ เพื่อให้ตารางเดือนเก่ายังดูย้อนหลังได้</p>
    </div>
  );
}
