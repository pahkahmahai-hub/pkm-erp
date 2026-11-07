import Link from "next/link";
import { WifiOff } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

export default async function NetworkPage({ searchParams }: { searchParams: Promise<{ ip?: string }> }) {
  const { ip } = await searchParams;
  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="card p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6"><BrandLogo className="h-12" /></div>
        <div className="mx-auto h-12 w-12 rounded-full bg-red/10 text-red grid place-items-center mb-4"><WifiOff size={22} /></div>
        <h1 className="font-display text-xl font-bold">ใช้งานได้เฉพาะ Wi-Fi ของบริษัท</h1>
        <p className="mt-3 text-sm text-ink-soft">
          ระบบ PKM ERP สำหรับพนักงานเปิดใช้ได้เมื่อเชื่อมต่อ Wi-Fi ของบริษัทเท่านั้น<br />
          กรุณาปิดเน็ตมือถือ เชื่อม Wi-Fi บริษัท แล้วกดลองใหม่
        </p>
        {ip && <p className="mt-3 text-[11px] text-ink-soft font-mono">เครือข่ายปัจจุบัน: {ip}</p>}
        <div className="flex gap-2 justify-center mt-6"><Link href="/" className="btn-primary">ลองใหม่</Link><Link href="/login" className="btn-ghost">ออกจากระบบ</Link></div>
      </div>
    </div>
  );
}
