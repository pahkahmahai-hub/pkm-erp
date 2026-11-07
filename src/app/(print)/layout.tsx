import type { Metadata } from "next";

export const metadata: Metadata = { title: "PKM ERP — เอกสาร" };

/** Bare root layout for printable documents (no app shell). */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Montserrat:wght@600;700&display=swap" />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
