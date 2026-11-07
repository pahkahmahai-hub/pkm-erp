import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { canAccessModule } from "@/lib/access";

export default async function ExpensesLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canAccessModule(session, "expenses")) redirect("/?denied=expenses");
  return <>{children}</>;
}
