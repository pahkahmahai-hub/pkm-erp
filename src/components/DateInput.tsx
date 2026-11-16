"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

/** วันที่แสดงเป็น วัน/เดือน/ปี (พ.ศ.) ทุกเครื่อง — ข้างในยังเป็น input type="date" (ค่า yyyy-mm-dd ส่งฟอร์มเหมือนเดิม) */
export function DateInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", value, defaultValue, onChange, onInput, type: _t, ...rest } = props;
  void _t;
  const ref = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(String(value ?? defaultValue ?? ""));
  useEffect(() => { if (value !== undefined) setV(String(value ?? "")); }, [value]);
  // ฟอร์มถูก reset → อ่านค่าใหม่
  useEffect(() => {
    const el = ref.current; const f = el?.form; if (!el || !f) return;
    const h = () => setTimeout(() => setV(el.value), 0);
    f.addEventListener("reset", h); return () => f.removeEventListener("reset", h);
  }, []);
  const textCls = className.split(/\s+/).filter((c) => /^!?text-(xs|sm|base|\[)/.test(c)).map((c) => c.replace(/^!/, "")).join(" ") || "text-sm";
  const widths = className.split(/\s+/).filter((c) => /^!?w-/.test(c)).join(" ");
  const show = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${Number(v.slice(0, 4)) + 543}` : "";
  return (
    <span className={`relative ${widths ? `inline-block ${widths}` : "block w-full"}`}>
      <input
        ref={ref}
        type="date"
        {...rest}
        {...(value !== undefined ? { value } : { defaultValue })}
        onChange={(e) => { setV(e.target.value); onChange?.(e); }}
        onInput={(e) => { setV((e.target as HTMLInputElement).value); onInput?.(e); }}
        onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* ignore */ } rest.onClick?.(e); }}
        className={`${className} ${widths ? "!w-full" : ""} date-dmy cursor-pointer`}
      />
      <span className={`pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 ${textCls} ${show ? "text-ink" : "text-ink-soft/60"}`}>{show || "วว/ดด/ปปปป"}</span>
    </span>
  );
}
