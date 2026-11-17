import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { PrintButton } from "@/components/sales/PrintButton";
import { DESIGN_TYPE_TH, logoMethodTH, imageKindTH, specImages, type CorpItem, type CorpStep, type CorpImage } from "@/lib/work/corpSpec";
import type { CorpOrder } from "@/lib/work/corp";

export const dynamic = "force-dynamic";
type V = "customer" | "supplier" | "internal";
const TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const dmy = (d: string | null | undefined) => (d ? `${Number(d.slice(8, 10))} ${TH_M[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(0, 4)) + 543}` : "—");
const C = { ink: "#1d1530", soft: "#6b6380", purple: "#452a79", line: "#d9cfee", pink: "#e8317c" };

/** ใบงานสั่งสินค้า (Order Specification Sheet) — 3 ฉบับจากข้อมูลชุดเดียว
 *  customer: ข้อมูลลูกค้า + สเปก + รูปที่คอนเฟิร์ม + ช่องอนุมัติ/ลงนาม (ไม่มีผู้ผลิต)
 *  supplier: สเปก + รูป + กำหนดรับของ (ไม่มีราคา/ข้อมูลติดต่อลูกค้า)
 *  internal: ครบทุกอย่าง + ขั้นตอน/ผู้รับผิดชอบ */
