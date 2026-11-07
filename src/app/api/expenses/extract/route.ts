import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AiBill } from "@/lib/expenses/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

const PROMPT = `คุณคือผู้ช่วยบัญชีของบริษัทในประเทศไทย อ่านรูปบิล/ใบกำกับภาษี/บิลเงินสด/ใบเสนอราคาจากซัพพลายเออร์ (อาจเป็นลายมือ) แล้วตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น

โครงสร้าง JSON:
{
 "doc_kind": "tax_invoice|cash_bill|receipt|quotation|invoice|other",
 "supplier_name": "ชื่อผู้ขาย/ร้าน/บริษัทที่ออกบิล (ไม่ใช่ลูกค้า)",
 "supplier_tax_id": "เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ขาย หรือ null",
 "supplier_address": "ที่อยู่ผู้ขาย หรือ null",
 "supplier_branch": "รหัสสาขาผู้ขาย เช่น 00000/00001 หรือ null",
 "supplier_is_company": true ถ้าเป็นนิติบุคคล (บริษัท/หจก./ห้าง) false ถ้าเป็นบุคคลธรรมดา/ร้านค้าบุคคล,
 "supplier_phone": "...",
 "bill_no": "เลขที่บิล (รวมเล่มที่/เลขที่ เช่น 4/15) หรือ null",
 "bill_date": "YYYY-MM-DD (แปลง พ.ศ. เป็น ค.ศ. โดยลบ 543; วันที่ไทยเขียน วัน/เดือน/ปี) หรือ null",
 "due_date": "YYYY-MM-DD หรือ null",
 "vat_mode": "exclusive ถ้ามีบรรทัด VAT/ภาษีมูลค่าเพิ่มบวกเพิ่มจากยอดรวม, inclusive ถ้าระบุว่าราคารวม VAT แล้ว, none ถ้าไม่มี VAT (บิลเงินสดทั่วไป)",
 "items": [{"description": "...", "qty": number, "unit": "...", "unit_price": number, "amount": number}],
 "subtotal": number รวมก่อนส่วนลด/VAT,
 "discount_amount": number (บาท; ถ้าเป็น % ให้คำนวณเป็นบาท) หรือ 0,
 "vat_amount": number หรือ 0,
 "grand_total": number ยอดรวมตามบิล (รวม VAT ถ้ามี),
 "wht_pct": อัตราหัก ณ ที่จ่ายถ้าบิลระบุ (เช่น เขียนว่า หัก 3% หรือมีบรรทัด Withholding Tax) ไม่เช่นนั้น 0,
 "wht_amount": number หรือ 0,
 "net_pay": ยอดจ่ายจริงหลังหัก ณ ที่จ่าย (ถ้าบิลเขียนไว้ เช่น "จ่าย 86,431.85") หรือ null,
 "handwritten": true/false,
 "confidence": 0-1 ความมั่นใจโดยรวม,
 "warnings": ["สิ่งที่อ่านไม่ชัด / ยอดไม่ตรง / ควรตรวจ"],
 "notes": "ข้อสังเกตสั้นๆ"
}

กติกา: ตัวเลขใช้ number ไม่ใส่เครื่องหมายจุลภาค; ถ้าบรรทัดใดไม่แน่ใจให้ใส่ warning; ลูกค้าในบิลมักเป็น "บริษัท ปากาม้า (ไทยแลนด์) จำกัด" — อย่าสับสนกับผู้ขาย; ตรวจว่า sum(items.amount) - discount + vat = grand_total ถ้าไม่ตรงให้ใส่ warning.`;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY ใน Vercel → กรอกข้อมูลเองได้" }, { status: 503 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { paths } = (await req.json()) as { paths: string[] };
  if (!paths?.length) return NextResponse.json({ error: "no files" }, { status: 400 });

  // download bill images from private bucket as the signed-in user
  const content: unknown[] = [];
  for (const p of paths.slice(0, 4)) {
    const { data, error } = await supabase.storage.from("expense-files").download(p);
    if (error || !data) return NextResponse.json({ error: `อ่านไฟล์ไม่ได้: ${error?.message ?? p}` }, { status: 400 });
    const buf = Buffer.from(await data.arrayBuffer());
    const mt = data.type || "image/jpeg";
    if (mt === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } });
    else content.push({ type: "image", source: { type: "base64", media_type: mt, data: buf.toString("base64") } });
  }
  content.push({ type: "text", text: PROMPT });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, temperature: 0, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) {
    const t = await res.text();
    return NextResponse.json({ error: `AI อ่านไม่สำเร็จ (${res.status}): ${t.slice(0, 200)}` }, { status: 502 });
  }
  const json = await res.json();
  const text: string = (json.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return NextResponse.json({ error: "AI ไม่ได้ตอบเป็น JSON", raw: text }, { status: 502 });
  let bill: AiBill;
  try { bill = JSON.parse(m[0]); } catch { return NextResponse.json({ error: "แปลงผล AI ไม่ได้", raw: text }, { status: 502 }); }
  // normalise Thai BE years that slipped through (e.g. 2569-11-05)
  for (const k of ["bill_date", "due_date"] as const) {
    const v = bill[k];
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) > 2400) bill[k] = `${Number(v.slice(0, 4)) - 543}${v.slice(4)}`;
  }
  return NextResponse.json({ bill, model: MODEL, usage: json.usage });
}
