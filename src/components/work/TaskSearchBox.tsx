import { Search } from "lucide-react";

/** ช่องค้นหางาน (เลขงาน หรือ ชื่องาน) → /work/search */
export function TaskSearchBox({ defaultValue = "", className = "" }: { defaultValue?: string; className?: string }) {
  return (
    <form action="/work/search" className={`relative ${className}`}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none" />
      <input name="q" defaultValue={defaultValue} placeholder="ค้นหางาน: เลขงาน / ชื่องาน" className="input !pl-9 !py-2 w-full" />
    </form>
  );
}
