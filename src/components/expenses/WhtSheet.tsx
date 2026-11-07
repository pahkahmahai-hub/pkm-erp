import type { Company } from "@/lib/sales/types";
import type { WhtCertificate } from "@/lib/expenses/types";
import { thaiBaht } from "@/lib/sales/types";
import { PrintButton } from "@/components/sales/PrintButton";

const fmt = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
const dmy = (s: string) => { const d = new Date(s + "T00:00:00"); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").padEnd(13, " ").slice(0, 13).split("");

/** ข้อบนฟอร์ม 50 ทวิ (ตามประกาศกรมสรรพากร) */
export const WHT_ROWS: { row: number; label: string }[] = [
  { row: 1, label: "1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)" },
  { row: 2, label: "2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)" },
  { row: 3, label: "3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)" },
  { row: 4, label: "4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)  (ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)" },
  { row: 5, label: "5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใดๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ" },
  { row: 6, label: "6. อื่น ๆ (ระบุ)" },
];
export const PAYER_CONDITIONS = ["(1) หัก ณ ที่จ่าย", "(2) ออกให้ตลอดไป", "(3) ออกให้ครั้งเดียว", "(4) อื่น ๆ"];

export function WhtSheet({ c, co }: { c: WhtCertificate; co: Company }) {
  const Boxes = ({ v }: { v: string | null | undefined }) => (
    <span className="boxes">{digits(v).map((d, i) => <span key={i} className={`bx ${[1, 5, 10, 12].includes(i) ? "gap" : ""}`}>{d.trim()}</span>)}</span>
  );
  const chk = (on: boolean) => <span className={`chk ${on ? "on" : ""}`}>{on ? "✓" : ""}</span>;
  const row4b = ["(1) อัตราร้อยละ 30 ของกำไรสุทธิ", "(2) อัตราร้อยละ 25 ของกำไรสุทธิ", "(3) อัตราร้อยละ 20 ของกำไรสุทธิ", "(4) อัตราอื่น ๆ (ระบุ) ....... ของกำไรสุทธิ"];
  const row4c = ["(1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล", "(2) เงินปันผลหรือเงินส่วนแบ่งของกำไรที่ได้รับยกเว้นไม่ต้องนำมารวมคำนวณเป็นรายได้เพื่อเสียภาษีเงินได้นิติบุคคล", "(3) กำไรสุทธิส่วนที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปีก่อนรอบระยะเวลาบัญชีปีปัจจุบัน", "(4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)", "(5) อื่น ๆ (ระบุ)"];
  const pages = [["ฉบับที่ 1", "ฉบับที่ 2", "(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)", "(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)"], ["ฉบับที่ 3", "ฉบับที่ 4", "(สำหรับผู้หักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)", "(สำหรับผู้หักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)"]];
  const cell = (r: number) => (r === c.income_row ? { d: dmy(c.pay_date), a: fmt(c.income_amount), t: fmt(c.wht_amount) } : { d: "", a: "", t: "" });

  return (
    <html lang="th"><head><title>{c.cert_no}</title><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>{`
        @page{size:A4;margin:8mm} body{font-family:Sarabun,sans-serif;color:#000;margin:0;background:#eee;font-size:10.5px;line-height:1.35}
        .sheet{width:210mm;min-height:292mm;background:#fff;margin:8mm auto;padding:8mm 9mm;box-sizing:border-box;position:relative;page-break-after:always}
        @media print{body{background:#fff}.sheet{margin:0;box-shadow:none;min-height:auto}.no-print{display:none}}
        .copies{display:grid;grid-template-columns:auto 1fr;gap:0 8px;font-size:9.5px} .copies b{font-weight:700}
        h1{font-size:15px;text-align:center;margin:2px 0 0;font-weight:700} .sub{text-align:center;font-size:11px}
        .hdr{position:relative} .no{position:absolute;right:0;top:0;text-align:left;font-size:10px;line-height:1.7}
        .sec{border:1px solid #000;padding:4px 6px;margin-top:4px} .sec .ln{display:flex;gap:6px;align-items:flex-end} .sec .fill{flex:1;border-bottom:1px dotted #555;padding:0 4px;min-height:14px}
        .hint{font-size:8.5px;color:#333}
        .boxes{display:inline-flex;gap:2px;vertical-align:middle;margin-left:4px} .bx{display:inline-grid;place-items:center;width:13px;height:16px;border:1px solid #000;font-size:10px} .bx.gap{margin-left:4px}
        .chk{display:inline-grid;place-items:center;width:11px;height:11px;border:1px solid #000;font-size:9px;line-height:1;margin:0 3px 0 6px;vertical-align:-1px}
        table.t{width:100%;border-collapse:collapse;margin-top:4px} table.t th,table.t td{border:1px solid #000;padding:2px 5px;vertical-align:top} table.t th{font-weight:700;text-align:center;font-size:10px}
        .r{text-align:right;white-space:nowrap} .c{text-align:center;white-space:nowrap} .ind{padding-left:14px} .ind2{padding-left:28px}
        .foot{display:grid;grid-template-columns:1fr 1.3fr;gap:6px;margin-top:4px} .box{border:1px solid #000;padding:5px 6px}
        .sign{text-align:center} .sign img{height:30px;display:block;margin:0 auto 4px}
        .warn{font-size:9px} .note{font-size:8.5px;margin-top:4px}
      `}</style></head>
      <body>
        <div className="no-print" style={{ textAlign: "center", padding: 10 }}><PrintButton /></div>
        {pages.map(([n1, n2, d1, d2]) => (
          <div className="sheet" key={n1}>
            <div className="copies"><b>{n1}</b><span>{d1}</span><b>{n2}</b><span>{d2}</span></div>
            <div className="hdr">
              <h1>หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
              <div className="sub">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
              <div className="no">เล่มที่ ..................<br />เลขที่ <b>{c.cert_no}</b></div>
            </div>

            <div className="sec">
              <div className="ln"><b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :-</b><span style={{ marginLeft: "auto" }}>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*<Boxes v={co.tax_id} /></span></div>
              <div className="ln"><span>ชื่อ</span><span className="fill">{co.name_th}{co.branch ? ` (${co.branch})` : ""}</span></div>
              <div className="hint ind">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</div>
              <div className="ln"><span>ที่อยู่</span><span className="fill">{co.address_th}</span></div>
              <div className="hint ind">(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</div>
            </div>
            <div className="sec">
              <div className="ln"><b>ผู้ถูกหักภาษี ณ ที่จ่าย :-</b><span style={{ marginLeft: "auto" }}>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*<Boxes v={c.payee_tax_id} /></span></div>
              <div className="ln"><span>ชื่อ</span><span className="fill">{c.payee_name}{c.payee_branch ? ` (${c.payee_branch})` : ""}</span></div>
              <div className="hint ind">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</div>
              <div className="ln"><span>ที่อยู่</span><span className="fill">{c.payee_address ?? ""}</span></div>
              <div className="hint ind">(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</div>
              <div className="ln" style={{ marginTop: 3 }}><b>ลำดับที่</b><span style={{ borderBottom: "1px dotted #555", width: 60, display: "inline-block" }} /><span>ในแบบ</span>
                <span>{chk(false)}(1) ภ.ง.ด.1ก {chk(false)}(2) ภ.ง.ด.1ก พิเศษ {chk(false)}(3) ภ.ง.ด.2 {chk(c.form === "pnd3")}(4) ภ.ง.ด.3</span></div>
              <div className="ln hint ind"><span style={{ visibility: "hidden" }}>ลำดับที่</span><span style={{ fontSize: 10.5, color: "#000" }}>{chk(false)}(5) ภ.ง.ด.2ก {chk(false)}(6) ภ.ง.ด.3ก {chk(c.form === "pnd53")}(7) ภ.ง.ด.53</span></div>
            </div>

            <table className="t">
              <thead><tr><th style={{ width: "58%" }}>ประเภทเงินได้พึงประเมินที่จ่าย</th><th>วัน เดือน<br />หรือปีภาษี ที่จ่าย</th><th>จำนวนเงินที่จ่าย</th><th>ภาษีที่หัก<br />และนำส่งไว้</th></tr></thead>
              <tbody>
                {[1, 2, 3].map((r) => { const v = cell(r); return <tr key={r}><td>{WHT_ROWS[r - 1].label}</td><td className="c">{v.d}</td><td className="r">{v.a}</td><td className="r">{v.t}</td></tr>; })}
                <tr><td>4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)</td><td className="c">{cell(4).d}</td><td className="r">{cell(4).a}</td><td className="r">{cell(4).t}</td></tr>
                <tr><td>
                  <div className="ind">(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)</div>
                  <div className="ind2">(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจากกำไรสุทธิของกิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้</div>
                  {row4b.map((t) => <div key={t} className="ind2" style={{ paddingLeft: 42 }}>{t}</div>)}
                  <div className="ind2">(2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี เนื่องจากจ่ายจาก</div>
                  {row4c.map((t) => <div key={t} className="ind2" style={{ paddingLeft: 42 }}>{t}</div>)}
                </td><td /><td /><td /></tr>
                <tr><td>{WHT_ROWS[4].label}{c.income_row === 5 && c.income_type && <div className="ind" style={{ fontWeight: 700 }}>ระบุ: {c.income_type} (หัก {Number(c.wht_pct)}%)</div>}</td><td className="c">{cell(5).d}</td><td className="r">{cell(5).a}</td><td className="r">{cell(5).t}</td></tr>
                <tr><td>6. อื่น ๆ (ระบุ) {c.income_row === 6 ? <b>{c.income_type}</b> : "......................................................."}</td><td className="c">{cell(6).d}</td><td className="r">{cell(6).a}</td><td className="r">{cell(6).t}</td></tr>
                <tr><td colSpan={2} className="r" style={{ fontWeight: 700 }}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td><td className="r" style={{ fontWeight: 700 }}>{fmt(c.income_amount)}</td><td className="r" style={{ fontWeight: 700 }}>{fmt(c.wht_amount)}</td></tr>
                <tr><td colSpan={4}><b>รวมเงินภาษีที่หักนำส่ง</b> (ตัวอักษร) <b>{thaiBaht(Number(c.wht_amount))}</b></td></tr>
              </tbody>
            </table>

            <div className="sec" style={{ fontSize: 10 }}><b>เงินที่จ่ายเข้า</b> กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน ........... บาท &nbsp; กองทุนประกันสังคม ........... บาท &nbsp; กองทุนสำรองเลี้ยงชีพ ........... บาท</div>
            <div className="sec" style={{ fontSize: 10 }}><b>ผู้จ่ายเงิน</b> {PAYER_CONDITIONS.map((p, i) => <span key={p}>{chk(c.payer_condition === i + 1)}{p}</span>)}</div>

            <div className="foot">
              <div className="box warn"><b>คำเตือน</b> ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร</div>
              <div className="box sign">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo-horizontal.png" alt="" />
                <div>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
                <div style={{ marginTop: 30 }}>ลงชื่อ ........................................................ ผู้จ่ายเงิน</div>
                <div>({co.signer_name ?? "……………………………"})</div>
                <div>{dmy(c.pay_date)}</div>
                <div className="hint">(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</div>
                <div style={{ fontSize: 9, marginTop: 2 }}>{co.name_th}</div>
              </div>
            </div>
            <div className="note"><b>หมายเหตุ</b> เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง 1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง 2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า 3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร</div>
          </div>
        ))}
      </body></html>
  );
}
