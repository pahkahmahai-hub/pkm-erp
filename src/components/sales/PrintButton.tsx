"use client";
import { useEffect, useState } from "react";

const btn = (primary: boolean): React.CSSProperties => ({ background: primary ? "#452a79" : "#fff", color: primary ? "#fff" : "#452a79", border: "1px solid #452a79", borderRadius: 10, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });

/** toolbar for print pages — with optional ลายเซ็น / ตราประทับ toggles (shown only when the company has the image) */
export function PrintButton({ hasSignature = false, hasStamp = false }: { hasSignature?: boolean; hasStamp?: boolean }) {
  const [sig, setSig] = useState(hasSignature);
  const [stamp, setStamp] = useState(hasStamp);
  useEffect(() => { document.body.dataset.sig = sig ? "1" : "0"; document.body.dataset.stamp = stamp ? "1" : "0"; }, [sig, stamp]);
  return (
    <div className="noprint" style={{ position: "fixed", top: 12, right: 12, display: "flex", gap: 8, zIndex: 10, alignItems: "center" }}>
      {(hasSignature || hasStamp) && (
        <div style={{ background: "#fff", border: "1px solid #ddd", borderRadius: 10, padding: "8px 12px", display: "flex", gap: 12, fontSize: 13 }}>
          {hasSignature && <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={sig} onChange={(e) => setSig(e.target.checked)} /> ลายเซ็น</label>}
          {hasStamp && <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={stamp} onChange={(e) => setStamp(e.target.checked)} /> ตราประทับ</label>}
        </div>
      )}
      <button onClick={() => window.print()} style={btn(true)}>พิมพ์ / บันทึกเป็น PDF</button>
      <button onClick={() => window.close()} style={btn(false)}>ปิด</button>
    </div>
  );
}
