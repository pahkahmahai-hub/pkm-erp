/**
 * Parses the text of a FlowAccount sales document PDF (ใบส่งสินค้า / ใบแจ้งหนี้ / ใบกำกับภาษี)
 * into header fields + line items. Works on the text produced by pdf-parse.
 */
export interface ParsedLine {
  barcode: string | null;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
  raw: string;
}
export interface ParsedDoc {
  docNo: string | null;
  docDate: string | null;   // DD/MM/YYYY as printed
  customerName: string | null;
  customerTaxId: string | null;
  lines: ParsedLine[];
  unmatched: string[];      // item text we could not parse into a barcode line
}

const THAI_MARKS = /[ัิ-ฺ็-๎]/g; // combining vowels/tone marks that pdf-parse emits on their own lines

export function cleanPdfText(text: string) {
  // pdf-parse puts Thai combining marks on their own line: "ชิ\n้\nน" → glue them back: "ชิ้น"
  const src = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (let i = 0; i < src.length; i++) {
    const l = src[i];
    const isMark = l.trim().length > 0 && l.replace(THAI_MARKS, "").trim().length === 0;
    if (isMark && out.length) {
      out[out.length - 1] = out[out.length - 1].replace(/\s+$/, "") + l.trim() + (src[i + 1] ?? "").replace(/^\s+/, "");
      i++; // consumed next line
    } else if (!isMark) {
      out.push(l);
    }
  }
  return out
    .map((l) => l.replace(/\u0E4D\u0E32+/g, "\u0E33").replace(/\s+$/g, "")) // "ําา" → "ำ"
    .filter((l) => l.trim().length > 0)
    .join("\n");
}

