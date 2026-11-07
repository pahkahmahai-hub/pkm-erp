/**
 * Parsers for department-store sales reports (xlsx) → one draft document per store branch per month.
 *
 * Supported formats
 *  1. Central / สารพัดไทย "SalesByVendor" export — one row per sold piece, has GP% columns
 *  2. VerticalTec POS "Product Report" (Hug Craft / ICONCRAFT etc.) — daily rows per product, no GP
 *
 * Everything runs in the browser with the `xlsx` package; the server only receives the aggregated lines.
 */
import * as XLSX from "xlsx";

export type ReportFormat = "central_vendor" | "verticaltec_product";

export interface StoreLine {
  barcode: string | null;
  code: string | null;        // store's own item code
  description: string;
  qty: number;
  gross: number;              // qty × retail price (before line discounts)
  net: number;                // after line discounts, before GP
  vendor: number | null;      // amount actually due to vendor (Central file only)
}

export interface StoreBlock {
  key: string;                // storeCode or shopName
  storeCode: string | null;
  storeName: string;
  periodFrom: string;         // yyyy-mm-dd
  periodTo: string;
  gpPct: number | null;       // effective GP% from file when present (1 - vendor/net)
  rows: number;
  lines: StoreLine[];
  gross: number;
  net: number;
  vendor: number | null;      // sum of Final Vendor Amt (Central)
}

export interface ParsedReport {
  format: ReportFormat;
  formatLabel: string;
  blocks: StoreBlock[];
  warnings: string[];
}

type Row = Record<string, unknown>;

const num = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? "" : String(v).trim());

function isoDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // xlsx creates Dates at local midnight (or a few ms off) — read local parts, never toISOString (UTC shift)
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") { // excel serial
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = str(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);          // dd/mm/yyyy (VerticalTec)
  if (m) { let y = Number(m[3]); if (y > 2400) y -= 543; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}

function finish(map: Map<string, StoreBlock>): StoreBlock[] {
  return [...map.values()].map((b) => {
    b.lines.sort((a, c) => c.net - a.net);
    b.gross = round2(b.lines.reduce((s, l) => s + l.gross, 0));
    b.net = round2(b.lines.reduce((s, l) => s + l.net, 0));
    if (b.lines.some((l) => l.vendor != null)) {
      b.vendor = round2(b.lines.reduce((s, l) => s + (l.vendor ?? 0), 0));
      b.gpPct = b.net > 0 ? round2((1 - b.vendor / b.net) * 100) : null;
    }
    b.lines.forEach((l) => { l.gross = round2(l.gross); l.net = round2(l.net); if (l.vendor != null) l.vendor = round2(l.vendor); });
    return b;
  }).sort((a, c) => a.key.localeCompare(c.key));
}
const round2 = (n: number) => Math.round(n * 100) / 100;

function addLine(block: StoreBlock, lineKey: string, make: () => StoreLine, qty: number, gross: number, net: number, vendor: number | null = null) {
  let l = block.lines.find((x) => (x.barcode ?? x.code ?? x.description) === lineKey);
  if (!l) { l = make(); block.lines.push(l); }
  l.qty += qty; l.gross += gross; l.net += net;
  if (vendor != null) l.vendor = (l.vendor ?? 0) + vendor;
  block.rows += 1;
}

