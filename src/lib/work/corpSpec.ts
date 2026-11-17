// ใบงานสั่งสินค้า (Order Specification Sheet) — 0066 · ใช้ทั้ง server/client

export type DesignType = "existing" | "new";
export type LogoMethod = "screen" | "embroider" | "dft" | "sticker" | "other";
export type ImageKind = "product" | "mockup" | "packaging" | "sample" | "reference";

export interface CorpItem {
  id: string; order_id: string; line_code: string | null; name: string; design_type: DesignType; base_model: string | null;
  qty: number | null; unit: string; size: string | null; material: string | null; color_process: string | null; pantone: string | null;
  logo_method: LogoMethod | null; logo_position: string | null; tag_position: string | null; packaging: string | null;
  sample_required: boolean; supplier_name: string | null; remarks: string | null; sort: number;
}
export interface CorpStep {
  id: string; item_id: string; order_id: string; step_key: string; label: string; sort: number; optional: boolean;
  assignee_id: string | null; assignee_user_id: string | null; due_date: string | null; status: "todo" | "done" | "skipped";
  done_at: string | null; task_id: string | null; note: string | null;
}
export interface CorpImage {
  id: string; item_id: string; order_id: string; kind: ImageKind; url: string; caption: string | null; status: "draft" | "approved" | "rejected";
  approved_at: string | null; evidence_url: string | null; evidence_note: string | null; created_by: string | null; created_at: string;
}

export const DESIGN_TYPE_TH: Record<DesignType, string> = { existing: "แบบที่มีอยู่แล้ว", new: "แบบใหม่ (ออกแบบให้ลูกค้า)" };
export const LOGO_METHODS: { key: LogoMethod; label: string }[] = [
  { key: "screen", label: "สกรีน" }, { key: "embroider", label: "ปัก" }, { key: "dft", label: "DFT" }, { key: "sticker", label: "สติกเกอร์" }, { key: "other", label: "อื่นๆ" },
];
export const logoMethodTH = (k: string | null) => LOGO_METHODS.find((x) => x.key === k)?.label ?? "—";
export const IMAGE_KINDS: { key: ImageKind; label: string; hint: string }[] = [
  { key: "product", label: "ภาพสินค้า", hint: "แบบสินค้าที่เลือก / แบบที่ออกแบบใหม่" },
  { key: "mockup", label: "ภาพใส่โลโก้", hint: "ภาพสินค้าพร้อมโลโก้/Tag ตำแหน่งจริง" },
  { key: "packaging", label: "แพคเกจจิ้ง", hint: "กล่อง ถุง การ์ด ป้าย" },
  { key: "sample", label: "ตัวอย่างจริง", hint: "รูปตัวอย่างที่ส่งลูกค้า" },
  { key: "reference", label: "อ้างอิง / โลโก้ลูกค้า", hint: "ไฟล์โลโก้ แบบอ้างอิงจากลูกค้า" },
];
export const imageKindTH = (k: ImageKind) => IMAGE_KINDS.find((x) => x.key === k)?.label ?? k;

/** ขั้นตอนมาตรฐาน — key ที่ระบบใช้ผูกการคอนเฟิร์ม: confirm_sample / confirm_design / confirm_packaging */
const S = (key: string, label: string, optional = false) => ({ key, label, optional });
export const STEP_TEMPLATES: Record<DesignType, { key: string; label: string; optional: boolean }[]> = {
  existing: [
    S("pick_model", "เลือกแบบสินค้าที่มี"),
    S("tag_position", "กำหนดตำแหน่งติด Tag / LOGO"),
    S("logo_method", "เลือกรูปแบบผลิต LOGO (สกรีน/ปัก/DFT/สติกเกอร์)"),
    S("send_sample", "ส่งตัวอย่าง (ถ้าลูกค้าต้องการ)", true),
    S("mockup_logo", "ออกแบบภาพสินค้าใส่ LOGO"),
    S("packaging_design", "ออกแบบแพคเกจจิ้ง"),
    S("confirm_design", "ลูกค้าคอนเฟิร์มแบบ"),
    S("confirm_packaging", "ลูกค้าคอนเฟิร์มแพคเกจจิ้ง"),
    S("produce", "สั่งผลิต"),
    S("receive", "รับสินค้า"),
    S("deliver_partial", "ส่งสินค้าบางส่วน", true),
    S("deliver_full", "ส่งสินค้าครบ"),
  ],
  new: [
    S("design_product", "ออกแบบภาพสินค้า"),
    S("send_sample", "ส่งตัวอย่าง (ถ้าลูกค้าต้องการ)", true),
    S("confirm_sample", "ลูกค้าคอนเฟิร์มตัวอย่าง", true),
    S("tag_position", "กำหนดตำแหน่งติด Tag / LOGO"),
    S("logo_method", "เลือกรูปแบบผลิต LOGO (สกรีน/ปัก/DFT/สติกเกอร์)"),
    S("mockup_logo", "ออกแบบภาพสินค้าใส่ LOGO"),
    S("packaging_design", "ออกแบบแพคเกจจิ้ง"),
    S("confirm_design", "ลูกค้าคอนเฟิร์มแบบ"),
    S("confirm_packaging", "ลูกค้าคอนเฟิร์มแพคเกจจิ้ง"),
    S("produce", "สั่งผลิต"),
    S("receive", "รับสินค้า"),
    S("deliver_partial", "ส่งสินค้าบางส่วน", true),
    S("deliver_full", "ส่งสินค้าครบ"),
  ],
};
/** รูปที่จะขึ้นใน Spec Sheet: คอนเฟิร์มแล้วล่าสุดของแต่ละประเภท (ฉบับภายในแสดงรูปรอคอนเฟิร์มได้) */
export function specImages(imgs: CorpImage[], item: string, includeDraft: boolean) {
  const mine = imgs.filter((i) => i.item_id === item && i.status !== "rejected");
  const out: CorpImage[] = [];
  for (const k of ["product", "mockup", "packaging", "sample"] as ImageKind[]) {
    const ap = mine.filter((i) => i.kind === k && i.status === "approved");
    if (ap.length) out.push(...ap);
    else if (includeDraft) { const d = mine.filter((i) => i.kind === k).slice(-1); out.push(...d); }
  }
  return out;
}
