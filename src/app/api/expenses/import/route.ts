import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

/**
 * Import expenses from outside the web UI (Claude reading bank slips / bills from Google Drive or chat).
 *   POST /api/expenses/import
 *   Authorization: Bearer <ERP_IMPORT_TOKEN>
 *   { items: ImportItem[] }
 * Each item becomes an expense. kind="slip" → already paid (status paid, approved by the admin named in `actor_email`).
 * Dedupe: an item whose external_id already exists as paid_ref or bill_no is skipped.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

interface ImportItem {
  external_id: string;               // bank TXN ref / drive file id — used for dedupe
  kind: "slip" | "bill";
  company_code?: string;             // PKM (default) | TKS
  supplier_name: string;
  supplier_tax_id?: string | null;
  supplier_address?: string | null;
  supplier_is_company?: boolean;
  category_code?: string | null;     // expense_categories.code
  bill_no?: string | null;
  date: string;                      // yyyy-mm-dd (bill date / transfer date)
  memo?: string | null;              // description
  amount?: number;                   // total when no line items
  items?: { description: string; qty?: number; unit?: string | null; unit_price: number }[];
  vat_mode?: "none" | "inclusive" | "exclusive";
  wht_pct?: number;
  paid_method?: string;              // โอน
  paid_ref?: string | null;
  status?: "paid" | "pending";       // default: slip→paid, bill→pending
  source?: string;                   // e.g. "gdrive:สลิปโอนเงิน", "chat"
  source_url?: string | null;
  image_base64?: string | null;      // optional jpeg/pdf to attach
  image_mime?: string | null;
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน Vercel");
  return createAdmin(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  const token = process.env.ERP_IMPORT_TOKEN;
  if (!token) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า ERP_IMPORT_TOKEN ใน Vercel" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { items: ImportItem[]; actor_email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const items = body.items ?? [];
  if (!items.length) return NextResponse.json({ error: "no items" }, { status: 400 });

  let sb;
  try { sb = admin(); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 503 }); }

  const actorEmail = body.actor_email ?? "pahkahmah@gmail.com";
  const [{ data: actor }, { data: companies }, { data: cats }] = await Promise.all([
    sb.from("app_users").select("id").eq("email", actorEmail).maybeSingle(),
    sb.from("companies").select("id, code"),
    sb.from("expense_categories").select("id, code, wht_pct"),
  ]);
  if (!actor) return NextResponse.json({ error: `ไม่พบผู้ใช้ ${actorEmail}` }, { status: 400 });

  const results: { external_id: string; status: "created" | "skipped" | "error"; exp_no?: string; id?: string; message?: string }[] = [];
  for (const it of items) {
    try {
      // dedupe
      const { data: dup } = await sb.from("expenses").select("id, exp_no").or(`paid_ref.eq.${it.external_id},bill_no.eq.${it.external_id}`).limit(1).maybeSingle();
      if (dup) { results.push({ external_id: it.external_id, status: "skipped", exp_no: dup.exp_no, id: dup.id, message: "มีอยู่แล้ว" }); continue; }

      const company = (companies ?? []).find((c) => c.code === (it.company_code ?? "PKM")) ?? (companies ?? [])[0];
      const cat = it.category_code ? (cats ?? []).find((c) => c.code === it.category_code) : null;
      const status = it.status ?? (it.kind === "slip" ? "paid" : "pending");
      const { data: expNo, error: eNo } = await sb.rpc("next_expense_no", { p_company: company.id, p_date: it.date });
      if (eNo) throw eNo;

      // supplier link by tax id or exact name
      let supplierId: string | null = null;
      if (it.supplier_tax_id) { const { data } = await sb.from("contacts").select("id").eq("kind", "supplier").eq("tax_id", it.supplier_tax_id).limit(1).maybeSingle(); supplierId = data?.id ?? null; }
      if (!supplierId) { const { data } = await sb.from("contacts").select("id").eq("kind", "supplier").ilike("name", it.supplier_name).limit(1).maybeSingle(); supplierId = data?.id ?? null; }

      const { data: exp, error: eIns } = await sb.from("expenses").insert({
        company_id: company.id, exp_no: expNo, supplier_id: supplierId, supplier_name: it.supplier_name, supplier_tax_id: it.supplier_tax_id ?? null,
        supplier_address: it.supplier_address ?? null, supplier_is_company: it.supplier_is_company ?? /บริษัท|บจก|หจก|จำกัด|co\.|ltd/i.test(it.supplier_name),
        category_id: cat?.id ?? null, bill_no: it.bill_no ?? null, bill_date: it.date, description: it.memo ?? null,
        vat_mode: it.vat_mode ?? "none", wht_pct: it.wht_pct ?? 0, status,
        pay_round: status === "paid" ? it.date : null, paid_date: status === "paid" ? it.date : null, paid_method: status === "paid" ? (it.paid_method ?? "โอน") : null,
        paid_ref: it.paid_ref ?? it.external_id, approved_by: status === "paid" ? actor.id : null, approved_at: status === "paid" ? new Date().toISOString() : null,
        note: `นำเข้าโดย Claude จาก ${it.source ?? "import"}${it.source_url ? ` · ${it.source_url}` : ""}`, created_by: actor.id,
      }).select("id, exp_no").single();
      if (eIns) throw eIns;

      const lines = it.items?.length ? it.items : [{ description: it.memo || it.supplier_name, qty: 1, unit: null, unit_price: it.amount ?? 0 }];
      const { error: eItems } = await sb.from("expense_items").insert(lines.map((l, i) => ({ expense_id: exp.id, line_no: i + 1, description: l.description, qty: l.qty ?? 1, unit: l.unit ?? null, unit_price: l.unit_price })));
      if (eItems) throw eItems;

      if (it.image_base64) {
        const mime = it.image_mime ?? "image/jpeg";
        const ext = mime === "application/pdf" ? "pdf" : "jpg";
        const path = `${it.date.slice(0, 4)}/${it.date.slice(5, 7)}/import-${it.external_id.replace(/[^A-Za-z0-9_-]/g, "")}.${ext}`;
        const { error: eUp } = await sb.storage.from("expense-files").upload(path, Buffer.from(it.image_base64, "base64"), { contentType: mime, upsert: true });
        if (!eUp) await sb.from("expense_files").insert({ expense_id: exp.id, path, kind: it.kind === "slip" ? "slip" : "bill" });
      }
      const { error: eCalc } = await sb.rpc("recalc_expense", { p_id: exp.id });
      if (eCalc) throw eCalc;
      results.push({ external_id: it.external_id, status: "created", exp_no: exp.exp_no, id: exp.id });
    } catch (e) {
      results.push({ external_id: it.external_id, status: "error", message: (e as { message?: string }).message ?? String(e) });
    }
  }
  return NextResponse.json({ results, created: results.filter((r) => r.status === "created").length, skipped: results.filter((r) => r.status === "skipped").length, errors: results.filter((r) => r.status === "error").length });
}

/** GET → list of external ids already imported (for Claude to skip before uploading). */
export async function GET(req: Request) {
  const token = process.env.ERP_IMPORT_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = admin();
  const { data } = await sb.from("expenses").select("paid_ref, bill_no, exp_no, status, net_pay, supplier_name, bill_date").not("paid_ref", "is", null).order("bill_date", { ascending: false }).limit(500);
  return NextResponse.json({ refs: (data ?? []).map((d) => d.paid_ref), rows: data ?? [] });
}