function parseCentral(rows: Row[]): ParsedReport {
  const map = new Map<string, StoreBlock>();
  const warnings: string[] = [];
  for (const r of rows) {
    const storeCode = str(r["Store Code"]);
    if (!storeCode) continue;
    const date = isoDate(r["Trans Date"]);
    const qty = num(r["Quantity"]);
    const gross = num(r["Sales Amt"]) || num(r["Sales Price"]) * qty;
    const net = r["Net Sale"] != null ? num(r["Net Sale"]) : gross - num(r["Disc Amt"]);
    const vendor = r["Final Vendor Amt"] != null ? num(r["Final Vendor Amt"]) : r["Vendor Amt"] != null ? num(r["Vendor Amt"]) : null;
    let b = map.get(storeCode);
    if (!b) {
      b = { key: storeCode, storeCode, storeName: str(r["Store Name"]) || storeCode, periodFrom: date ?? "", periodTo: date ?? "", gpPct: null, rows: 0, lines: [], gross: 0, net: 0, vendor: null };
      map.set(storeCode, b);
    }
    if (date) { if (!b.periodFrom || date < b.periodFrom) b.periodFrom = date; if (!b.periodTo || date > b.periodTo) b.periodTo = date; }
    const barcode = str(r["Barcode"]) || null;
    const code = str(r["Item Code"]) || null;
    addLine(b, barcode ?? code ?? str(r["Item Desc"]), () => ({ barcode, code, description: str(r["Item Desc"]), qty: 0, gross: 0, net: 0, vendor: null }), qty, gross, net, vendor);
  }
  if (map.size) warnings.push("GP ในไฟล์ Central ต่างกันรายบรรทัด (โปรโมชัน/ส่วนลดร่วม) — ระบบใช้ GP เฉลี่ยจริงจากยอด Final Vendor Amt ของแต่ละสาขา");
  return { format: "central_vendor", formatLabel: "Central / สารพัดไทย — SalesByVendor", blocks: finish(map), warnings };
}

function parseVerticalTec(rows: Row[]): ParsedReport {
  const map = new Map<string, StoreBlock>();
  const warnings: string[] = [];
  for (const r of rows) {
    const date = isoDate(r["Date"]);
    const shop = str(r["Shop Name"]);
    if (!date || !shop) continue; // footer rows (Export By …)
    const qty = num(r["QTY"]);
    const gross = num(r["Total Retail Price"]);
    const net = r["Net Sales"] != null ? num(r["Net Sales"]) : gross - num(r["Discount"]);
    let b = map.get(shop);
    if (!b) {
      const codeMatch = shop.match(/^([A-Z0-9]+)\s/);
      b = { key: shop, storeCode: codeMatch ? codeMatch[1] : null, storeName: shop, periodFrom: date, periodTo: date, gpPct: null, rows: 0, lines: [], gross: 0, net: 0, vendor: null };
      map.set(shop, b);
    }
    if (date < b.periodFrom) b.periodFrom = date; if (date > b.periodTo) b.periodTo = date;
    const pcode = str(r["Product Code"]);
    const bc = pcode.match(/(\d{8,14})$/);
    const barcode = bc ? bc[1] : null;
    addLine(b, barcode ?? pcode ?? str(r["Product Name"]), () => ({ barcode, code: pcode || null, description: str(r["Product Name"]), qty: 0, gross: 0, net: 0, vendor: null }), qty, gross, net);
  }
  if (!map.size) warnings.push("ไม่พบแถวข้อมูลที่มีวันที่และชื่อร้าน");
  return { format: "verticaltec_product", formatLabel: "VerticalTec POS — Product Report (Hug Craft ฯลฯ)", blocks: finish(map), warnings };
}

/** Find the header row (first row containing a known header) and return objects keyed by header. */
function sheetRows(ws: XLSX.WorkSheet, headers: string[]): Row[] | null {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const cells = (aoa[i] ?? []).map((c) => str(c));
    if (headers.every((h) => cells.includes(h))) {
      const keys = cells;
      return aoa.slice(i + 1).map((row) => { const o: Row = {}; keys.forEach((k, j) => { if (k) o[k] = row[j]; }); return o; });
    }
  }
  return null;
}

export function parseStoreReport(buf: ArrayBuffer): ParsedReport {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const central = sheetRows(ws, ["Store Code", "Trans Date", "Quantity", "Net Sale"]);
    if (central) return parseCentral(central);
    const vt = sheetRows(ws, ["Date", "Shop Name", "Product Code", "QTY", "Net Sales"]);
    if (vt) return parseVerticalTec(vt);
  }
  throw new Error("ยังไม่รู้จักรูปแบบไฟล์นี้ — รองรับ Central SalesByVendor และ VerticalTec Product Report (ส่งตัวอย่างไฟล์ให้เพิ่มได้)");
}

export const FORMAT_HINT = "รองรับ: Central / สารพัดไทย (SalesByVendor .xlsx) · Hug Craft / ICONCRAFT (VerticalTec Product Report .xlsx)";
