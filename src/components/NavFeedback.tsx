"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Instant feedback while the server works:
 *  - thin animated bar at the top the moment an internal link is clicked or a form is submitted
 *  - the submit button that was pressed gets disabled + "กำลังบันทึก…" so it can't be double-clicked
 * Clears when the URL changes (navigation done) or after a safety timeout.
 */
export function NavFeedback() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restore = useRef<(() => void) | null>(null);

  useEffect(() => { // navigation finished
    setBusy(false);
    restore.current?.(); restore.current = null;
    if (timer.current) clearTimeout(timer.current);
  }, [pathname, search]);

  useEffect(() => {
    const start = () => {
      setBusy(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { setBusy(false); restore.current?.(); restore.current = null; }, 20000);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href === `${pathname}${search.toString() ? `?${search}` : ""}`) return;
      start();
    };
    const onSubmit = (e: SubmitEvent) => {
      if (e.defaultPrevented) return;
      start();
      const form = e.target as HTMLFormElement;
      const btn = (e.submitter as HTMLButtonElement | null) ?? form.querySelector<HTMLButtonElement>("button[type=submit],button:not([type])");
      if (btn && !btn.disabled) {
        const html = btn.innerHTML;
        // defer so the button's name/value still reach the server action
        setTimeout(() => { btn.disabled = true; btn.classList.add("opacity-60", "cursor-wait"); btn.innerHTML = `<span class="inline-flex items-center gap-2"><span class="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"></span>กำลังทำงาน…</span>`; }, 0);
        restore.current = () => { btn.disabled = false; btn.classList.remove("opacity-60", "cursor-wait"); btn.innerHTML = html; };
        // in-place server actions (tick a checklist, post a comment) don't change the URL:
        // watch for React re-rendering the form's area and restore the button then
        const area = form.parentElement ?? document.body;
        const mo = new MutationObserver(() => { mo.disconnect(); setTimeout(() => { setBusy(false); restore.current?.(); restore.current = null; if (timer.current) clearTimeout(timer.current); }, 150); });
        setTimeout(() => mo.observe(area, { childList: true, subtree: true, characterData: true, attributes: true }), 50);
        setTimeout(() => mo.disconnect(), 20000);
      }
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("submit", onSubmit, true); };
  }, [pathname, search]);

  return (
    <div aria-hidden className={`fixed left-0 top-0 z-[100] h-[3px] w-full pointer-events-none transition-opacity ${busy ? "opacity-100" : "opacity-0"}`}>
      <div className={`h-full bg-red ${busy ? "nav-progress" : ""}`} />
      {busy && <div className="fixed right-4 top-3 rounded-full bg-purple text-white text-[11px] px-3 py-1 shadow-lg inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />กำลังโหลด…</div>}
    </div>
  );
}
