import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSession } from "@/lib/session";
import { MODULES } from "@/lib/modules";
import { canAccessModule } from "@/lib/access";
import { fmtDate, todayBkk } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ModuleHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const session = await getSession();
  const name = session.employee?.nickname ?? session.employee?.first_name ?? session.appUser.display_name ?? "";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">สวัสดี {name}</h1>
        <p className="text-sm text-ink-soft mt-1">{fmtDate(todayBkk(), { weekday: "long" })} · เลือกโปรแกรมที่ต้องการใช้งาน</p>
      </div>

      {denied && <div className="rounded-xl bg-yellow/15 text-[#8a6a00] text-sm px-4 py-3">บัญชีของคุณยังไม่มีสิทธิ์ใช้โปรแกรมนี้ — ติดต่อผู้ดูแลระบบ</div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const allowed = canAccessModule(session, m.key);
          const live = m.status === "live" && allowed;
          const inner = (
            <div className={`card p-5 h-full flex flex-col gap-4 transition ${live ? "hover:border-purple hover:shadow-md" : "opacity-60"}`}>
              <div className="flex items-start justify-between">
                <div className={`h-12 w-12 rounded-2xl ${m.color} text-white grid place-items-center`}><Icon size={22} /></div>
                {live ? <span className="badge-ok">ใช้งานได้</span> : !allowed && m.status === "live" ? <span className="badge-rejected">ไม่มีสิทธิ์</span> : <span className="badge-off">เร็วๆ นี้</span>}
              </div>
              <div>
                <div className="font-display font-bold text-lg">{m.name} <span className="text-xs font-semibold tracking-widest text-ink-soft ml-1">{m.nameEn.toUpperCase()}</span></div>
                <p className="text-sm text-ink-soft mt-1">{m.description}</p>
              </div>
              {live && <div className="mt-auto flex items-center gap-1 text-sm font-semibold text-purple">{m.external ? "เปิดเว็บ (แท็บใหม่)" : "เปิดโปรแกรม"} <ArrowRight size={16} /></div>}
            </div>
          );
          if (!live) return <div key={m.key}>{inner}</div>;
          if (m.external) return <a key={m.key} href={m.href} target="_blank" rel="noopener">{inner}</a>;
          return <Link key={m.key} href={m.href}>{inner}</Link>;
        })}
      </div>

      <p className="text-xs text-ink-soft">โมดูลทั้งหมดใช้ฐานข้อมูลและบัญชีผู้ใช้ชุดเดียวกัน — เพิ่มโมดูลใหม่ได้โดยไม่ต้องสมัครใหม่</p>
    </div>
  );
}
