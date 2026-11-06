"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession, requireAdmin } from "@/lib/session";
import { parseFlowAccountPdfText, type ParsedDoc } from "@/lib/stock/flowaccount-pdf";

const nul = (v: FormDataEntryValue | null) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };
const num = (v: FormDataEntryValue | null) => { const s = nul(v); return s === null ? null : Number(s); };

// ---------------- products ----------------
export async function saveProduct(id: string | null, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const row = {
    code: String(formData.get("code")).trim().toUpperCase(),
    barcode: nul(formData.get("barcode")),
    name: String(formData.get("name")).trim(),
    dept: nul(formData.get("dept")),
    sub_dept: nul(formData.get("sub_dept")),
    unit: nul(formData.get("unit")) ?? "ชิ้น",
    price: num(formData.get("price")) ?? 0,
    cost: num(formData.get("cost")),
    min_alert: num(formData.get("min_alert")) ?? 0,
    notes: nul(formData.get("notes")),
    is_active: formData.get("is_active") !== "off",
  };
  if (id) {
    const { error } = await supabase.from("products").update(row).eq("id", id);
    if (error) redirect(`/stock/products/${id}?error=${encodeURIComponent(error.message)}`);
    revalidatePath("/stock/products");
    redirect(`/stock/products/${id}?saved=1`);
  } else {
    const opening = num(formData.get("opening_qty")) ?? 0;
    const { data, error } = await supabase.from("products").insert(row).select("id").single();
    if (error) redirect(`/stock/products/new?error=${encodeURIComponent(error.message.includes("duplicate") ? "รหัสหรือบาร์โค้ดนี้มีอยู่แล้ว" : error.message)}`);
    if (opening > 0) await supabase.rpc("apply_movement", { p_product_id: data.id, p_type: "opening", p_qty: opening, p_note: "ยอดเริ่มต้นตอนเพิ่มสินค้า" });
    revalidatePath("/stock/products");
    redirect(`/stock/products/${data.id}?saved=1`);
  }
}

export async function deleteProduct(id: string) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) redirect(`/stock/products/${id}?error=${encodeURIComponent("ลบไม่ได้ — สินค้านี้มีประวัติรับเข้า/เบิกแล้ว ให้ปิดการใช้งานแทน")}`);
  revalidatePath("/stock/products");
  redirect("/stock/products?deleted=1");
}

