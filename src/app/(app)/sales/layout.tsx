import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { canAccessModule } from "@/lib/access";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canAccessModule(session, "sales")) redirect("/?denied=sales");
  return <>{children}</>;
}
