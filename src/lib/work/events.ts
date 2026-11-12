// ปฏิทินบริษัท — shared helpers (server + client)
import type { CompanyEvent } from "./types";
import { addDays } from "./deliveries";

/** one visible occurrence of an event (recurring events are expanded per month) */
export interface Occ { ev: CompanyEvent; start: string; end: string }
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

/** expand recurring events into occurrences overlapping [from, to] */
export function expandEvents(events: CompanyEvent[], from: string, to: string): Occ[] {
  const out: Occ[] = [];
  for (const ev of events) {
    const len = dayDiff(ev.start_date, ev.end_date);
    if (!ev.recur) { if (ev.end_date >= from && ev.start_date <= to) out.push({ ev, start: ev.start_date, end: ev.end_date }); continue; }
    const until = ev.recur_until && ev.recur_until < to ? ev.recur_until : to;
    let s = ev.start_date;
    for (let i = 0; i < 120 && s <= until; i++) {
      const e = addDays(s, len);
      if (e >= from && s <= to) out.push({ ev, start: s, end: e });
      if (ev.recur === "weekly") s = addDays(s, 7);
      else { const d = new Date(s + "T00:00:00Z"); const dom = new Date(ev.start_date + "T00:00:00Z").getUTCDate(); const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); const last = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)).getUTCDate(); n.setUTCDate(Math.min(dom, last)); s = n.toISOString().slice(0, 10); }
    }
  }
  return out;
}