export async function adjustStock(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_stock", { p_product_id: id, p_new_qty: Number(formData.get("new_qty")), p_reason: nul(formData.get("reason")) });
  if (error) redirect(`/stock/products/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/stock/products");
  redirect(`/stock/products/${id}?saved=1`);
}

export async function uploadImage(table: "products" | "materials", id: string, formData: FormData) {
  await getSession();
  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) return;
  if (file.size > 5 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 5 MB");
  const supabase = await createClient();
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${table}/${id}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("stock-images").upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("stock-images").getPublicUrl(path);
  await supabase.from(table).update({ image_url: data.publicUrl }).eq("id", id);
  revalidatePath(`/stock/${table}/${id}`);
  revalidatePath(`/stock/${table}`);
}

// ---------------- receipts ----------------
export async function createReceipt(formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const items = JSON.parse(String(formData.get("items") ?? "[]")) as { product_id: string; qty: number; condition: string; defect_action?: string; unit_cost?: string; note?: string }[];
  const { data, error } = await supabase.rpc("create_receipt", {
    p_supplier_id: nul(formData.get("contact_id")),
    p_supplier_doc_no: nul(formData.get("supplier_doc_no")),
    p_receipt_date: nul(formData.get("receipt_date")),
    p_payment_status: formData.get("payment_status") === "paid" ? "paid" : "unpaid",
    p_note: nul(formData.get("note")),
    p_items: items.map((i) => ({ ...i, unit_cost: i.unit_cost || null, note: i.note || null })),
  });
  if (error) redirect(`/stock/receipts/new?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/stock");
  redirect(`/stock/receipts/${data.id}?saved=1`);
}

export async function setReceiptPaid(id: string, paid: boolean) {
  await getSession();
  const supabase = await createClient();
  await supabase.from("receipts").update({ payment_status: paid ? "paid" : "unpaid", paid_at: paid ? new Date().toISOString().slice(0, 10) : null }).eq("id", id);
  revalidatePath(`/stock/receipts/${id}`);
  revalidatePath("/stock/receipts");
}

// ---------------- issues ----------------
export async function createIssue(formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const items = JSON.parse(String(formData.get("items") ?? "[]")) as { product_id: string; qty: number; note?: string }[];
  const { data, error } = await supabase.rpc("create_issue", {
    p_customer_id: nul(formData.get("contact_id")),
    p_issue_date: nul(formData.get("issue_date")),
    p_source: nul(formData.get("source")) ?? "manual",
    p_source_doc_no: nul(formData.get("source_doc_no")),
    p_purpose: nul(formData.get("purpose")),
    p_items: items.map((i) => ({ ...i, note: i.note || null })),
  });
  if (error) redirect(`/stock/issues/new?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/stock");
  redirect(`/stock/issues/${data.id}?saved=1`);
}

/** Parse an uploaded FlowAccount PDF and match lines to products by barcode. */
export type PdfResult = {
  doc: ParsedDoc;
  matched: { barcode: string; qty: number; name: string; product: { id: string; code: string; name: string; stock_qty: number } | null }[];
  customer: { id: string; name: string } | null;
};
export async function parseFlowAccountPdf(formData: FormData): Promise<PdfResult | { error: string }> {
  try {
    return await parseFlowAccountPdfInner(formData);
  } catch (e) {
    return { error: (e as Error).message };
  }
}
async function parseFlowAccountPdfInner(formData: FormData): Promise<PdfResult> {
  await getSession();
  const file = formData.get("pdf") as File | null;
  if (!file || file.size === 0) throw new Error("ไม่พบไฟล์");
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const buf = Buffer.from(await file.arrayBuffer());
  let text = "";
  try {
    ({ text } = await pdfParse(buf));
  } catch (e) {
    throw new Error("อ่านไฟล์ PDF ไม่ได้: " + (e as Error).message);
  }
  const doc = parseFlowAccountPdfText(text);
  if (!doc.lines.length && !doc.docNo) throw new Error("ไม่พบรายการสินค้าในไฟล์ — ต้องเป็น PDF ที่ออกจาก FlowAccount (ไม่ใช่ภาพสแกน)");

  const supabase = await createClient();
  const barcodes = doc.lines.map((l) => l.barcode).filter(Boolean) as string[];
  const { data: prods } = barcodes.length ? await supabase.from("products").select("id, code, name, barcode, stock_qty").in("barcode", barcodes) : { data: [] };
  const byBarcode = new Map((prods ?? []).map((p) => [p.barcode as string, p]));
  const matched = doc.lines.map((l) => ({ barcode: l.barcode ?? "", qty: l.qty, name: l.name, product: l.barcode ? (byBarcode.get(l.barcode) ?? null) : null }));

  let customer: { id: string; name: string } | null = null;
  if (doc.customerTaxId) {
    const { data } = await supabase.from("contacts").select("id, name").eq("kind", "customer").eq("tax_id", doc.customerTaxId).limit(1).maybeSingle();
    customer = data;
  }
  if (!customer && doc.customerName) {
    const { data } = await supabase.from("contacts").select("id, name").eq("kind", "customer").ilike("name", `%${doc.customerName.slice(0, 25)}%`).limit(1).maybeSingle();
    customer = data;
  }
  return { doc, matched, customer };
}

// ---------------- defects ----------------
export async function updateDefect(id: string, status: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_defect", { p_defect_id: id, p_status: status, p_note: nul(formData.get("note")) });
  if (error) redirect(`/stock/defects?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/stock/defects");
  revalidatePath("/stock/products");
}

// ---------------- materials ----------------
export async function saveMaterial(id: string | null, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const kind = String(formData.get("kind"));
  const row = {
    kind,
    code: nul(formData.get("code")),
    name: String(formData.get("name")).trim(),
    unit: nul(formData.get("unit")) ?? (kind === "fabric" ? "ผืน" : "ชิ้น"),
    min_alert: num(formData.get("min_alert")) ?? 0,
    note: nul(formData.get("note")),
  };
  if (id) {
    await supabase.from("materials").update(row).eq("id", id);
    revalidatePath(`/stock/materials/${id}`);
    redirect(`/stock/materials/${id}?saved=1`);
  } else {
    const opening = num(formData.get("opening_qty")) ?? 0;
    const { data, error } = await supabase.from("materials").insert(row).select("id").single();
    if (error) redirect(`/stock/materials?error=${encodeURIComponent(error.message)}`);
    if (opening > 0) await supabase.rpc("move_material", { p_material_id: data.id, p_type: "opening", p_qty: opening, p_note: "ยอดเริ่มต้น" });
    revalidatePath("/stock/materials");
    redirect(`/stock/materials/${data.id}?saved=1`);
  }
}

export async function moveMaterial(id: string, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const type = String(formData.get("type"));
  const q = Number(formData.get("qty"));
  const { error } = await supabase.rpc("move_material", {
    p_material_id: id, p_type: type, p_qty: type === "issue" ? -Math.abs(q) : Math.abs(q), p_note: nul(formData.get("note")), p_supplier_id: nul(formData.get("contact_id")),
  });
  if (error) redirect(`/stock/materials/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/stock/materials/${id}`);
  revalidatePath("/stock/materials");
  redirect(`/stock/materials/${id}?saved=1`);
}

export async function deleteMaterial(id: string) {
  await getSession();
  const supabase = await createClient();
  await supabase.from("materials").delete().eq("id", id);
  revalidatePath("/stock/materials");
  redirect("/stock/materials?deleted=1");
}

// ---------------- contacts ----------------
export async function saveContact(id: string | null, formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const row = {
    kind: formData.get("kind"), code: nul(formData.get("code")), name: String(formData.get("name")).trim(),
    entity_type: nul(formData.get("entity_type")) ?? "company", tax_id: nul(formData.get("tax_id")), branch_code: nul(formData.get("branch_code")),
    address: nul(formData.get("address")), postcode: nul(formData.get("postcode")), contact_name: nul(formData.get("contact_name")),
    email: nul(formData.get("email")), mobile: nul(formData.get("mobile")), office_phone: nul(formData.get("office_phone")),
    credit_days: num(formData.get("credit_days")) ?? 0, note: nul(formData.get("note")),
  };
  if (id) await supabase.from("contacts").update(row).eq("id", id);
  else await supabase.from("contacts").insert(row);
  revalidatePath("/stock/contacts");
  redirect(`/stock/contacts?kind=${row.kind}&saved=1`);
}

export async function deleteContact(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) redirect(`/stock/contacts?error=${encodeURIComponent("ลบไม่ได้ — รายชื่อนี้ถูกใช้ในเอกสารแล้ว")}`);
  revalidatePath("/stock/contacts");
}

export async function createDefect(formData: FormData) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_defect", {
    p_product_id: nul(formData.get("product_id")),
    p_qty: Number(formData.get("qty")),
    p_status: nul(formData.get("status")) ?? "review",
    p_supplier_id: nul(formData.get("contact_id")),
    p_note: nul(formData.get("note")),
    p_from_stock: formData.get("from_stock") !== "no",
  });
  if (error) redirect(`/stock/defects?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/stock/defects");
  revalidatePath("/stock/products");
  redirect("/stock/defects?saved=1");
}

export async function deleteDefect(id: string) {
  await getSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_defect", { p_defect_id: id });
  if (error) redirect(`/stock/defects?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/stock/defects");
  revalidatePath("/stock/products");
}

