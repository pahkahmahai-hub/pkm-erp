import type { Company } from "@/lib/sales/types";
import type { WhtCertificate } from "@/lib/expenses/types";
import { thaiBaht } from "@/lib/sales/types";
import { PrintButton } from "@/components/sales/PrintButton";

const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
const thDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").padEnd(13, " ").slice(0, 13).split("");

/** หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) — 3 copies on A4 */
export function WhtSheet({ c, co }: { c: WhtCertificate; co: Company }) {
  const Boxes = ({ v }: { v: string | null | undefined }) => <span className="inline-flex gap-[2px] align-middle">{digits(v).map((d, i) => <span key={i} className={`inline-grid place-items-center w-[18px] h-[22px] border border-black text-[12px] ${[0, 1, 5, 10, 12].includes(i) ? "ml-[4px]" : ""}`}>{d.trim()}</span>)}</span>;
  const copies = ["ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)", "ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)", "ฉบับที่ 3 (สำหรับผู้หักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)"];
  return (
    <html lang="th"><head><title>{c.cert_no}</title><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>{`@page{size:A4;margin:12mm} body{font-family:Sarabun,sans-serif;color:#000;margin:0;background:#eee} .sheet{width:210mm;min-height:280mm;background:#fff;margin:8mm auto;padding:10mm;box-sizing:border-box;position:relative;page-break-after:always} @media print{body{background:#fff}.sheet{margin:0;box-shadow:none}.no-print{display:none}} .box{border:1px solid #000} .row{display:flex} .cell{padding:4px 6px;font-size:12px} .tt td{border:1px solid #000;padding:4px 6px;font-size:12px}`}</style></head>
      <body>
        <div className="no-print" style={{ textAlign: "center", padding: 10 }}><PrintButton /></div>
        {copies.map((copy) => (
          <div className="sheet" key={copy}>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 16 }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
            <div style={{ textAlign: "center", fontSize: 12 }}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
            <div className="row" style={{ justifyContent: "space-between", fontSize: 11, margin: "4px 0" }}><span>{copy}</span><span>เลขที่ <b>{c.cert_no}</b></span></div>
            <div className="box">
              <div className="cell" style={{ borderBottom: "1px solid #000" }}><b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :</b> เลขประจำตัวผู้เสียภาษีอากร <Boxes v={co.tax_id} />
                <div style={{ marginTop: 4 }}>ชื่อ {co.name_th}{co.branch ? ` (${co.branch})` : ""}</div><div>ที่อยู่ {co.address_th}</div></div>
              <div className="cell"><b>ผู้ถูกหักภาษี ณ ที่จ่าย :</b> เลขประจำตัวผู้เสียภาษีอากร <Boxes v={c.payee_tax_id} />
                <div style={{ marginTop: 4 }}>ชื่อ {c.payee_name}</div><div>ที่อยู่ {c.payee_address ?? "—"}</div>
                <div style={{ marginTop: 4 }}>ลำดับที่ ____ ในแบบ {c.form === "pnd3" ? "☒ ภ.ง.ด.3  ☐ ภ.ง.ด.53" : "☐ ภ.ง.ด.3  ☒ ภ.ง.ด.53"}  ☐ ภ.ง.ด.1ก  ☐ ภ.ง.ด.2  ☐ ภ.ง.ด.2ก</div></div>
            </div>
            <table className="tt" style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
              <thead><tr><td style={{ width: "55%" }}><b>ประเภทเงินได้พึงประเมินที่จ่าย</b></td><td style={{ textAlign: "center" }}><b>วัน เดือน ปี ที่จ่าย</b></td><td style={{ textAlign: "center" }}><b>จำนวนเงินที่จ่าย</b></td><td style={{ textAlign: "center" }}><b>ภาษีที่หักและนำส่งไว้</b></td></tr></thead>
              <tbody>
                {["1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40(1)", "2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40(2)", "3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40(3)", "4. ดอกเบี้ย เงินปันผล ฯลฯ ตามมาตรา 40(4)"].map((t) => <tr key={t}><td>{t}</td><td /><td /><td /></tr>)}
                <tr><td>5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ค่าแสดง ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ฯลฯ<div style={{ paddingLeft: 12, fontWeight: 600 }}>ระบุ: {c.income_type ?? "ค่าจ้าง/ค่าบริการ"} ({Number(c.wht_pct)}%)</div></td>
                  <td style={{ textAlign: "center" }}>{thDate(c.pay_date)}</td><td style={{ textAlign: "right" }}>{fmt(c.income_amount)}</td><td style={{ textAlign: "right" }}>{fmt(c.wht_amount)}</td></tr>
                <tr><td>6. อื่น ๆ (ระบุ)</td><td /><td /><td /></tr>
                <tr><td colSpan={2} style={{ textAlign: "right" }}><b>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</b></td><td style={{ textAlign: "right" }}><b>{fmt(c.income_amount)}</b></td><td style={{ textAlign: "right" }}><b>{fmt(c.wht_amount)}</b></td></tr>
                <tr><td colSpan={4}>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) <b>{thaiBaht(Number(c.wht_amount))}</b></td></tr>
              </tbody>
            </table>
            <div className="box cell" style={{ marginTop: 8 }}>ผู้จ่ายเงิน ☒ (1) หัก ณ ที่จ่าย  ☐ (2) ออกให้ตลอดไป  ☐ (3) ออกให้ครั้งเดียว  ☐ (4) อื่น ๆ</div>
            <div className="box cell" style={{ marginTop: 8, fontSize: 12 }}>
              <div style={{ textAlign: "center" }}>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
              <div style={{ textAlign: "center", marginTop: 36 }}>ลงชื่อ ........................................................ ผู้จ่ายเงิน</div>
              <div style={{ textAlign: "center" }}>({co.signer_name ?? "……………………………"})</div>
              <div style={{ textAlign: "center" }}>{thDate(c.pay_date)}</div>
              <div style={{ textAlign: "right", fontSize: 10, marginTop: 6 }}>ประทับตรานิติบุคคล (ถ้ามี)</div>
            </div>
          </div>
        ))}
      </body></html>
  );
}
