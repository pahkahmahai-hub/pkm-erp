import Image from "next/image";
import { BrandLogo } from "@/components/BrandLogo";
import { GoogleButton } from "./GoogleButton";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-purple text-white p-12 relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-96 h-96 pkm-plaid opacity-30 rotate-12 rounded-3xl" />
        <div className="relative">
          <Image src="/brand/logo-vertical-white.png" alt="PAHKAHMAH" width={762} height={1187} priority className="h-56 w-auto" />
        </div>
        <div className="relative">
          <h1 className="font-display text-4xl font-bold leading-tight">PKM ERP</h1>
          <p className="mt-3 text-lavender max-w-md">
            ระบบงานภายในของปากาม้า — เริ่มจากงานบุคคล และจะค่อยๆ เติมโมดูลอื่นเข้ามาบนฐานข้อมูลเดียวกัน
          </p>
        </div>
        <div className="text-xs tracking-[0.2em] text-pink relative">LOCAL · SUSTAINABLE · MEANINGFUL</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><BrandLogo className="h-12" /></div>
          <h2 className="font-display text-2xl font-bold">เข้าสู่ระบบ</h2>
          <p className="mt-2 text-sm text-ink-soft">ใช้บัญชี Gmail ของพนักงานที่บริษัทออกให้</p>

          {error && (
            <div className="mt-4 rounded-xl bg-red/10 text-red text-sm px-4 py-3">{decodeURIComponent(error)}</div>
          )}

          <div className="mt-8">
            <GoogleButton next={next ?? "/"} />
          </div>

          <p className="mt-6 text-xs text-ink-soft">
            หากเข้าไม่ได้ แปลว่าอีเมลนี้ยังไม่ได้ถูกเพิ่มในระบบ กรุณาติดต่อผู้ดูแล
          </p>
        </div>
      </div>
    </div>
  );
}