/** Any text PDF with 13-digit barcodes (PO / delivery slip from other systems). Quantities are best-guess — user confirms. */
export async function parseGenericPdf(formData: FormData): Promise<{ docNo: string | null; matched: { barcode: string; qty: number; context: string; product: { id: string; code: string; name: string; stock_qty: number } | null }[] } | { error: string }> {
  try {
    await getSession();
    const file = formData.get("pdf") as File | null;
    if (!file || file.size === 0) throw new Error("ไม่พบไฟล์");
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    let text = "";
    try { ({ text } = await pdfParse(Buffer.from(await file.arrayBuffer()))); } catch (e) { throw new Error("อ่านไฟล์ PDF ไม่ได้: " + (e as Error).message); }
    const { parseGenericBarcodes } = await import("@/lib/stock/flowaccount-pdf");
    const { docNo, lines } = parseGenericBarcodes(text);
    if (!lines.length) throw new Error("ไม่พบบาร์โค้ด 13 หลักในไฟล์ — ถ้าเป็นภาพสแกนระบบอ่านไม่ได้");
    const supabase = await createClient();
    const { data: prods } = await supabase.from("products").select("id, code, name, barcode, stock_qty").in("barcode", lines.map((l) => l.barcode));
    const by = new Map((prods ?? []).map((p) => [p.barcode as string, p]));
    return { docNo, matched: lines.map((l) => ({ ...l, product: by.get(l.barcode) ?? null })) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
