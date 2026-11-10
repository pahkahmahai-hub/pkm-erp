import { Users, Boxes, ShoppingCart, FileText, Factory, Wallet, BarChart3, Globe, ListChecks, type LucideIcon } from "lucide-react";

export interface ModuleDef {
  key: string;
  href: string;
  name: string;
  nameEn: string;
  description: string;
  icon: LucideIcon;
  color: string;      // tailwind bg class for the icon tile
  status: "live" | "soon";
  external?: boolean; // opens another site in a new tab
}

/** Registry of ERP modules — add a new module here and it appears on the home page. */
export const MODULES: ModuleDef[] = [
  { key: "work", href: "/work", name: "งาน", nameEn: "Work", description: "สั่งงาน · ติดตามงาน · คอมเมนต์+รูป · งานประจำ · ห้องงาน 7 ห้อง", icon: ListChecks, color: "bg-red", status: "live" },
  { key: "hr", href: "/hr", name: "งานบุคคล", nameEn: "HR", description: "ทะเบียนพนักงาน · เช็คอิน GPS · ลา · OT · รายงาน", icon: Users, color: "bg-purple", status: "live" },
  { key: "stock", href: "/stock", name: "คลังใหญ่", nameEn: "Warehouse", description: "สินค้า · รับเข้า · ใบเบิก · ของเสีย · ลายผ้า/แพคเกจจิ้ง", icon: Boxes, color: "bg-teal", status: "live" },
  { key: "online-stock", href: "https://pahkahmah-stock.vercel.app/", name: "คลังออนไลน์", nameEn: "Online Stock", description: "สต็อกแยกแพลตฟอร์ม (เว็บเดิม)", icon: Globe, color: "bg-blue", status: "live", external: true },
  { key: "sales", href: "/sales", name: "ขาย", nameEn: "Sales", description: "ใบเสนอราคา · ใบส่งของ/ใบกำกับ · ใบวางบิล · ใบเสร็จ · ลูกหนี้ · ยอดขายออนไลน์ 7 ช่องทาง", icon: ShoppingCart, color: "bg-green", status: "live" },
  { key: "purchase", href: "/purchase", name: "จัดซื้อ", nameEn: "Purchasing", description: "ใบขอซื้อภายใน (PR) → อนุมัติ → ใบสั่งซื้อ (PO) → รับของเข้าคลัง → บิลค่าใช้จ่าย", icon: FileText, color: "bg-blue", status: "live" },
  { key: "production", href: "/production", name: "การผลิต", nameEn: "Production", description: "BOM · ใบสั่งผลิต · เบิกผ้า/อุปกรณ์ตัดสต็อก · รับสินค้าเข้าคลัง · ค่าจ้าง/ต้นทุน", icon: Factory, color: "bg-green", status: "live" },
  { key: "expenses", href: "/expenses", name: "ค่าใช้จ่าย / เจ้าหนี้", nameEn: "Expenses", description: "ถ่ายบิล → AI อ่าน · อนุมัติ · รอบจ่าย 1/15 · หัก ณ ที่จ่าย 50 ทวิ · VAT ซื้อ", icon: Wallet, color: "bg-yellow", status: "live" },
  { key: "reports", href: "/reports", name: "แดชบอร์ดเจ้าของ", nameEn: "Insights", description: "ยอดขาย · กำไร · สต็อก · เงินสด", icon: BarChart3, color: "bg-coral", status: "soon" },
];
