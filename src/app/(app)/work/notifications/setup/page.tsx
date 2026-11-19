import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { PushCheck } from "@/components/work/PushCheck";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
const CRUMBS: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }, { href: "/work/notifications", label: "แจ้งเตือน" }];

interface Row { user_id: string; name: string; is_admin: boolean; devices: number; agents: string[]; last_ok_at: string | null; last_added_at: string | null }
const devName = (ua: string | null) => !ua ? "?" : /iphone|ipad/i.test(ua) ? "iPhone" : /android/i.test(ua) ? "Android" : /macintosh/i.test(ua) ? "Mac" : /windows/i.test(ua) ? "Windows" : "อื่นๆ";

export default async function PushSetupPage() {
  const session = await getSession();
  const supabase = await createClient();
  const team = session.isAdmin ? await supabase.rpc("push_team_status") : null;
  const rows = (team?.data ?? []) as Row[];
  const off = rows.filter((r) => !r.devices);
  return (
    <div className="space-y-6 max-w-3xl">
      <Header crumbs={CRUMBS} title="เช็คการแจ้งเตือนเด้ง" />
      <PushCheck />
      {session.isAdmin && (
        <div className="card p-5 space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display font-bold">ทีม: ใครเปิดแจ้งเตือนแล้วบ้าง</h2>
            {team?.error ? <span className="text-xs text-red">{team.error.message.includes("push_team_status") ? "ยังไม่ได้รัน SQL 0069" : team.error.message}</span>
              : <span className="text-xs text-ink-soft">ยังไม่เปิด {off.length} คน จาก {rows.length}</span>}
          </div>
          <table className="tbl text-sm">
            <thead><tr><th>ชื่อ</th><th>เครื่องที่เปิดไว้</th><th>เด้งสำเร็จล่าสุด</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className={r.devices ? "" : "bg-red/5"}>
                  <td className="font-semibold">{r.name}{r.is_admin && <span className="text-[11px] text-ink-soft"> · ผู้บริหาร</span>}</td>
                  <td>{r.devices ? <span className="text-green">✓ {r.devices} เครื่อง <span className="text-ink-soft">({[...new Set(r.agents.map(devName))].join(", ")})</span></span> : <span className="text-red font-semibold">✗ ยังไม่เปิด</span>}</td>
                  <td className="text-ink-soft">{r.last_ok_at ? fmtDateTime(r.last_ok_at) : r.devices ? "ยังไม่เคยมีแจ้งเตือน" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-soft">คนที่ยังไม่เปิด: บอกให้เข้าเมนู แจ้งเตือน → “เช็คการแจ้งเตือนเด้ง” แล้วทำตามขั้นที่ขึ้น ✗ · iPhone ต้อง “เพิ่มไปยังหน้าจอโฮม” ก่อนเสมอ</p>
        </div>
      )}
    </div>
  );
}