export default async function CorpSpecPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v: raw } = await searchParams;
  const v: V = raw === "supplier" || raw === "internal" ? raw : "customer";
  await getSession();
  const supabase = await createClient();
  const { data: ok } = await supabase.rpc("can_corp_order", { p_order: id });
  if (!ok) redirect("/work?denied=1");
  const [{ data: o }, { data: items }, { data: steps }, { data: imgs }, { data: co }, { data: dir }, { data: names }] = await Promise.all([
    supabase.from("corp_orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("corp_order_items").select("*").eq("order_id", id).order("sort"),
    supabase.from("corp_item_steps").select("*").eq("order_id", id).order("sort"),
    supabase.from("corp_item_images").select("*").eq("order_id", id).order("created_at"),
    supabase.from("companies").select("name_th, name_en, address_th, address_en, tax_id, phone, mobile, email").eq("code", "PKM").maybeSingle(),
    supabase.from("employee_directory").select("id, first_name, nickname"),
    supabase.rpc("user_names"),
  ]);
  if (!o) notFound();
  const order = o as CorpOrder;
  const its = (items ?? []) as CorpItem[];
  const sts = (steps ?? []) as CorpStep[];
  const ims = (imgs ?? []) as CorpImage[];
  const empName = (eid: string | null) => { const e = ((dir ?? []) as { id: string; first_name: string; nickname: string | null }[]).find((x) => x.id === eid); return e ? e.nickname ?? e.first_name : null; };
  const userName = (uid: string | null) => ((names ?? []) as { user_id: string; name: string }[]).find((x) => x.user_id === uid)?.name ?? null;
  const rev = String(order.spec_rev ?? 0).padStart(2, "0");
  const specNo = `OS-${order.order_no.replace(/^ORD-?/, "")}`;
  const title = v === "supplier" ? "ใบสั่งผลิต / สเปกงาน" : v === "internal" ? "ใบงานสั่งสินค้า (ภายใน)" : "ใบยืนยันงานและอาร์ตเวิร์ก";
  const titleEn = v === "supplier" ? "PRODUCTION ORDER SPECIFICATION" : v === "internal" ? "ORDER SPECIFICATION SHEET · INTERNAL" : "JOB & ARTWORK CONFIRMATION";
  const isImg = (u: string) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u);

  const td: React.CSSProperties = { padding: "4px 6px", fontSize: 11.5, verticalAlign: "top", borderBottom: `1px dotted ${C.line}` };
  const lab: React.CSSProperties = { color: C.soft, fontSize: 10.5, whiteSpace: "nowrap", width: 120 };
  const Row = ({ l, val }: { l: string; val?: string | number | null }) => <tr><td style={{ ...td, ...lab }}>{l}</td><td style={td}>{val ?? "—"}</td></tr>;
  const Sec = ({ n, th, en }: { n: string; th: string; en: string }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, borderBottom: `2px solid ${C.purple}`, paddingBottom: 3, margin: "14px 0 6px" }}>
      <span style={{ color: C.pink, fontWeight: 700, fontSize: 15 }}>{n}</span><b style={{ color: C.purple, fontSize: 14 }}>{th}</b><span style={{ color: C.soft, fontSize: 10, letterSpacing: 1.5 }}>{en}</span>
    </div>
  );

  return (
    <div style={{ fontFamily: "'IBM Plex Sans Thai', sans-serif", color: C.ink, background: "#f4f1f8", minHeight: "100vh", padding: "24px 0" }}>
      <style>{`@media print { .noprint { display:none !important } body, .wrap { background:#fff !important; padding:0 !important } .page { box-shadow:none !important; margin:0 !important } .item { break-inside: avoid-page } } @page { size: A4; margin: 10mm }`}</style>
      <PrintButton />
      <div className="noprint" style={{ textAlign: "center", fontSize: 12, color: C.soft, marginBottom: 8 }}>ฉบับ: {v === "customer" ? "ลูกค้า" : v === "supplier" ? "ผู้ผลิต / ซัพพลายเออร์" : "ภายใน"} · กด “พิมพ์ / บันทึกเป็น PDF” แล้วเลือก Save as PDF</div>
      <div className="page wrap" style={{ background: "#fff", maxWidth: 820, margin: "0 auto", padding: "22px 28px", boxShadow: "0 2px 12px rgba(0,0,0,.08)" }}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-vertical.png" alt="PAHKAHMAH" style={{ height: 62 }} />
            <div style={{ fontSize: 10.5, color: C.soft, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.purple }}>{co?.name_en ?? "PAHKAHMAH (THAILAND) CO.,LTD."}</div>
              <div>{co?.address_en ?? co?.address_th ?? ""}</div>
              <div>{co?.tax_id ? `Tax ID ${co.tax_id}` : ""}{co?.email ? `  ·  ${co.email}` : ""}{co?.phone || co?.mobile ? `  ·  Tel. ${co?.phone ?? co?.mobile}` : ""}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: C.purple }}>{title}</div>
            <div style={{ fontSize: 9.5, letterSpacing: 2, color: C.pink, fontWeight: 600 }}>{titleEn}</div>
            <table style={{ marginLeft: "auto", marginTop: 6, fontSize: 11 }}><tbody>
              <tr><td style={{ color: C.soft, paddingRight: 8 }}>เลขที่ No.</td><td><b>{specNo}</b></td></tr>
              <tr><td style={{ color: C.soft, paddingRight: 8 }}>ออเดอร์</td><td>{order.order_no}</td></tr>
              <tr><td style={{ color: C.soft, paddingRight: 8 }}>วันที่ Date</td><td>{dmy(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10))}</td></tr>
              <tr><td style={{ color: C.soft, paddingRight: 8 }}>แก้ไขครั้งที่ Rev.</td><td>{rev}</td></tr>
            </tbody></table>
          </div>
        </div>

        <Sec n="01" th={v === "supplier" ? "ข้อมูลงาน" : "ข้อมูลลูกค้าและรายละเอียดงาน"} en={v === "supplier" ? "JOB DETAILS" : "CUSTOMER & JOB DETAILS"} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
            {v !== "supplier" && <>
              <Row l="ชื่อลูกค้า Customer" val={order.customer_label ? `${order.customer_name} (${order.customer_label})` : order.customer_name} />
              <Row l="ที่อยู่ Address" val={order.customer_address} />
              <Row l="ผู้ติดต่อ Contact" val={order.contact_person} />
              <Row l="โทร / LINE" val={order.contact_phone} />
              <Row l="อีเมล Email" val={order.contact_email} />
            </>}
            {v === "supplier" && <>
              <Row l="ลูกค้า (อ้างอิง)" val={order.customer_label || order.customer_name} />
              <Row l="กำหนดส่งของถึงเรา" val={dmy(order.supplier_due)} />
            </>}
          </tbody></table>
          <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
            {v !== "supplier" && <Row l="เลขผู้เสียภาษี Tax ID" val={order.customer_tax_id} />}
            {v !== "supplier" && <Row l="ใบเสนอราคา QT No." val={order.doc_qt} />}
            {v !== "supplier" && <Row l="ใบสั่งซื้อ PO No." val={order.po_no} />}
            <Row l="ชื่องาน Job" val={order.title} />
            <Row l={v === "supplier" ? "กำหนดส่งลูกค้า (อ้างอิง)" : "กำหนดส่งงาน Delivery"} val={dmy(order.due_date)} />
            {v === "internal" && <Row l="กำหนดรับของจากผู้ผลิต" val={dmy(order.supplier_due)} />}
            {v === "internal" && <Row l="มูลค่า (รวม VAT)" val={`฿${Number(order.amount).toLocaleString("th-TH")}`} />}
          </tbody></table>
        </div>
        {order.detail && <div style={{ fontSize: 11.5, marginTop: 6, whiteSpace: "pre-wrap" }}><span style={{ color: C.soft }}>รายละเอียด / Packaging: </span>{order.detail}</div>}

        <Sec n="02" th="รายการสินค้า อาร์ตเวิร์กและสเปก" en="ITEMS · ARTWORK & SPECIFICATIONS" />
        {!its.length && <div style={{ fontSize: 12, color: C.soft, padding: 12 }}>ยังไม่มีรายการสินค้า</div>}
        {its.map((it) => {
          const pics = specImages(ims, it.id, v === "internal");
          const st = sts.filter((s) => s.item_id === it.id).sort((a, b) => a.sort - b.sort);
          return (
            <div key={it.id} className="item" style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{it.line_code && <span style={{ color: C.pink, marginRight: 6 }}>{it.line_code}</span>}{it.name}</div>
                <div style={{ fontSize: 11, color: C.soft, whiteSpace: "nowrap" }}>{it.qty ? `${it.qty.toLocaleString()} ${it.unit}` : ""}{v === "internal" ? ` · ${DESIGN_TYPE_TH[it.design_type]}` : ""}</div>
              </div>
              {pics.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(pics.length, 3)}, 1fr)`, gap: 8, marginBottom: 8 }}>
                  {pics.map((p) => (
                    <figure key={p.id} style={{ margin: 0, border: `1px solid ${C.line}`, borderRadius: 8, padding: 4, textAlign: "center" }}>
                      {isImg(p.url) ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.url} alt="" style={{ maxWidth: "100%", maxHeight: pics.length === 1 ? 360 : 230, objectFit: "contain" }} /> : <a href={p.url} style={{ fontSize: 11 }}>📎 {p.caption ?? "ไฟล์"}</a>}
                      <figcaption style={{ fontSize: 10, color: p.status === "approved" ? "#1b7a3d" : "#b06a00", marginTop: 2 }}>{imageKindTH(p.kind)} · {p.status === "approved" ? `✓ ลูกค้าคอนเฟิร์ม ${dmy(p.approved_at?.slice(0, 10))}` : "รอคอนเฟิร์ม"}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
              <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
                <tr>
                  <td style={{ width: "50%", verticalAlign: "top", paddingRight: 8 }}><table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
                    {it.base_model && <Row l="แบบสินค้า Model" val={it.base_model} />}
                    <Row l="ขนาด Size" val={it.size} />
                    <Row l="วัสดุ Material" val={it.material} />
                    <Row l="สี / เทคนิค Process" val={it.color_process} />
                    <Row l="Pantone" val={it.pantone} />
                  </tbody></table></td>
                  <td style={{ width: "50%", verticalAlign: "top" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
                    <Row l="ผลิต LOGO" val={it.logo_method ? logoMethodTH(it.logo_method) : null} />
                    <Row l="ตำแหน่ง LOGO" val={it.logo_position} />
                    <Row l="ตำแหน่งติด Tag" val={it.tag_position} />
                    <Row l="แพคเกจจิ้ง" val={it.packaging} />
                    {v !== "customer" && <Row l="ผู้ผลิต" val={it.supplier_name} />}
                  </tbody></table></td>
                </tr>
              </tbody></table>
              {it.remarks && <div style={{ fontSize: 11.5, marginTop: 4, whiteSpace: "pre-wrap" }}><span style={{ color: C.soft }}>หมายเหตุ Remarks: </span>{it.remarks}</div>}
              {v === "internal" && st.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                  <thead><tr style={{ background: "#f3effa" }}><th style={{ ...td, textAlign: "left" }}>ขั้นตอน</th><th style={{ ...td, textAlign: "left" }}>ผู้รับผิดชอบ</th><th style={{ ...td, textAlign: "left" }}>กำหนด</th><th style={{ ...td, textAlign: "left" }}>สถานะ</th></tr></thead>
                  <tbody>{st.map((s) => <tr key={s.id}><td style={td}>{s.label}</td><td style={td}>{userName(s.assignee_user_id) ?? empName(s.assignee_id) ?? "—"}</td><td style={td}>{dmy(s.due_date)}</td><td style={{ ...td, color: s.status === "done" ? "#1b7a3d" : s.status === "skipped" ? C.soft : s.due_date && s.due_date < new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10) ? "#c92a2a" : C.ink }}>{s.status === "done" ? "✓ เสร็จ" : s.status === "skipped" ? "ข้าม" : "รอดำเนินการ"}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          );
        })}

        {v === "customer" && (
          <div className="item" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 6 }}>
            <div style={{ background: "#fdf0f5", borderRadius: 10, padding: 10, fontSize: 11.5 }}>
              <b style={{ color: C.pink }}>ผลการตรวจแบบ (ลูกค้าเลือก)</b>
              <div style={{ marginTop: 4, lineHeight: 1.9 }}>☐ อนุมัติตามแบบ Approved<br />☐ อนุมัติแก้ไขตามที่ระบุ With changes<br />☐ ขอแก้ไข ส่งแบบใหม่ Revise</div>
              <div style={{ marginTop: 4 }}>รายการที่ต้องแก้ไข Changes ...........................................................</div>
              <div style={{ marginTop: 6 }}>..........................................................................................</div>
            </div>
            <div style={{ fontSize: 10, color: C.soft, lineHeight: 1.6, alignSelf: "end" }}>โปรดตรวจสอบตัวสะกด ข้อความ สี ขนาด และตำแหน่งให้ถูกต้องก่อนลงนาม เมื่อลูกค้าลงนามอนุมัติแล้ว บริษัทจะดำเนินการผลิตตามแบบนี้ และไม่รับผิดชอบความผิดพลาดในส่วนที่ได้รับการอนุมัติแล้ว สีบนหน้าจอหรือเอกสารพิมพ์อาจแตกต่างจากชิ้นงานจริงเล็กน้อย</div>
          </div>
        )}

        <Sec n="03" th="การลงนาม" en="SIGNATURES" />
        <div className="item" style={{ display: "grid", gridTemplateColumns: `repeat(${v === "customer" ? 3 : 2}, 1fr)`, gap: 10 }}>
          {(v === "customer" ? [["ผู้จัดทำ", "PREPARED BY"], ["ผู้มีอำนาจอนุมัติ", "AUTHORIZED BY"], ["ลูกค้าผู้อนุมัติแบบ", "CUSTOMER APPROVAL"]]
            : v === "supplier" ? [["ผู้สั่งผลิต", "ORDERED BY"], ["ผู้ผลิตรับทราบ", "SUPPLIER ACKNOWLEDGED"]]
            : [["ผู้จัดทำ", "PREPARED BY"], ["ผู้มีอำนาจอนุมัติ", "AUTHORIZED BY"]]).map(([th, en], i, arr) => (
            <div key={en} style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", textAlign: "center" }}>
              <div style={{ background: i === arr.length - 1 && v === "customer" ? C.purple : "#f3effa", color: i === arr.length - 1 && v === "customer" ? "#fff" : C.purple, padding: 5, fontSize: 12, fontWeight: 700 }}>{th}<div style={{ fontSize: 8.5, letterSpacing: 1.5, fontWeight: 500 }}>{en}</div></div>
              <div style={{ padding: "26px 8px 8px", fontSize: 10.5, lineHeight: 2 }}>ลงชื่อ ..............................................<br />( .............................................. )<br />วันที่ ....... / ....... / ...........</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", fontSize: 10, color: C.soft, marginTop: 14, letterSpacing: 1 }}>PAHKAHMAH (THAILAND) CO.,LTD.  ·  HAPPINESS OF THAINESS</div>
      </div>
    </div>
  );
}
