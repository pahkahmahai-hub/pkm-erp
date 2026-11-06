# PKM ERP — บริษัท ปากาม้า (ไทยแลนด์) จำกัด

เว็บเดียว หลายโมดูล ฐานข้อมูลเดียว (Supabase) · โมดูลแรก: **Users (รากฐาน) + HR**

| โมดูล | สถานะ |
|---|---|
| Users / Roles / Teams (รากฐาน) | ✅ |
| HR — ทะเบียนพนักงาน | ✅ |
| HR — เช็คอิน/เอาท์ GPS (รัศมี 200 ม.) | ✅ |
| HR — ลา / ขาด / สาย | ✅ |
| HR — ขอ OT (อนุมัติย้อนหลังได้) | ✅ |
| HR — รายงานรายเดือน + Export Excel | ✅ |
| สต็อก / ขาย / จัดซื้อ / ใบเบิกซื้อระหว่างบริษัท | รอเติม |

เทคโนโลยี: Next.js 16 · Tailwind 4 · Supabase (Postgres + Auth) · Vercel

---

## ติดตั้งครั้งแรก (ทำครั้งเดียว ~20 นาที)

### 1) Supabase — สร้างฐานข้อมูล
1. เปิดโปรเจกต์ `pkm-erp` ใน Supabase → **SQL Editor** → New query
2. คัดลอกทั้งไฟล์ `supabase/migrations/0001_foundation_hr.sql` วางแล้วกด **Run**
   - จะได้ตารางทั้งหมด + สิทธิ์ (RLS) + ข้อมูลตั้งต้น: 2 ทีม, พนักงาน 6 คน, admin 2 บัญชี, พิกัดโชว์รูม, เวลางาน, โควต้าลา
3. **Project Settings → API** จด `Project URL` และ `anon public` key

### 2) Google Sign-in
1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/) → สร้าง project (หรือใช้ของเดิม) → **APIs & Services → Credentials → Create credentials → OAuth client ID** (Web application)
   - ถ้ายังไม่เคยตั้ง OAuth consent screen ให้ตั้งเป็น *External*, ใส่ชื่อแอป "PKM ERP" และอีเมลติดต่อ
   - **Authorized redirect URIs** ใส่: `https://<PROJECT-REF>.supabase.co/auth/v1/callback` (ดูค่าจริงได้ใน Supabase → Authentication → Providers → Google)
2. จด **Client ID** และ **Client Secret**
3. Supabase → **Authentication → Providers → Google** → เปิด Enable, วาง Client ID / Secret → Save
4. Supabase → **Authentication → URL Configuration**
   - Site URL: `https://pkm-erp.vercel.app` (หรือโดเมนจริงเมื่อมี)
   - Redirect URLs: เพิ่ม `https://pkm-erp.vercel.app/auth/callback` และ `http://localhost:3000/auth/callback`

### 3) Vercel — Deploy
1. [vercel.com](https://vercel.com) → **Add New → Project** → Import repo `pahkahmahai-hub/pkm-erp`
2. **Environment Variables** ใส่ 2 ค่า:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
3. Deploy → ได้ URL เช่น `https://pkm-erp.vercel.app`
4. กลับไปข้อ 2.4 ให้ Site URL / Redirect URL ตรงกับ URL ที่ได้

### 4) เข้าใช้งานครั้งแรก
- เปิดเว็บ → **เข้าสู่ระบบด้วย Google** ด้วย `pahkahmah@gmail.com` (admin)
- ไป **ตั้งค่า** ตรวจพิกัด/เวลางาน/โควต้า และเพิ่มวันหยุดบริษัท
- ไป **พนักงาน** ตรวจคนที่ติดธง "ต้องตรวจข้อมูล" (จันทกาญจน์, พีรพงษ์)
- พนักงานเปิดเว็บบนมือถือ → ล็อกอิน Gmail ของตัวเอง → **เช็คอิน** (เบราว์เซอร์จะขออนุญาต Location ครั้งแรก)

> แนะนำให้พนักงาน "Add to Home Screen" บน iPhone/Android จะได้เปิดเหมือนแอป

---

## รันในเครื่อง (สำหรับพัฒนา)
```bash
cp .env.example .env.local   # ใส่ค่า Supabase
npm install
npm run dev                  # http://localhost:3000
```

## โครงสร้างโค้ด
```
supabase/migrations/   SQL schema + RLS + seed (รันใน Supabase)
src/proxy.ts           ตรวจ session ทุก request, redirect ไป /login
src/lib/session.ts     โหลดผู้ใช้ + บทบาท (admin / staff)
src/lib/report.ts      คำนวณรายงานรายเดือน
src/components/        AppShell (เมนูโมดูล), BrandLogo, ui
src/app/(app)/hr/      checkin · attendance · leave · ot · employees · reports
src/app/(app)/settings เว็บตั้งค่า (admin)
public/brand/          โลโก้แบรนด์
```

## กฎธุรกิจที่ฝังอยู่ในระบบ (แก้ได้ที่หน้าตั้งค่า)
- รหัสพนักงาน `PKM-YYTTNN` — YY = พ.ศ. 2 หลักของปีที่เข้า, TT = ทีม (01 SW, 02 GC), NN = ลำดับ — ระบบออกให้อัตโนมัติ
- เวลางาน 08:30–17:30 · ผ่อนผันสาย 15 นาที · วันทำงาน จ–ศ (เสาร์-อาทิตย์ไม่นับขาด)
- เช็คอินได้ทุกที่ แต่ถ้าห่างโชว์รูมเกิน 200 ม. จะติดสถานะ "นอกพื้นที่" ให้ admin เห็น
- ลา: ป่วย 30 / กิจ 6 / พักร้อน 6 วันต่อปี · ลาครึ่งวันได้ · admin 2 คนอนุมัติได้ทั้งคู่
- OT: พนักงานยื่นล่วงหน้าหรือย้อนหลังได้ admin อนุมัติและปรับชั่วโมงได้
- ขาด = วันทำงานที่ผ่านมาแล้ว ซึ่งไม่มีเช็คอินและไม่มีใบลาที่อนุมัติ
- สิทธิ์: พนักงานเห็นเฉพาะข้อมูลตัวเอง + รายชื่อเพื่อนร่วมงานแบบย่อ · ไม่เก็บเลขบัตรประชาชน

## เพิ่มโมดูลถัดไป
1. เพิ่มตารางใน `supabase/migrations/0002_<module>.sql` พร้อม RLS (ใช้ `public.is_admin()` / `public.my_employee_id()`)
2. สร้างโฟลเดอร์ `src/app/(app)/<module>/`
3. เพิ่มเมนูใน `src/components/AppShell.tsx` (`MODULES`)
