import { Users, Boxes, ShoppingCart, FileText, Factory, Wallet, BarChart3, Globe, type LucideIcon } from "lucide-react";

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
  { key: "hr", href: "/hr", name: "งานบุคคล", nameEn: "HR", description: "ทะเบียนพนักงาน · เช็คอิน GPS · ลา · OT · รายงาน", icon: Users, color: "bg-purple", status: "live" },
  { key: "stock", href: "/stock", name: "คลังใหญ่", nameEn: "Warehouse", description: "สินค้า · รับเข้า · ใบเบิก · ของเสีย · ลายผ้า/แพคเกจจิ้ง", icon: Boxes, color: "bg-teal", status: "live" },
  { key: "online-stock", href: "https://pahkahmah-stock.vercel.app/", name: "คลังออนไลน์", nameEn: "Online Stock", description: "สต็อกแยกแพลตฟอร์ม (เว็บเดิม)", icon: Globe, color: "bg-blue", status: "live", external: true },
  { key: "sales", href: "/sales", name: "ขายและออเดอร์", nameEn: "Sales", description: "ออเดอร์หน้าร้าน · ออนไลน์ · B2B · ใบเสนอราคา", icon: ShoppingCart, color: "bg-red", status: "soon" },
  { key: "purchase", href: "/purchase", name: "จัดซื้อ / ใบเบิกซื้อ", nameEn: "Purchasing", description: "ซัพพลายเออร์ · ใบเบิกซื้อระหว่างบริษัท", icon: FileText, color: "bg-blue", status: "soon" },
  { key: "production", href: "/production", name: "ผลิต", nameEn: "Production", description: "สั่งผลิต · วัตถุดิบ · ชุมชนผู้ผลิต", icon: Factory, color: "bg-green", status: "soon" },
  { key: "finance", href: "/finance", name: "การเงิน", nameEn: "Finance", description: "รอบจ่ายซัพพลายเออร์ · ค่าจ้าง PC", icon: Wallet, color: "bg-yellow", status: "soon" },
  { key: "reports", href: "/reports", name: "แดชบอร์ดเจ้าของ", nameEn: "Insights", description: "ยอดขาย · กำไร · สต็อก · เงินสด", icon: BarChart3, color: "bg-coral", status: "soon" },
];
