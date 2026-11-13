import { NextResponse } from "next/server";
// สำรอง: ถ้า service worker ไม่ได้ดักการแชร์ ให้เปิดหน้าบันทึกด่วนไว้ (รูปแนบเองอีกครั้ง)
export async function POST(req: Request) { return NextResponse.redirect(new URL("/expenses/quick", req.url), 303); }
export async function GET(req: Request) { return NextResponse.redirect(new URL("/expenses/quick", req.url), 303); }
