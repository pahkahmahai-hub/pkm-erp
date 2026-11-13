"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, Suspense } from "react";
import { NavFeedback } from "@/components/NavFeedback";
import { RegisterSW } from "@/components/RegisterSW";
import {
  LayoutDashboard, MapPin, CalendarDays, Clock, Users, FileBarChart2, Settings, LogOut, Menu, X, BadgeCheck, LayoutGrid,
  Boxes, PackagePlus, PackageMinus, AlertTriangle, Scissors, BookUser, ExternalLink, History, ClockAlert, ListChecks, Bell, Repeat, Plus,
  ShoppingCart, FileText, Receipt, Wallet, Globe, Building2, Upload, Banknote, Factory, Layers, Truck, CalendarRange, Store,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import type { SessionInfo } from "@/lib/types";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ size?: number }>; admin?: boolean; external?: boolean };
type NavGroup = { title: string; items: NavItem[] };

/** Sidebar per module — keyed by the first URL segment */
const NAV: Record<string, NavGroup[]> = {
  hr: [
    {
      title: "HR — งานบุคคล",
      items: [
        { href: "/hr", label: "แดชบอร์ด HR", icon: LayoutDashboard },
        { href: "/hr/checkin", label: "เช็คอิน / เช็คเอาท์", icon: MapPin },
        { href: "/hr/attendance", label: "บันทึกเวลา", icon: Clock },
        { href: "/hr/time-requests", label: "ขอแก้เวลาเข้า-ออก", icon: ClockAlert },
        { href: "/hr/leave", label: "ลางาน", icon: CalendarDays },
        { href: "/hr/ot", label: "ขอ OT", icon: BadgeCheck },
        { href: "/hr/employees", label: "พนักงาน", icon: Users },
        { href: "/hr/reports", label: "รายงาน", icon: FileBarChart2, admin: true },
      ],
    },
  ],
  stock: [
    {
      title: "คลังใหญ่",
      items: [
        { href: "/stock", label: "แดชบอร์ดคลัง", icon: LayoutDashboard },
        { href: "/stock/products", label: "สินค้า", icon: Boxes },
        { href: "/stock/receipts", label: "รับเข้า", icon: PackagePlus },
        { href: "/stock/issues", label: "ใบเบิก", icon: PackageMinus },
        { href: "/stock/consign", label: "คลังฝากขาย", icon: Store },
        { href: "/stock/defects", label: "ของเสีย / ส่งคืน", icon: AlertTriangle },
        { href: "/stock/materials", label: "ลายผ้า & แพคเกจจิ้ง", icon: Scissors },
        { href: "/stock/movements", label: "ประวัติเคลื่อนไหว", icon: History },
        { href: "/stock/contacts", label: "สมุดรายชื่อ", icon: BookUser },
      ],
    },
    {
      title: "คลังออนไลน์",
      items: [{ href: "https://pahkahmah-stock.vercel.app/", label: "เปิดเว็บคลังออนไลน์", icon: ExternalLink, external: true }],
    },
  ],
};
NAV.work = [
  {
    title: "งาน",
    items: [
      { href: "/work", label: "ภาพรวมงาน", icon: ListChecks },
      { href: "/work/tasks/new", label: "สั่งงาน", icon: Plus },
      { href: "/work/notifications", label: "แจ้งเตือน", icon: Bell },
      { href: "/work/routines", label: "งานประจำ", icon: Repeat },
      { href: "/work/deliveries", label: "ตารางส่งห้าง", icon: Truck },
      { href: "/work/company-calendar", label: "ปฏิทินบริษัท", icon: CalendarRange },
    ],
  },
];
NAV.sales = [
  {
    title: "ขาย",
    items: [
      { href: "/sales", label: "แดชบอร์ดขาย", icon: ShoppingCart },
      { href: "/sales/docs?type=quotation", label: "ใบเสนอราคา", icon: FileText },
      { href: "/sales/docs?type=invoice", label: "ใบส่งของ/ใบกำกับ", icon: FileText },
      { href: "/sales/docs?type=billing", label: "ใบวางบิล", icon: FileText },
      { href: "/sales/docs?type=receipt", label: "ใบเสร็จรับเงิน", icon: Receipt },
      { href: "/sales/store-reports", label: "นำเข้ารายงานห้าง", icon: Upload },
      { href: "/sales/receivables", label: "ลูกหนี้ / รอรับชำระ", icon: Wallet },
      { href: "/sales/online", label: "ยอดขายออนไลน์ (รายสินค้า)", icon: Globe },
      { href: "/sales/month-close", label: "ปิดเดือน → ใบเบิกซื้อ TKS", icon: Repeat },
      { href: "/sales/docs?type=purchase_req", label: "ใบเบิกซื้อสินค้า (TKS)", icon: FileText },
      { href: "/sales/companies", label: "ข้อมูลบริษัท", icon: Building2, admin: true },
    ],
  },
];
NAV.expenses = [
  {
    title: "ค่าใช้จ่าย",
    items: [
      { href: "/expenses", label: "รายการบิล", icon: Wallet },
      { href: "/expenses/new", label: "บันทึกบิลใหม่", icon: Plus },
      { href: "/expenses/payables", label: "เตรียมจ่าย (รอบ 1 / 15)", icon: Banknote, admin: true },
      { href: "/expenses/wht", label: "หัก ณ ที่จ่าย 50 ทวิ", icon: FileText },
      { href: "/expenses/categories", label: "หมวดค่าใช้จ่าย", icon: Settings, admin: true },
    ],
  },
];
NAV.purchase = [
  {
    title: "จัดซื้อ",
    items: [
      { href: "/purchase", label: "ภาพรวม", icon: LayoutGrid },
      { href: "/purchase/requests", label: "ใบขอซื้อภายใน (PR)", icon: FileText },
      { href: "/purchase/requests/new", label: "เปิดใบขอซื้อ", icon: Plus },
      { href: "/purchase/orders", label: "ใบสั่งซื้อ (PO)", icon: ShoppingCart },
      { href: "/purchase/orders/new", label: "เปิด PO ตรง", icon: Plus, admin: true },
    ],
  },
];
NAV.production = [
  {
    title: "การผลิต",
    items: [
      { href: "/production", label: "ใบสั่งผลิต", icon: Factory },
      { href: "/production/orders/new", label: "เปิดใบสั่งผลิต", icon: Plus },
      { href: "/production/bom", label: "สูตรการผลิต (BOM)", icon: Layers },
      { href: "/stock/materials?kind=fabric", label: "คลังผ้า / แพคเกจจิ้ง / อุปกรณ์ / Display", icon: Boxes },
    ],
  },
];
const SYSTEM_NAV: NavGroup = { title: "ระบบ", items: [{ href: "/settings", label: "ตั้งค่า", icon: Settings, admin: true }] };

