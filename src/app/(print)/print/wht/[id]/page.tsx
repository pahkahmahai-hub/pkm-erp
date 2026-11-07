import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import type { Company } from "@/lib/sales/types";
import type { WhtCertificate } from "@/lib/expenses/types";
import { WhtSheet } from "@/components/expenses/WhtSheet";

export const dynamic = "force-dynamic";

export default async function PrintWht({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getSession();
  const supabase = await createClient();
  const { data } = await supabase.from("wht_certificates").select("*, companies(*)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as WhtCertificate & { companies: Company };
  return <WhtSheet c={c} co={c.companies} />;
}
