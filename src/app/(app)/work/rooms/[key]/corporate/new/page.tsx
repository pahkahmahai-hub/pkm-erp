import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { loadRoomAccess, loadDirectory } from "@/lib/work/queries";
import { CorpOrderForm } from "@/components/work/CorpOrderForm";
import { todayBkk } from "@/lib/today";

export const dynamic = "force-dynamic";

export default async function NewCorpOrder({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ error?: string }> }) {
  const { key } = await params;
  if (key !== "operation") notFound();
  const sp = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const acc = await loadRoomAccess(supabase, key, session);
  if (!acc) notFound();
  if (!acc.isMember) redirect("/work?denied=1");
  const [{ data: cust }, dir] = await Promise.all([supabase.from("corp_orders").select("customer_name").limit(2000), loadDirectory(supabase)]);
  const customers = [...new Set((cust ?? []).map((c) => c.customer_name as string))].sort((a, b) => a.localeCompare(b, "th"));
  const crumbs: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }, { href: `/work/rooms/${key}`, label: acc.room.name }, { href: `/work/rooms/${key}/corporate`, label: "Corporate" }];
  return (
    <div className="space-y-4 max-w-4xl">
      <Header crumbs={crumbs} title="ออเดอร์ Corporate ใหม่" sub="เลขออเดอร์ (ORD-xxx) ระบบตั้งให้อัตโนมัติ · แนบไฟล์ได้หลังบันทึก" />
      {sp.error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{sp.error}</div>}
      <CorpOrderForm customers={customers} people={dir.map((e) => ({ id: e.id, name: e.nickname ?? e.first_name }))} today={todayBkk()} cancelHref={`/work/rooms/${key}/corporate`} />
    </div>
  );
}
