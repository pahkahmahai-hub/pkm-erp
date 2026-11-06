import Image from "next/image";

/** Official brand logo from /public/brand (horizontal lock-up with ปา กา ม้า + THAILAND). */
export function BrandLogo({ variant = "color", className = "" }: { variant?: "color" | "white"; className?: string }) {
  return (
    <Image
      src={variant === "white" ? "/brand/logo-horizontal-white.png" : "/brand/logo-horizontal.png"}
      alt="PAHKAHMAH"
      width={1226}
      height={341}
      priority
      className={`h-9 w-auto ${className}`}
    />
  );
}

/** Typographic fallback (unused now that the official PNGs are in /public/brand) */
export function BrandWordmark({ variant = "color", className = "" }: { variant?: "color" | "white"; className?: string }) {
  const ink = variant === "white" ? "text-white" : "text-purple";
  const cross = variant === "white" ? "text-pink" : "text-red";
  return (
    <span className={`font-display font-bold tracking-[0.18em] text-lg leading-none ${ink} ${className}`} aria-label="PAHKAHMAH">
      PA<span className={cross}>H</span> KA<span className={cross}>H</span> MA<span className={cross}>H</span>
    </span>
  );
}

/** Small woven-cross mark used as an icon / favicon-like accent */
export function WovenMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect x="4" y="0" width="7" height="28" fill="#F7AFB3" />
      <rect x="17" y="0" width="7" height="28" fill="#E42213" />
      <rect x="0" y="4" width="28" height="7" fill="#C7B7E0" />
      <rect x="0" y="17" width="28" height="7" fill="#452A79" />
      <rect x="4" y="4" width="7" height="7" fill="#241E54" />
      <rect x="17" y="17" width="7" height="7" fill="#241E54" />
    </svg>
  );
}
