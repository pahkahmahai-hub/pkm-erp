import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/ui";
import { myRooms } from "@/lib/work/queries";
import { createTask } from "../../actions";
import { NewTaskForm } from "./NewTaskForm";
import type { RoomMember } from "@/lib/work/types";

export const dynamic = "force-dynamic";

export default async function NewTask({ searchParams }: { searchParams: Promise<{ room?: string; error?: string; title?: string; from?: string }> }) {
  const { room, error, title, from } = await searchParams;
  const session = await getSession();
  const supabase = await createClient();
  const rooms = await myRooms(supabase, session.employee?.id ?? null, session.isAdmin);
  const { data: members } = await supabase.from("work_room_members").select("*, employees(id, first_name, nickname, emp_code)").in("room_id", rooms.map((r) => r.id));
  const { data: allEmp } = session.isAdmin ? await supabase.from("employees").select("id, first_name, nickname, emp_code").neq("status", "resigned").order("emp_code") : { data: null };

  return (
    <div className="space-y-6">
      <Header title="สั่งงาน" />
      {error && <div className="rounded-xl bg-red/10 text-red text-sm px-4 py-3">{error}</div>}
      <form action={createTask} className="card p-6">
        <NewTaskForm rooms={rooms} members={(members ?? []) as RoomMember[]} allEmployees={allEmp ?? []} initialRoomKey={room} isAdmin={session.isAdmin} initialTitle={title} fromMessage={from} />
      </form>
    </div>
  );
}
