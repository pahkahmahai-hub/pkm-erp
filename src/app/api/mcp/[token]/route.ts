import { NextResponse } from "next/server";
import { anonClient } from "@/lib/supabase/anon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ช่องเชื่อมต่อ Claude (MCP — Streamable HTTP, ตอบเป็น JSON) — อ่านอย่างเดียว
 * URL: /api/mcp/<token> · token ต้องตรงกับ app_secrets.claude_token (ตรวจในฐานข้อมูลทุกครั้ง)
 */

type Json = Record<string, unknown>;
interface Rpc { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Json }

const INSTRUCTIONS = `ระบบ PKM ERP ของบริษัท ปากาม้า (ไทยแลนด์) จำกัด — ข้อมูลงานภายใน (อ่านอย่างเดียว)
ทีม: GC = Graphic & Content (หัวหน้า อารดา), SW = Sale & Warehouse (หัวหน้า จันทกาญจน์); ผู้บริหาร 2 คน
ห้องงาน: teamwork, gc-room, sw-room และห้องย่อย (office, operation, online, graphic, visual, content) — ใช้ list_rooms ดู key\nออเดอร์ลูกค้า Corporate ใช้ corporate_orders
เวลาทั้งหมดเป็นเวลาไทย (Asia/Bangkok) · สถานะงาน: open=ใหม่, in_progress=กำลังทำ, done=รอตรวจรับ, returned=ตีกลับ, prep/shipped/arrived=ขั้นส่งห้าง (SW), accepted=เสร็จ, cancelled=ยกเลิก
ตอบผู้ใช้เป็นภาษาไทย`;

const TOOLS = [
  { name: "list_people", description: "รายชื่อพนักงานและผู้บริหาร พร้อมทีม ตำแหน่ง และห้องที่อยู่ (หัวหน้าห้องมีวงเล็บ)", inputSchema: { type: "object", properties: {} } },
  { name: "list_rooms", description: "รายการห้องงานทั้งหมด: key, ชื่อ, สมาชิก (★ = หัวหน้า), จำนวนงานค้าง, จำนวนข้อความ 7 วันล่าสุด", inputSchema: { type: "object", properties: {} } },
  {
    name: "read_room_chat",
    description: "อ่านแชทของห้อง เรียงตามเวลา — ใช้สรุปแชท ดูว่าใครคุยอะไร มีงานที่ยังไม่ได้สั่งหรือไม่. ค่าเริ่มต้น = 24 ชั่วโมงล่าสุด",
    inputSchema: { type: "object", properties: {
      room: { type: "string", description: "key ของห้อง เช่น gc-room, sw-room, teamwork หรือชื่อห้อง" },
      days: { type: "number", description: "ย้อนหลังกี่วัน (ใช้เมื่อไม่ได้ระบุ from)", default: 1 },
      from: { type: "string", description: "วันที่เริ่ม YYYY-MM-DD (เวลาไทย)" },
      to: { type: "string", description: "วันที่สิ้นสุด YYYY-MM-DD (รวมวันนั้น)" },
      limit: { type: "number", description: "จำนวนข้อความสูงสุด (ล่าสุดก่อน) ค่าเริ่มต้น 300" },
    }, required: ["room"] },
  },
  {
    name: "list_tasks",
    description: "ค้นงาน (งานสั่ง/งานประจำ/งานในปฏิทิน). ค่าเริ่มต้น = งานที่ยังไม่ปิด. ใช้ดูงานค้าง งานเลยกำหนด งานของแต่ละคน หรืองานในช่วงวันที่ (สำหรับวางแผน)",
    inputSchema: { type: "object", properties: {
      room: { type: "string", description: "key หรือชื่อห้อง (ไม่ระบุ = ทุกห้อง)" },
      status: { type: "string", description: "open (ยังไม่ปิด, ค่าเริ่มต้น) | all | in_progress | done | returned | prep | shipped | arrived | accepted | cancelled" },
      person: { type: "string", description: "ชื่อหรือชื่อเล่นผู้รับงาน" },
      overdue_only: { type: "boolean", description: "เฉพาะงานเลยกำหนด" },
      from: { type: "string", description: "วันเริ่ม/กำหนดเสร็จ ตั้งแต่ YYYY-MM-DD" },
      to: { type: "string", description: "ถึง YYYY-MM-DD" },
      limit: { type: "number" },
    } },
  },
  { name: "get_task", description: "รายละเอียดงานหนึ่งงาน: คำอธิบาย เช็คลิสต์ คอมเมนต์ทั้งหมด หมายเหตุส่งงาน/ตรวจรับ", inputSchema: { type: "object", properties: { task_no: { type: "number", description: "เลขงาน เช่น 154" } }, required: ["task_no"] } },
  {
    name: "company_calendar",
    description: "ปฏิทินบริษัท: ออกบูธห้าง นัดหมาย ลูกค้าเข้า showroom ประชุม 5ส วันหยุด. รายการที่มี repeat = weekly/monthly คือกิจกรรมซ้ำตั้งแต่ start (และวันเดียวกันของสัปดาห์/วันที่เดียวกันของเดือน) จนถึง repeat_until. ค่าเริ่มต้น = วันนี้ถึง 30 วันข้างหน้า",
    inputSchema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" } } },
  },
  {
    name: "store_deliveries",
    description: "ตารางส่งสินค้าห้าง (ทีม SW): ห้าง สัปดาห์ ขั้น 1–7 (1 สั่งจัด, 2 ส่งลิสต์, 3 ออกใบส่งของ, 4 จัดเสร็จ, 5 ส่งแล้ว, 6 สินค้าถึงแล้ว, 7 เข้าระบบห้างเรียบร้อย) เลขใบส่งของ ผู้รับผิดชอบ. ค่าเริ่มต้น = 2 สัปดาห์ก่อนถึง 4 สัปดาห์หน้า",
    inputSchema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" } } },
  },
  {
    name: "corporate_orders",
    description: "ออเดอร์ลูกค้า Corporate (ของขวัญองค์กร) ห้อง OPERATION: เลขออเดอร์ ลูกค้า รายการ มูลค่า (รวม VAT) กำหนดรับของซัพ กำหนดส่ง สถานะงาน (confirm=รอคอนเฟิร์ม, producing=สั่งผลิต, ready=ผลิตเสร็จรอส่ง, partial=ส่งบางส่วน, delivered=ส่งครบ, cancelled=ยกเลิก) สถานะเงิน (none=ยังไม่มัดจำ, deposit=มัดจำแล้ว, awaiting=ส่งแล้วรอชำระ, paid=จ่ายครบ) เอกสาร และการส่งแบ่งรอบ. ค่าเริ่มต้น = ออเดอร์ที่ยังไม่จบ (ยังไม่ส่งครบ หรือยังไม่ได้เงินครบ)",
    inputSchema: { type: "object", properties: { all: { type: "boolean", description: "true = รวมออเดอร์ที่จบแล้วด้วย" }, customer: { type: "string", description: "ค้นชื่อลูกค้า" }, limit: { type: "number" } } },
  },
  { name: "room_notes", description: "โน้ตของห้อง (ข้อมูลอ้างอิง ขั้นตอน เทมเพลต ที่ทีมบันทึกไว้)", inputSchema: { type: "object", properties: { room: { type: "string" } }, required: ["room"] } },
];

