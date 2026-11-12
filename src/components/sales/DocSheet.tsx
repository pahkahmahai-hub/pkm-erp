import { DOC_META, thaiBaht, type SalesDoc, type SalesDocItem } from "@/lib/sales/types";
import { PrintButton } from "./PrintButton";

const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");

export function DocSheet({ d, lines }: { d: SalesDoc; lines: SalesDocItem[] }) {
  const c = d.companies!;
  const meta = DOC_META[d.doc_type];
  const en = c.doc_lang === "en";
  const title = en ? meta.en : meta.th;
  const color = meta.color;
  const copies: string[] = ["quotation", "purchase_req", "purchase_order", "purchase_request"].includes(d.doc_type) ? [""] : en ? ["Original", "Copy"] : ["ต้นฉบับ", "สำเนา"];

  return (
    <>
      <title>{d.doc_no}</title>
      <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; font-family: "IBM Plex Sans Thai", sans-serif; color: #222; font-size: 12px; background: #f3f0ea; }
          .page { width: 210mm; min-height: 297mm; margin: 12px auto; background: #fff; padding: 14mm 14mm 16mm; position: relative; page-break-after: always; display: flex; flex-direction: column; }
          .page:last-child { page-break-after: auto; }
          .corner { position: absolute; top: 0; right: 0; width: 0; height: 0; border-style: solid; border-width: 0 70px 70px 0; border-color: transparent ${color} transparent transparent; }
          .corner span { position: absolute; top: 8px; right: -62px; color: #fff; font-weight: 700; font-size: 14px; }
          .head { display: flex; justify-content: space-between; gap: 24px; }
          .co { font-size: 11px; line-height: 1.5; }
          .co b { font-size: 12.5px; }
          .title { text-align: right; }
          .title h1 { margin: 0 0 2px; font-size: 20px; color: ${color}; font-weight: 700; }
          .title .sub { font-size: 10px; color: #666; }
          .metaT { margin-top: 8px; font-size: 11px; border-top: 1px solid #ddd; padding-top: 6px; }
          .metaT td { padding: 1px 6px 1px 0; vertical-align: top; }
          .metaT td:first-child { color: #777; width: 70px; }
          .cust { margin-top: 14px; font-size: 11px; line-height: 1.5; }
          .cust .lbl { color: ${color}; font-weight: 600; font-size: 10px; letter-spacing: .05em; }
          table.items { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 11px; }
          table.items th { background: ${color}; color: #fff; padding: 6px 6px; text-align: left; font-weight: 600; font-size: 10.5px; }
          table.items td { padding: 6px; border-bottom: 1px solid #eee; vertical-align: top; }
          .r { text-align: right; } .c { text-align: center; }
          .totals { margin-top: 10px; display: flex; justify-content: space-between; gap: 20px; }
          .words { font-size: 11px; color: #444; padding-top: 6px; }
          .sum { width: 300px; font-size: 11px; }
          .sum div { display: flex; justify-content: space-between; padding: 2px 0; }
          .sum .g { font-weight: 700; font-size: 12.5px; border-top: 1px solid #333; margin-top: 4px; padding-top: 5px; color: ${color}; }
          .notes { margin-top: 14px; font-size: 10.5px; white-space: pre-wrap; }
          .notes .lbl { color: ${color}; font-weight: 600; font-size: 10px; }
          .bank { margin-top: 8px; font-size: 10.5px; color: #333; }
          .foot { margin-top: auto; padding-top: 28px; }
          .inname { display: flex; justify-content: space-between; font-size: 10.5px; color: #444; }
          .signs { display: flex; justify-content: space-between; margin-top: 44px; gap: 30px; position: relative; }
          .sig { flex: 1; display: flex; gap: 12px; }
          .sig div { flex: 1; border-top: 1px solid #999; padding-top: 4px; font-size: 10px; color: #555; text-align: center; position: relative; }
          .sig .mark { position: absolute; left: 0; right: 0; bottom: 100%; height: 0; pointer-events: none; }
          .sig .mark .sigimg { position: absolute; left: 50%; bottom: 2px; transform: translateX(-50%); height: 40px; max-width: 90%; object-fit: contain; }
          .sig .mark .sigdate { position: absolute; left: 0; right: 0; bottom: 4px; text-align: center; font-size: 11px; color: #222; }
          /* ตราประทับ: ขนาดใหญ่ วางตรงกลางระหว่างสองกลุ่มลายเซ็น ค่อนไปทางซ้ายของช่องผู้อนุมัติ (ตามแบบ FlowAccount) */
          .signs .stampimg { position: absolute; left: 50%; bottom: 10px; transform: translateX(-88%); height: 60px; width: auto; max-width: 160px; object-fit: contain; opacity: 0.95; }
          body[data-sig="0"] .sigimg, body[data-sig="0"] .sigdate, body[data-stamp="0"] .stampimg { display: none; }
          .pageno { position: absolute; bottom: 8mm; left: 14mm; font-size: 9px; color: #999; }
          @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } .noprint { display: none !important; } }
        `}</style>
        <PrintButton hasSignature={!!c.signature_path} hasStamp={!!c.stamp_path} />
        {copies.map((copy, ci) => (
          <div className="page" key={ci}>
            <div className="corner"><span>{ci + 1}</span></div>
            <div className="head">
              <div className="co">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.logo_path ?? "/brand/logo-horizontal.png"} alt="" style={{ height: c.logo_path ? 56 : 44, marginBottom: 6 }} />
                <div><b>{en ? c.name_en : c.name_th}</b> {!en && c.branch ? `(${c.branch})` : ""}</div>
                <div>{en ? c.address_en : c.address_th}</div>
                {c.tax_id && <div>{en ? "Tax ID" : "เลขประจำตัวผู้เสียภาษี"} {c.tax_id}</div>}
                <div>{c.phone && `${en ? "Tel." : "โทร."} ${c.phone}`} {c.mobile && `${en ? "Mobile" : "เบอร์มือถือ"} ${c.mobile}`}</div>
                {c.website && <div>{c.website}</div>}
              </div>
              <div className="title">
                <h1>{title}</h1>
                {copy && <div className="sub">{copy}{!en && d.doc_type === "invoice" && ci === 0 ? " (เอกสารออกเป็นชุด)" : ""}</div>}
                <table className="metaT">
                  <tbody>
                    <tr><td>{en ? "No." : "เลขที่"}</td><td><b>{d.doc_no}</b></td></tr>
                    <tr><td>{en ? "Date" : "วันที่"}</td><td>{dmy(d.doc_date)}</td></tr>
                    {d.due_date && <tr><td>{en ? "Due" : "ครบกำหนด"}</td><td>{dmy(d.due_date)}</td></tr>}
                    {d.valid_until && <tr><td>{en ? "Valid until" : "ยืนราคาถึง"}</td><td>{dmy(d.valid_until)}</td></tr>}
                    {d.ref_doc_no && <tr><td>{en ? "Ref." : "อ้างอิง"}</td><td>{d.ref_doc_no}</td></tr>}
                    {d.po_no && <tr><td>PO</td><td>{d.po_no}</td></tr>}
                    {d.seller_name && <tr><td>{d.doc_type === "purchase_order" || d.doc_type === "purchase_request" ? "ผู้สั่งซื้อ" : en ? "Sales" : "ผู้ขาย"}</td><td>{d.seller_name}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="cust">
              <div className="lbl">{d.doc_type === "purchase_req" || d.doc_type === "purchase_order" || d.doc_type === "purchase_request" ? "ผู้จำหน่าย · SUPPLIER" : en ? "CUSTOMER" : "ลูกค้า"}</div>
              <div><b>{d.customer_name}</b>{d.customer_branch && ` (${d.customer_branch})`}</div>
              {d.customer_address && <div>{d.customer_address}</div>}
              {d.customer_tax_id && <div>{en ? "Tax ID" : "เลขประจำตัวผู้เสียภาษี"} {d.customer_tax_id}</div>}
            </div>

            <table className="items">
              <thead><tr><th style={{ width: 28 }}>#</th><th>{en ? "Description" : "รายละเอียด"}</th><th className="r" style={{ width: 70 }}>{en ? "Qty" : "จำนวน"}</th><th className="r" style={{ width: 90 }}>{en ? "Unit price" : "ราคาต่อหน่วย"}</th><th className="r" style={{ width: 95 }}>{en ? "Amount" : "ยอดรวม"}</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="c">{l.line_no}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{l.description}{Number(l.discount_pct) > 0 && <div style={{ color: "#777", fontSize: 10 }}>ส่วนลด {l.discount_pct}%</div>}</td>
                    <td className="r">{Number(l.qty).toLocaleString()} {l.unit}</td>
                    <td className="r">{fmt(l.unit_price)}</td>
                    <td className="r">{fmt(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="totals">
              <div className="words">({en ? "" : thaiBaht(Number(d.grand_total))})</div>
              <div className="sum">
                <div><span>{en ? "Subtotal" : "รวมเป็นเงิน"}</span><span>{fmt(d.subtotal)} {en ? "" : "บาท"}</span></div>
                {Number(d.discount_total) > 0 && <><div><span>{en ? "Discount" : "ส่วนลด"}{Number(d.discount_pct) > 0 ? ` ${d.discount_pct}%` : ""}</span><span>{fmt(d.discount_total)} {en ? "" : "บาท"}</span></div><div><span>{en ? "After discount" : "จำนวนเงินหลังหักส่วนลด"}</span><span>{fmt(Number(d.subtotal) - Number(d.discount_total))} {en ? "" : "บาท"}</span></div></>}
                {Number(d.deposit_amount) > 0 && <><div><span>หักเงินมัดจำ {d.deposit_ref ?? ""}</span><span>{fmt(d.deposit_amount)} บาท</span></div><div><span>จำนวนเงินหลังหักมัดจำ</span><span>{fmt(Number(d.subtotal) - Number(d.discount_total) - Number(d.deposit_amount))} บาท</span></div></>}
                {d.vat_mode === "inclusive" && <><div><span>ภาษีมูลค่าเพิ่ม 7%</span><span>{fmt(d.vat_amount)} บาท</span></div><div><span>ราคาไม่รวมภาษีมูลค่าเพิ่ม</span><span>{fmt(d.net_before_vat)} บาท</span></div></>}
                {d.vat_mode === "exclusive" && <div><span>ภาษีมูลค่าเพิ่ม 7%</span><span>{fmt(d.vat_amount)} บาท</span></div>}
                <div className="g"><span>{en ? "Grand total" : "จำนวนเงินรวมทั้งสิ้น"}</span><span>{fmt(d.grand_total)} {en ? "THB" : "บาท"}</span></div>
                {Number(d.wht_amount) > 0 && <><div><span>หัก ณ ที่จ่าย {d.wht_pct}%</span><span>{fmt(d.wht_amount)} บาท</span></div><div style={{ fontWeight: 600 }}><span>ยอดรับสุทธิ</span><span>{fmt(Number(d.grand_total) - Number(d.wht_amount))} บาท</span></div></>}
              </div>
            </div>

            {(d.notes || c.bank_account_no) && (
              <div className="notes">
                <div className="lbl">{en ? "REMARKS" : "หมายเหตุ"}</div>
                {d.notes && <div>{d.notes}</div>}
                {c.bank_account_no && d.doc_type !== "receipt" && d.doc_type !== "credit_note" && (
                  <div className="bank">- {en ? "Bank" : "ธนาคาร"} : {c.bank_name} {c.bank_branch && `${en ? "Branch" : "สาขา"} ${c.bank_branch}`} &nbsp; {en ? "Account name" : "ชื่อบัญชี"} : {c.bank_account_name} &nbsp; {en ? "Account no." : "เลขที่บัญชี"} : {c.bank_account_no}</div>
                )}
              </div>
            )}

            <div className="foot">
              <div className="inname"><span>{en ? "For" : "ในนาม"} {d.customer_name}</span><span>{en ? "For" : "ในนาม"} {en ? c.name_en : c.name_th}</span></div>
              <div className="signs">
                {c.stamp_path && <img className="stampimg" src={c.stamp_path} alt="" />}
                <div className="sig"><div>{en ? "Received by" : meta.sign[0]}</div><div>{en ? "Date" : "วันที่"}</div></div>
                <div className="sig"><div><span className="mark">{c.signature_path && <img className="sigimg" src={c.signature_path} alt="" />}</span>{en ? "Authorized signature" : meta.sign[1]}{c.signer_name && <><br />({c.signer_name})</>}</div><div><span className="mark">{c.signature_path && <span className="sigdate">{dmy(d.doc_date)}</span>}</span>{en ? "Date" : "วันที่"}</div></div>
              </div>
            </div>
            <div className="pageno">{d.doc_no} · {copy}</div>
          </div>
        ))}
    </>
  );
}