export function parseFlowAccountPdfText(rawText: string): ParsedDoc {
  const text = cleanPdfText(rawText);
  const flat = text.replace(/\n/g, " ").replace(/\s+/g, " ");

  const docNo = flat.match(/เลขที่\s*([A-Z]{2,4}\d{6,})/)?.[1] ?? flat.match(/\b((?:INV|DN|BL|RE|QT|IV|DO)\d{6,})\b/)?.[1] ?? null;
  const docDate = flat.match(/วันที่\s*(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null;

  // customer block: the lines right after a line that is exactly "ลูกค้า"
  let customerName: string | null = null;
  let customerTaxId: string | null = null;
  const tl = text.split("\n").map((l) => l.trim());
  const ci = tl.findIndex((l) => /^ลูกค้า$/.test(l));
  if (ci >= 0) {
    customerName = tl[ci + 1] ?? null;
    for (let i = ci + 1; i < Math.min(tl.length, ci + 8); i++) {
      const t = tl[i].match(/ภาษี\s*(\d{13})/);
      if (t) { customerTaxId = t[1]; break; }
      if (/^ใบ|^เลขที่|^#/.test(tl[i])) break;
    }
  }

  // items block: first table header "#" up to "รวมเป็นเงิน" (page 2 is a copy — ignore)
  const hashIdx = text.search(/#\s*รายละเอียด/);
  const startIdx = hashIdx >= 0 ? hashIdx : 0;
  const endMatch = text.slice(startIdx).search(/รวมเป็นเงิน|\(\s*[฀-๿]+บาท/);
  const itemsText = text.slice(startIdx, endMatch > 0 ? startIdx + endMatch : undefined).replace(/\n/g, " ");

  const lines: ParsedLine[] = [];
  const unmatched: string[] = [];
  const re = /(\d{13})\s*([^\d]*?)\s*(\d+)\s*([^\d\s.,]+)\s*([\d,]+\.\d{2})\s*([\d,]+\.\d{2})/g;
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  const consumed: [number, number][] = [];
  while ((m = re.exec(itemsText))) {
    const [, barcode, tailName, qty, unit, price, total] = m;
    // name = text between previous match end and this barcode, minus the leading item number
    const before = itemsText.slice(lastEnd, m.index).replace(/^.*?#\s*รายละเอียด.*?ยอดรวม/, "").trim();
    const name = (before + " " + tailName).replace(/^\d+\s*/, "").replace(/\s+/g, " ").trim();
    lines.push({ barcode, name, qty: Number(qty), unit, unitPrice: Number(price.replace(/,/g, "")), total: Number(total.replace(/,/g, "")), raw: m[0] });
    consumed.push([m.index, re.lastIndex]);
    lastEnd = re.lastIndex;
  }
  // anything left with a qty/price pattern but no barcode → unmatched
  const leftover = itemsText.slice(lastEnd);
  const re2 = /(\d+)\s*([^\d\s.,]+)\s*([\d,]+\.\d{2})\s*([\d,]+\.\d{2})/g;
  const seen = new Set(lines.map((l) => l.raw));
  for (const chunk of [leftover, ...(lines.length ? [] : [itemsText])]) {
    let n: RegExpExecArray | null;
    while ((n = re2.exec(chunk))) {
      const s = chunk.slice(Math.max(0, n.index - 80), re2.lastIndex).trim();
      if (![...seen].some((r) => s.includes(r))) unmatched.push(s);
    }
  }
  // also catch non-barcode lines that sit *between* matched lines (e.g. customer-coded items)
  const between = consumed.length ? [itemsText.slice(0, consumed[0][0])] : [];
  for (let i = 1; i < consumed.length; i++) between.push(itemsText.slice(consumed[i - 1][1], consumed[i][0]));
  for (const seg of between) {
    const n = seg.match(/(\d+)\s*([^\d\s.,]+)\s*([\d,]+\.\d{2})\s*([\d,]+\.\d{2})/);
    if (n) unmatched.push(seg.replace(/^.*?ยอดรวม/, "").trim());
  }

  return { docNo, docDate, customerName, customerTaxId, lines, unmatched: [...new Set(unmatched)] };
}

/**
 * Generic parser for any text PDF that lists 13-digit barcodes (PO, delivery slips from other systems).
 * Returns each barcode with a best-guess quantity (the first number in the text chunk before the barcode)
 * — the user confirms/edits quantities in the form.
 */
export interface GenericLine { barcode: string; qty: number; context: string }
export function parseGenericBarcodes(rawText: string): { docNo: string | null; lines: GenericLine[] } {
  const textNl = cleanPdfText(rawText);
  const text = textNl.replace(/\n/g, " ");
  const docNo = text.match(/\b([A-Z]{1,4}\d{2}-\d{4,6})\b/)?.[1] ?? text.match(/\b(PO\.?\s?\d{6,})\b/i)?.[1] ?? text.match(/\b((?:INV|DN|DO|SO|PO)\d{6,})\b/)?.[1] ?? null;

  const re = /(?<!\d)(\d{13})(?!\d)/g;
  const lines: GenericLine[] = [];
  const seen = new Map<string, number>();
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(textNl))) {
    const barcode = m[1];
    // only the row the barcode belongs to: the last non-empty line of the chunk (or the one before, when the barcode sits alone on a line)
    const rawChunk = textNl.slice(last, m.index);
    last = re.lastIndex;
    const rows = rawChunk.split("\n").map((r) => r.trim()).filter(Boolean);
    let chunk = rows[rows.length - 1] ?? "";
    if (!/\d/.test(chunk) && rows.length > 1) chunk = rows[rows.length - 2] + " " + chunk;
    // skip tax ids and phone-like numbers: Thai product EANs start with 885
    if (!barcode.startsWith("885")) continue;
    // quantity guess: first standalone number (1–4 digits, optionally .00) that is not a percentage or price with cents
    const nums = [...chunk.matchAll(/(?<![\d.,])(\d{1,4})(?:\.00)?(?![\d%]|\.\d)/g)].map((x) => Number(x[1])).filter((n) => n > 0);
    const qty = nums[0] ?? 1;
    const context = chunk.replace(/[\d.,%]+/g, " ").replace(/\s+/g, " ").trim().slice(-60);
    if (seen.has(barcode)) {
      lines[seen.get(barcode)!].qty += qty;
    } else {
      seen.set(barcode, lines.length);
      lines.push({ barcode, qty, context });
    }
  }
  return { docNo, lines };
}
