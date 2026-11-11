import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header, type Crumb } from "@/components/ui";
import { myRooms, loadDirectory, fillEmployees } from "@/lib/work/queries";
import { createTask } from "../../actions";
import { NewTaskForm } from "./NewTaskForm";
import type { RoomMember } from "@/lib/work/types";

export const dynamic = "force-dynamic";
const WORK: Crumb[] = [{ href: "/work", label: "งาน · ห้องหลัก" }];

export default async function NewTask({ searchParams }: { searchParams: Promise<{ room?: string; error?: string; title?: string; from?: string; assignee?: string }> }) {
  const { room, error, title, from, assignee } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const rooms = await myRooms(supabase, session.employee?.id ?? null, session.isAdmin);
  const [{ data: membersRaw }, dir] = await Promise.all([
    supabase.from("work_room_members").select("*, employees(id, first_name, nickname, emp_code)").in("room_id", rooms.map((r) => r.id)),
    loadDirectory(supabase),
  ]);
  const members = fillEmployees(membersRaw as RoomMember[], dir, "employee_id");
  const allEmp = session.isAdmin ? dir : null;

  return (
    <div className="space-y-6">
      <Header crumbs={WORK} title="สั่งงาน" />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <form action={createTask} className="card p-6">
        <NewTaskForm rooms={rooms} members={members} allEmployees={allEmp ?? []} initialRoomKey={room} isAdmin={session.isAdmin} initialTitle={title} fromMessage={from} initialAssignee={assignee} />
      </form>
    </div>
  );
}
