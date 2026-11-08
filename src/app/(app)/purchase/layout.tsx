import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { canAccessModule } from "@/lib/access";

export default async function PurchaseLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canAccessModule(session, "purchase")) redirect("/?denied=purchase");
  return <>{children}</>;
}
