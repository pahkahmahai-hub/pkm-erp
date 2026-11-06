"use client";

import { useEffect, useState } from "react";
import { MapPin, LogIn, LogOut, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtTime } from "@/lib/format";
import type { Attendance } from "@/lib/types";

type Office = { name: string; lat: number; lng: number; radius_m: number };

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function CheckinPanel({ initial, office, hours, graceMin }: { initial: Attendance | null; office: Office; hours: { start: string; end: string }; graceMin: number }) {
  const [att, setAtt] = useState<Attendance | null>(initial);
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const t = setInterval(() => setClock(fmtTime(new Date())), 1000);
    return () => clearInterval(t);
  }, []);

  function locate() {
    setGeoErr(null);
    if (!navigator.geolocation) return setGeoErr("อุปกรณ์นี้ไม่รองรับ GPS");
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => setGeoErr(e.code === 1 ? "กรุณาอนุญาตให้เว็บเข้าถึงตำแหน่ง (Location) ในเบราว์เซอร์" : "หาตำแหน่งไม่ได้ ลองใหม่อีกครั้ง"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  useEffect(locate, []);

  const dist = pos ? distanceM(pos.lat, pos.lng, office.lat, office.lng) : null;
  const inRange = dist !== null && dist <= office.radius_m;

  async function doCheck(kind: "in" | "out") {
    if (!pos) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("do_check", { p_kind: kind, p_lat: pos.lat, p_lng: pos.lng, p_note: note || null });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    const row = data as Attendance;
    setAtt(row);
    setNote("");
    if (kind === "in") {
      setMsg({ ok: true, text: row.is_late ? `เช็คอินแล้ว — สาย ${row.late_minutes} นาที` : "เช็คอินแล้ว ตรงเวลา" });
    } else {
      setMsg({ ok: true, text: "เช็คเอาท์แล้ว ขอบคุณสำหรับวันนี้" });
    }
  }

  const canIn = !att?.check_in_at;
  const canOut = !!att?.check_in_at && !att?.check_out_at;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="card p-6 space-y-6">
        <div className="text-center">
          <div className="font-display text-5xl font-bold tabular-nums">{clock || "--:--"}</div>
          <div className="text-xs text-ink-soft mt-1">เวลางาน {hours.start}–{hours.end} · ผ่อนผัน {graceMin} นาที</div>
        </div>

        <div className="rounded-xl bg-cream p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold"><MapPin size={16} className="text-purple" /> {office.name}</div>
          {geoErr ? (
            <div className="mt-2 text-red">{geoErr}</div>
          ) : !pos ? (
            <div className="mt-2 text-ink-soft">กำลังหาตำแหน่ง…</div>
          ) : (
            <div className="mt-2">
              ระยะห่าง <b>{Math.round(dist!)} ม.</b> (ความแม่นยำ ±{Math.round(pos.acc)} ม.){" "}
              {inRange ? <span className="badge-ok ml-1">อยู่ในพื้นที่</span> : <span className="badge-rejected ml-1">นอกพื้นที่ {office.radius_m} ม.</span>}
            </div>
          )}
          <button onClick={locate} className="mt-2 inline-flex items-center gap-1 text-xs text-purple font-semibold"><RefreshCw size={12} /> หาตำแหน่งใหม่</button>
        </div>

        <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="หมายเหตุ (ถ้ามี) เช่น ออกไปพบลูกค้า" />

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => doCheck("in")} disabled={!pos || busy || !canIn} className="btn-primary py-4 text-base">
            <LogIn size={18} /> เช็คอิน
          </button>
          <button onClick={() => doCheck("out")} disabled={!pos || busy || !canOut} className="btn-outline py-4 text-base">
            <LogOut size={18} /> เช็คเอาท์
          </button>
        </div>
        {pos && !inRange && (canIn || canOut) && (
          <p className="text-xs text-ink-soft text-center">คุณอยู่นอกรัศมี — ระบบจะบันทึกให้แต่ติดสถานะ "นอกพื้นที่" ให้ผู้ดูแลตรวจ</p>
        )}
        {msg && <div className={`rounded-xl px-4 py-3 text-sm ${msg.ok ? "bg-green/10 text-green" : "bg-red/10 text-red"}`}>{msg.text}</div>}
      </div>

      <div className="card p-5 text-sm space-y-3 h-fit">
        <h2 className="font-display font-bold">วันนี้</h2>
        <Row label="เช็คอิน" value={fmtTime(att?.check_in_at)} extra={att?.is_late ? <span className="badge-late">สาย {att.late_minutes} น.</span> : att?.check_in_at ? <span className="badge-ok">ตรงเวลา</span> : null} />
        <Row label="เช็คเอาท์" value={fmtTime(att?.check_out_at)} />
        {att?.check_in_distance_m != null && <Row label="ระยะตอนเข้า" value={`${att.check_in_distance_m} ม.`} extra={att.check_in_in_range === false ? <span className="badge-rejected">นอกพื้นที่</span> : null} />}
        {att?.note && <Row label="หมายเหตุ" value={att.note} />}
      </div>
    </div>
  );
}

function Row({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2 last:border-0">
      <span className="text-ink-soft">{label}</span>
      <span className="font-semibold flex items-center gap-2">{value}{extra}</span>
    </div>
  );
}
