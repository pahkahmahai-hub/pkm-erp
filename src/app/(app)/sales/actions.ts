"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireAdmin } from "@/lib/session";
import { cleanPdfText } from "@/lib/stock/flowaccount-pdf";
import { extractPdfRows, type PdfParsed } from "@/lib/sales/store-report";

const nul = (v: FormDataEntryValue | null) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };
const num = (v: FormDataEntryValue | null) => { const s = nul(v); return s === null ? 0 : Number(s); };

export async function createSalesDoc(formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const type = String(formData.get("doc_type"));
  const items = JSON.parse(String(formData.get("items") ?? "[]"));
  const { data, error } = await supabase.rpc("create_sales_doc", {
    p_company: formData.get("company_id"),
    p_type: type,
    p_customer: nul(formData.get("contact_id")),
    p_customer_name: String(formData.get("customer_name")).trim(),
    p_customer_address: nul(formData.get("customer_address")),
    p_customer_tax_id: nul(formData.get("customer_tax_id")),
    p_customer_branch: nul(formData.get("customer_branch")),
    p_doc_date: nul(formData.get("doc_date")),
    p_due_date: nul(formData.get("due_date")),
    p_valid_until: nul(formData.get("valid_until")),
    p_channel: nul(formData.get("channel")) ?? "corporate",
    p_ref_doc: nul(formData.get("ref_doc_id")),
    p_ref_doc_no: nul(formData.get("ref_doc_no")),
    p_po_no: nul(formData.get("po_no")),
    p_vat_mode: nul(formData.get("vat_mode")) ?? "inclusive",
    p_discount_pct: num(formData.get("discount_pct")),
    p_discount_amount: num(formData.get("discount_amount")),
    p_deposit_amount: num(formData.get("deposit_amount")),
    p_deposit_ref: nul(formData.get("deposit_ref")),
    p_wht_pct: num(formData.get("wht_pct")),
    p_notes: nul(formData.get("notes")),
    p_internal_note: nul(formData.get("internal_note")),
    p_seller_name: nul(formData.get("seller_name")),
    p_deduct_stock: formData.get("deduct_stock") === "on",
    p_items: items,
    p_doc_no: nul(formData.get("doc_no")),
    p_source: nul(formData.get("source")) ?? "system",
  });
  if (error) redirect(`/sales/docs/new?type=${type}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales");
  redirect(`/sales/docs/${data.id}?created=1`);
}

export async function updateSalesDoc(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const items = JSON.parse(String(formData.get("items") ?? "[]"));
  const { error } = await supabase.from("sales_docs").update({
    customer_id: nul(formData.get("contact_id")),
    customer_name: String(formData.get("customer_name")).trim(),
    customer_address: nul(formData.get("customer_address")),
    customer_tax_id: nul(formData.get("customer_tax_id")),
    customer_branch: nul(formData.get("customer_branch")),
    doc_date: nul(formData.get("doc_date")),
    due_date: nul(formData.get("due_date")),
    valid_until: nul(formData.get("valid_until")),
    channel: nul(formData.get("channel")) ?? "corporate",
    ref_doc_no: nul(formData.get("ref_doc_no")),
    po_no: nul(formData.get("po_no")),
    vat_mode: nul(formData.get("vat_mode")) ?? "inclusive",
    discount_pct: num(formData.get("discount_pct")),
    discount_amount: num(formData.get("discount_amount")),
    deposit_amount: num(formData.get("deposit_amount")),
    deposit_ref: nul(formData.get("deposit_ref")),
    wht_pct: num(formData.get("wht_pct")),
    notes: nul(formData.get("notes")),
    internal_note: nul(formData.get("internal_note")),
    seller_name: nul(formData.get("seller_name")),
    deduct_stock: formData.get("deduct_stock") === "on",
  }).eq("id", id).eq("status", "draft");
  if (error) redirect(`/sales/docs/${id}/edit?error=${encodeURIComponent(error.message)}`);
  const { error: e2 } = await supabase.rpc("replace_sales_items", { p_doc: id, p_items: items });
  if (e2) redirect(`/sales/docs/${id}/edit?error=${encodeURIComponent(e2.message)}`);
  revalidatePath(`/sales/docs/${id}`);
  redirect(`/sales/docs/${id}?saved=1`);
}

export async function issueSalesDoc(id: string) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_sales_doc", { p_doc: id });
  if (error) redirect(`/sales/docs/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales");
  redirect(`/sales/docs/${id}?issued=1`);
}

export async function convertSalesDoc(id: string, toType: string, formData?: FormData) {
  await getSession();
  const supabase = await createClient();
  const deduct = formData?.get("deduct_stock") === "on";
  const { data, error } = await supabase.rpc("convert_sales_doc", { p_from: id, p_to_type: toType, p_deduct_stock: deduct });
  if (error) redirect(`/sales/docs/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales");
  redirect(`/sales/docs/${data.id}/edit?from=${id}`);
}

export async function settleReceipt(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_receipt", { p_receipt: id, p_method: nul(formData.get("payment_method")) ?? "โอน", p_date: nul(formData.get("payment_date")), p_ref: nul(formData.get("payment_ref")) });
  if (error) redirect(`/sales/docs/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales");
  redirect(`/sales/docs/${id}?paid=1`);
}

export async function cancelSalesDoc(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_sales_doc", { p_doc: id, p_reason: nul(formData.get("reason")) });
  if (error) redirect(`/sales/docs/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales");
  redirect(`/sales/docs/${id}`);
}

export async function deleteDraft(id: string, type: string) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("sales_docs").delete().eq("id", id).eq("status", "draft");
  if (error) redirect(`/sales/docs/${id}?error=${encodeURIComponent("ลบได้เฉพาะฉบับร่าง")}`);
  revalidatePath("/sales");
  redirect(`/sales/docs?type=${type}&deleted=1`);
}

// ---------- online daily ----------
export async function saveOnlineDay(formData: FormData) {
  const s = await getSession();
  const supabase = await createClient();
  const date = String(formData.get("sale_date"));
  const channels = formData.getAll("channel") as string[];
  const rows = channels.map((ch) => ({
    sale_date: date, channel: ch,
    orders_count: Math.round(num(formData.get(`orders_${ch}`))),
    gross_amount: num(formData.get(`gross_${ch}`)),
    fees: num(formData.get(`fees_${ch}`)),
    recorded_tks: formData.get(`tks_${ch}`) === "on",
    note: nul(formData.get(`note_${ch}`)),
    created_by: s.appUser.id,
  })).filter((r) => r.orders_count > 0 || r.gross_amount > 0 || r.fees > 0 || r.note);
  if (rows.length) {
    const { error } = await supabase.from("online_sales_daily").upsert(rows, { onConflict: "sale_date,channel" });
    if (error) redirect(`/sales/online?date=${date}&error=${encodeURIComponent(error.message)}`);
  }
  // remove rows zeroed out
  const zeroed = channels.filter((ch) => !rows.some((r) => r.channel === ch));
  if (zeroed.length) await supabase.from("online_sales_daily").delete().eq("sale_date", date).in("channel", zeroed);
  revalidatePath("/sales/online");
  redirect(`/sales/online?date=${date}&saved=1`);
}

export async function toggleChannelTks(key: string, value: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("online_channels").update({ bills_to_tks: value }).eq("key", key);
  revalidatePath("/sales/online");
}

// ---------- companies ----------
export async function saveCompany(id: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const fields = ["name_th", "name_en", "branch", "address_th", "address_en", "tax_id", "phone", "mobile", "email", "website", "bank_name", "bank_branch", "bank_account_name", "bank_account_no", "signer_name"];
  const row: Record<string, unknown> = Object.fromEntries(fields.map((f) => [f, nul(formData.get(f))]));
  row.vat_registered = formData.get("vat_registered") === "on";
  row.doc_lang = nul(formData.get("doc_lang")) ?? "th";
  const { error } = await supabase.from("companies").update(row).eq("id", id);
  if (error) redirect(`/sales/companies?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales/companies");
  redirect("/sales/companies?saved=1");
}

// ---------- store sales report → draft documents ----------
export interface StoreDocInput {
  key: string; company_id: string; doc_type: "invoice" | "receipt"; contact_id: string | null;
  customer_name: string; customer_address: string | null; customer_tax_id: string | null; customer_branch: string | null;
  doc_date: string; po_no: string | null; gp_pct: number; vendor_amount: number | null;
  period_from: string; period_to: string; store_code: string | null; store_name: string; format: string; file_name: string;
  lines: { barcode: string | null; code: string | null; description: string; qty: number; net: number; gross: number }[];
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const thMonth = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { month: "long", year: "numeric" });

export async function createStoreReportDocs(inputs: StoreDocInput[]) {
  const s = await getSession();
  const supabase = await createClient();
  const { data: canSell } = await supabase.rpc("can_sell");
  if (!canSell) return { ok: [], errors: inputs.map((i) => ({ key: i.key, message: "ไม่มีสิทธิ์สร้างเอกสารขาย" })) };
  const barcodes = [...new Set(inputs.flatMap((i) => i.lines.map((l) => l.barcode)).filter(Boolean))] as string[];
  const { data: prods } = barcodes.length ? await supabase.from("products").select("id, barcode, unit").in("barcode", barcodes) : { data: [] };
  const byBarcode = new Map((prods ?? []).map((p) => [p.barcode as string, p]));
  const ok: { key: string; doc_no: string; id: string; grand: number }[] = [];
  const errors: { key: string; message: string }[] = [];
  for (const inp of inputs) {
    const items = inp.lines.map((l) => {
      const p = l.barcode ? byBarcode.get(l.barcode) : undefined;
      const unit_price = l.qty ? r2(l.gross / l.qty) : 0;
      const discount_pct = l.gross > 0 && l.net < l.gross ? r2((1 - l.net / l.gross) * 100) : 0;
      return { product_id: p?.id ?? null, description: l.description, barcode: l.barcode, qty: l.qty, unit: p?.unit ?? "ชิ้น", unit_price, discount_pct, note: p ? null : "ไม่พบสินค้าในระบบ (ตามบาร์โค้ดห้าง)" };
    });
    // same rounding as recalc_sales_doc
    const subtotal = items.reduce((a, it) => a + r2(it.qty * it.unit_price * (1 - it.discount_pct / 100)), 0);
    const exact = inp.vendor_amount != null;                       // Central: lock to the store's own payable figure
    const discount_amount = exact ? r2(subtotal - (inp.vendor_amount as number)) : 0;
    const discount_pct = exact ? 0 : inp.gp_pct;
    const unmatched = items.filter((i) => !i.product_id).length;
    const notes = `ยอดขาย ${inp.store_name}${inp.store_code ? ` สาขา ${inp.store_code}` : ""} ประจำเดือน ${thMonth(inp.period_to)} (${inp.period_from} – ${inp.period_to}) หัก GP ${inp.gp_pct}%`;
    const internal = `นำเข้าจากรายงานห้าง ${inp.file_name} (${inp.format}) โดย ${s.employee?.nickname ?? s.authUser.name ?? s.authUser.email}${unmatched ? ` · ${unmatched} รายการไม่พบบาร์โค้ดในระบบ` : ""}`;
    const { data, error } = await supabase.rpc("create_sales_doc", {
      p_company: inp.company_id, p_type: inp.doc_type, p_customer: inp.contact_id, p_customer_name: inp.customer_name, p_customer_address: inp.customer_address,
      p_customer_tax_id: inp.customer_tax_id, p_customer_branch: inp.customer_branch, p_doc_date: inp.doc_date, p_due_date: null, p_valid_until: null,
      p_channel: "store", p_ref_doc: null, p_ref_doc_no: inp.store_code ? `รายงานห้าง ${inp.store_code}` : null, p_po_no: inp.po_no,
      p_vat_mode: "inclusive", p_discount_pct: discount_pct, p_discount_amount: discount_amount, p_deposit_amount: 0, p_deposit_ref: null, p_wht_pct: 0,
      p_notes: notes, p_internal_note: internal, p_seller_name: null, p_deduct_stock: inp.doc_type === "invoice", p_items: items, p_doc_no: null, p_source: "store_report",
    });
    if (error) errors.push({ key: inp.key, message: error.message });
    else ok.push({ key: inp.key, doc_no: data.doc_no, id: data.id, grand: Number(data.grand_total) });
  }
  revalidatePath("/sales");
  return { ok, errors };
}

// ---------- online sales per product ----------
export async function saveOnlineChannelDay(formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const date = String(formData.get("sale_date")); const channel = String(formData.get("channel"));
  const { error } = await supabase.rpc("save_online_items", {
    p_date: date, p_channel: channel, p_items: JSON.parse(String(formData.get("items") ?? "[]")),
    p_orders: nul(formData.get("orders")) ? Math.round(num(formData.get("orders"))) : null, p_fees: nul(formData.get("fees")) ? num(formData.get("fees")) : null, p_note: nul(formData.get("note")),
    p_recorded_tks: formData.get("recorded_tks") === "on", p_payout: nul(formData.get("payout")) ? num(formData.get("payout")) : null,
  });
  if (error) redirect(`/sales/online?date=${date}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales/online");
  redirect(`/sales/online?date=${date}&saved=${channel}`);
}

// ---------- month close: TKS purchase requisition → PKM invoice ----------
export async function createPurchaseRequisition(formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const month = String(formData.get("month")); // yyyy-mm
  const { data, error } = await supabase.rpc("create_purchase_requisition", { p_month: `${month}-01`, p_doc_date: nul(formData.get("doc_date")), p_lines: null });
  if (error) redirect(`/sales/month-close?month=${month}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales");
  redirect(`/sales/docs/${data.id}?created=1`);
}

export async function issueIntercompanyInvoice(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_intercompany_invoice", { p_pr: id, p_doc_date: nul(formData.get("doc_date")) });
  if (error) redirect(`/sales/docs/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales");
  redirect(`/sales/docs/${data.id}?created=1`);
}

export async function deleteOnlineChannelDay(date: string, channel: string, back: string) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_online_items", { p_date: date, p_channel: channel, p_items: [], p_orders: 0, p_fees: 0, p_note: null, p_recorded_tks: null, p_payout: 0 });
  if (error) redirect(`${back}&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales/online");
  redirect(`${back}&deleted=${date}`);
}

// ---------- store report PDF → raw rows (client picks columns) ----------
export async function parseStoreReportPdf(formData: FormData): Promise<{ parsed?: PdfParsed; error?: string }> {
  try {
    await getSession();
    const file = formData.get("pdf") as File | null;
    if (!file || file.size === 0) throw new Error("ไม่พบไฟล์");
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const { text } = await pdfParse(Buffer.from(await file.arrayBuffer()));
    const parsed = extractPdfRows(cleanPdfText(text));
    if (!parsed.rows.length) throw new Error("ไม่พบบรรทัดที่มีบาร์โค้ด 13 หลักใน PDF — ถ้าเป็นภาพสแกนต้องขอไฟล์ Excel/PDF ตัวจริงจากห้าง");
    return { parsed };
  } catch (e) { return { error: (e as Error).message }; }
}

// ---------- online channels (platforms) — admins only ----------
export async function saveChannel(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const existing = nul(formData.get("key"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/sales/online?error=" + encodeURIComponent("กรุณาใส่ชื่อแพลตฟอร์ม"));
  const key = existing ?? (nul(formData.get("new_key")) ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || `ch-${Date.now()}`;
  const row = { key, name, color: nul(formData.get("color")) ?? "#452a79", bills_to_tks: formData.get("bills_to_tks") === "on", sort_order: Math.round(num(formData.get("sort_order"))) || 100, is_active: formData.get("is_active") !== "off" };
  const { error } = existing ? await supabase.from("online_channels").update(row).eq("key", existing) : await supabase.from("online_channels").insert(row);
  if (error) redirect(`/sales/online?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales/online");
  redirect("/sales/online?saved=1");
}

export async function deleteChannel(key: string) {
  await requireAdmin();
  const supabase = await createClient();
  const [{ count: c1 }, { count: c2 }] = await Promise.all([
    supabase.from("online_sales_daily").select("*", { count: "exact", head: true }).eq("channel", key),
    supabase.from("online_sales_items").select("*", { count: "exact", head: true }).eq("channel", key),
  ]);
  if ((c1 ?? 0) + (c2 ?? 0) > 0) {
    await supabase.from("online_channels").update({ is_active: false }).eq("key", key);
    revalidatePath("/sales/online");
    redirect("/sales/online?saved=1&note=" + encodeURIComponent("แพลตฟอร์มนี้มียอดขายบันทึกอยู่ จึงปิดใช้งานแทนการลบ (ข้อมูลเก่ายังอยู่ครบ)"));
  }
  const { error } = await supabase.from("online_channels").delete().eq("key", key);
  if (error) redirect(`/sales/online?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/sales/online");
  redirect("/sales/online?saved=1");
}
