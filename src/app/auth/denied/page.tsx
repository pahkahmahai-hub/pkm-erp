import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

export default async function DeniedPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="card p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6"><BrandLogo className="h-12" /></div>
        <h1 className="font-display text-xl font-bold">บัญชีนี้ยังไม่มีสิทธิ์เข้าระบบ</h1>
        <p className="mt-3 text-sm text-ink-soft">
          {email ? <>อีเมล <b className="text-ink">{email}</b> ยังไม่ได้ถูกเพิ่มในระบบ</> : "อีเมลนี้ยังไม่ได้ถูกเพิ่มในระบบ"}
          <br />กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มบัญชี แล้วลองเข้าใหม่อีกครั้ง
        </p>
        <Link href="/login" className="btn-outline mt-6">กลับไปหน้าเข้าสู่ระบบ</Link>
      </div>
    </div>
  );
}
