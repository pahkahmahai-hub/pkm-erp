/** ประเภทงานฝั่ง GC (0062) — ใช้แยกงานและนับจำนวน */
export const GC_ROOM_KEYS = ["gc-room", "graphic", "visual", "content"];
export const WORK_TYPES = ["ทำสีใหม่", "เติมลาย", "สินค้าใหม่", "เว็บไซต์", "คอนเทนต์", "วิดีโอ", "งาน Corporate", "งานเพิ่มเติม"] as const;
export const WORK_TYPE_UNIT: Record<string, string> = { "ทำสีใหม่": "SKU", "เติมลาย": "SKU", "สินค้าใหม่": "SKU", "เว็บไซต์": "หน้า", "คอนเทนต์": "ชิ้น", "วิดีโอ": "คลิป", "งาน Corporate": "ชิ้น", "งานเพิ่มเติม": "ชิ้น" };
export const unitOf = (t?: string | null) => (t ? WORK_TYPE_UNIT[t] ?? "ชิ้น" : "ชิ้น");
