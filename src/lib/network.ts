import { headers } from "next/headers";

export interface AllowedNetwork { label: string; ip: string }

/** Public IP of the current request (Vercel sets x-forwarded-for / x-real-ip). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const ip = (xff ? xff.split(",")[0] : h.get("x-real-ip")) ?? "";
  return ip.trim().replace(/^::ffff:/, "");
}

/** Supports exact IPs ("1.2.3.4"), prefixes ("1.2.3.") and CIDR /8–/32 for IPv4. */
export function ipAllowed(ip: string, list: AllowedNetwork[]): boolean {
  if (!ip) return false;
  for (const n of list) {
    const rule = (n.ip ?? "").trim();
    if (!rule) continue;
    if (rule === ip) return true;
    if (rule.endsWith(".") && ip.startsWith(rule)) return true;
    const m = rule.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
    if (m) {
      const toN = (s: string) => s.split(".").reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;
      const bits = Number(m[2]); if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) continue;
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      if ((toN(ip) & mask) === (toN(m[1]) & mask)) return true;
    }
  }
  return false;
}