export function AppShell({ session, children }: { session: SessionInfo; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const seg = pathname.split("/")[1] ?? "";
  const groups = [...(NAV[seg] ?? []), SYSTEM_NAV];

  const nav = (
    <nav className="flex flex-col gap-6">
      <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-lavender hover:bg-white/10 hover:text-white border border-white/15">
        <LayoutGrid size={18} /> โปรแกรมทั้งหมด
      </Link>
      {groups.map((m) => {
        const items = m.items.filter((i) => !i.admin || session.isAdmin);
        if (!items.length) return null;
        return (
          <div key={m.title}>
            <div className="px-3 mb-2 text-[11px] font-semibold tracking-[0.14em] text-lavender uppercase">{m.title}</div>
            <ul className="space-y-0.5">
              {items.map((i) => {
                const hrefPath = i.href.split("?")[0];
                const isRoot = hrefPath === `/${seg}` || i.href === "/work/tasks/new";
                const active = !i.external && (i.href.includes("?") ? false : isRoot ? pathname === hrefPath : pathname.startsWith(hrefPath));
                const Icon = i.icon;
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      target={i.external ? "_blank" : undefined}
                      rel={i.external ? "noopener" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        active ? "bg-white/15 text-white" : "text-lavender hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <Icon size={18} />
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const userBox = (
    <div className="mt-auto pt-4 border-t border-white/10">
      <div className="flex items-center gap-3 px-2">
        {session.authUser.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={session.authUser.avatar} alt="" className="h-9 w-9 rounded-full ring-2 ring-pink/60" referrerPolicy="no-referrer" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-pink text-purple font-bold grid place-items-center">
            {(session.employee?.first_name ?? session.authUser.email)[0]}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">
            {session.employee ? `${session.employee.first_name}${session.employee.nickname ? ` (${session.employee.nickname})` : ""}` : session.appUser.display_name ?? session.authUser.email}
          </div>
          <div className="text-[11px] text-lavender truncate">
            {session.isAdmin ? "ผู้ดูแลระบบ" : session.employee?.emp_code ?? "พนักงาน"}
          </div>
        </div>
      </div>
      <form action="/auth/signout" method="post" className="mt-3 px-2">
        <button className="w-full flex items-center gap-2 text-xs text-lavender hover:text-white">
          <LogOut size={14} /> ออกจากระบบ
        </button>
      </form>
    </div>
  );

  const isHome = pathname === "/";

  if (isHome) {
    return (
      <div className="min-h-dvh flex flex-col">
        <div className="pkm-stripe h-1.5" />
        <header className="flex items-center justify-between px-4 sm:px-8 py-4 bg-white border-b border-line">
          <BrandLogo className="h-10" />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-ink-soft">{session.appUser.display_name ?? session.employee?.first_name ?? session.authUser.email}</span>
            {session.isAdmin && <Link href="/settings" className="btn-ghost py-1.5 px-3"><Settings size={16} /> ตั้งค่า</Link>}
            <form action="/auth/signout" method="post"><button className="btn-outline py-1.5 px-3"><LogOut size={14} /> ออก</button></form>
          </div>
        </header>
        <Suspense fallback={null}><NavFeedback /></Suspense><RegisterSW />
        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">{children}</main>
        <footer className="px-6 py-4 text-[11px] text-ink-soft">PKM ERP · บริษัท ปากาม้า (ไทยแลนด์) จำกัด · Local · Sustainable · Meaningful</footer>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex">
      {/* sidebar – desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-purple text-white p-4">
        <div className="px-2 py-3 mb-4">
          <BrandLogo variant="white" className="h-11" />
        </div>
        {nav}
        {userBox}
      </aside>

      {/* sidebar – mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-purple text-white p-4 flex flex-col">
            <div className="flex items-center justify-between px-2 py-3 mb-4">
              <BrandLogo variant="white" className="h-10" />
              <button onClick={() => setOpen(false)} aria-label="ปิดเมนู"><X size={20} /></button>
            </div>
            {nav}
            {userBox}
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="pkm-stripe h-1.5" />
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-line">
          <button onClick={() => setOpen(true)} aria-label="เปิดเมนู" className="text-purple"><Menu size={22} /></button>
          <BrandLogo />
        </header>
        <Suspense fallback={null}><NavFeedback /></Suspense><RegisterSW />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">{children}</main>
        <footer className="px-6 py-4 text-[11px] text-ink-soft">
          PKM ERP · บริษัท ปากาม้า (ไทยแลนด์) จำกัด · Local · Sustainable · Meaningful
        </footer>
      </div>
    </div>
  );
}
