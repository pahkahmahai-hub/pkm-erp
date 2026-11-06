const TZ = "Asia/Bangkok";

export function fmtDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00+07:00" : d) : d;
  return new Intl.DateTimeFormat("th-TH", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", ...opts }).format(date);
}

export function fmtDateShort(d: string | null | undefined) {
  return fmtDate(d, { year: "2-digit" });
}

export function fmtTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

/** YYYY-MM-DD of "today" in Bangkok */
export function todayBkk(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

export function currentYm(): string {
  return todayBkk().slice(0, 7);
}

export function fullName(e: { title?: string | null; first_name: string; last_name: string; nickname?: string | null } | null | undefined) {
  if (!e) return "—";
  const n = `${e.title ?? ""}${e.first_name} ${e.last_name}`.trim();
  return e.nickname ? `${n} (${e.nickname})` : n;
}

export const STATUS_TH: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
  probation: "ทดลองงาน",
  active: "พนักงานประจำ",
  resigned: "ลาออกแล้ว",
};

export function statusBadgeClass(s: string) {
  switch (s) {
    case "approved": return "badge-approved";
    case "rejected": return "badge-rejected";
    case "cancelled": return "badge-off";
    default: return "badge-pending";
  }
}

export function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}
