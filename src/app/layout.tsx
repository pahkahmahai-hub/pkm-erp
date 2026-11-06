import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PKM ERP",
  description: "ระบบบริหารจัดการภายใน บริษัท ปากาม้า (ไทยแลนด์) จำกัด",
  icons: { icon: "/icon.png", apple: "/icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#452a79",
  width: "device-width",
  initialScale: 1,
};

const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS_URL} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
