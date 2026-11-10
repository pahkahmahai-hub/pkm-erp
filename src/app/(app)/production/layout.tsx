import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { canAccessModule } from "@/lib/access";

export default async function ProductionLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canAccessModule(session, "production")) redirect("/?denied=production");
  return <>{children}</>;
}