const todayBkk = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function callTool(token: string, name: string, a: Json): Promise<unknown> {
  const sb = anonClient();
  const run = async (fn: string, args: Json) => {
    const { data, error } = await sb.rpc(fn, { p_token: token, ...args });
    if (error) throw new Error(error.message);
    return data;
  };
  const today = todayBkk();
  switch (name) {
    case "list_people": return run("claude_people", {});
    case "list_rooms": return run("claude_rooms", {});
    case "read_room_chat": {
      const from = isDate(a.from) ? a.from : addDays(today, -Math.max(1, Math.min(num(a.days) ?? 1, 90)) + 1);
      const to = isDate(a.to) ? addDays(a.to, 1) : addDays(today, 1);
      // วันที่เป็นเวลาไทย → แปลงเป็น timestamptz +07:00
      return run("claude_room_chat", { p_room: str(a.room), p_from: `${from}T00:00:00+07:00`, p_to: `${to}T00:00:00+07:00`, p_limit: num(a.limit) ?? 300 });
    }
    case "list_tasks":
      return run("claude_tasks", { p_room: str(a.room), p_status: str(a.status), p_person: str(a.person), p_overdue: a.overdue_only === true, p_from: isDate(a.from) ? a.from : null, p_to: isDate(a.to) ? a.to : null, p_limit: num(a.limit) ?? 200 });
    case "get_task": {
      const n = num(a.task_no);
      if (!n) throw new Error("ต้องระบุ task_no");
      return run("claude_task", { p_task_no: Math.trunc(n) });
    }
    case "company_calendar": return run("claude_calendar", { p_from: isDate(a.from) ? a.from : today, p_to: isDate(a.to) ? a.to : addDays(today, 30) });
    case "store_deliveries": return run("claude_deliveries", { p_from: isDate(a.from) ? a.from : addDays(today, -14), p_to: isDate(a.to) ? a.to : addDays(today, 28) });
    case "corporate_orders": return run("claude_corp_orders", { p_open_only: a.all !== true, p_customer: str(a.customer), p_limit: num(a.limit) ?? 200 });
    case "room_notes": return run("claude_notes", { p_room: str(a.room) });
    default: throw new Error(`ไม่มีเครื่องมือ ${name}`);
  }
}

async function handle(token: string, msg: Rpc): Promise<Json | null> {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  if (msg.id === undefined || msg.method.startsWith("notifications/")) return null;   // notification — ไม่ต้องตอบ
  switch (msg.method) {
    case "initialize": {
      const { error } = await anonClient().rpc("claude_ok", { p_token: token });
      if (error) return fail(-32001, "unauthorized — token ไม่ถูกต้อง หรือยังไม่ได้รัน SQL 0026");
      const v = (msg.params?.protocolVersion as string) ?? "2025-06-18";
      return reply({ protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "pkm-erp", title: "PKM ERP (ปากาม้า)", version: "1.0.0" }, instructions: INSTRUCTIONS });
    }
    case "ping": return reply({});
    case "tools/list": return reply({ tools: TOOLS.map((t) => ({ ...t, annotations: { readOnlyHint: true, openWorldHint: false } })) });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      try {
        const data = await callTool(token, name, (msg.params?.arguments as Json) ?? {});
        return reply({ content: [{ type: "text", text: JSON.stringify(data, null, 1) }] });
      } catch (e) {
        return reply({ content: [{ type: "text", text: `ผิดพลาด: ${(e as Error).message}` }], isError: true });
      }
    }
    case "resources/list": return reply({ resources: [] });
    case "prompts/list": return reply({ prompts: [] });
    default: return fail(-32601, `method not found: ${msg.method}`);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, { status: 400 }); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(token, m as Rpc)))).filter(Boolean);
    return out.length ? NextResponse.json(out) : new NextResponse(null, { status: 202 });
  }
  const res = await handle(token, body as Rpc);
  return res ? NextResponse.json(res) : new NextResponse(null, { status: 202 });
}

export async function GET() {
  return new NextResponse("PKM ERP MCP endpoint — use POST (JSON-RPC)", { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 204 });
}
