import type { SessionInfo } from "@/lib/types";

/**
 * Module access rules.
 * - admin: everything
 * - team GC: HR + online stock only (sees other cards greyed out)
 * - everyone else (SW, accounts without employee): all live modules
 */
export function canAccessModule(session: SessionInfo, moduleKey: string): boolean {
  if (session.isAdmin) return true;
  const team = session.employee?.teams?.abbrev;
  if (team === "GC") return ["hr", "online-stock", "work"].includes(moduleKey);
  return true;
}

/** Cost prices are admin-only. */
export function canSeeCost(session: SessionInfo): boolean {
  return session.isAdmin;
}
