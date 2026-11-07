"use client";
export function PrintButton() {
  return (
    <div className="noprint" style={{ position: "fixed", top: 12, right: 12, display: "flex", gap: 8, zIndex: 10 }}>
      <button onClick={() => window.print()} style={{ background: "#452a79", color: "#fff", border: 0, borderRadius: 10, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>พิมพ์ / บันทึกเป็น PDF</button>
      <button onClick={() => window.close()} style={{ background: "#fff", color: "#452a79", border: "1px solid #452a79", borderRadius: 10, padding: "10px 16px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>ปิด</button>
    </div>
  );
}
