import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Аш-Шифахия — арабский шаг за шагом",
  description: "Интерактивный курс арабского языка на основе книги «Аш-Шифахия».",
  // Without this the browser asks for /favicon.ico on every visit and gets a 404.
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* The same palette is used by the standalone and downloadable player. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/themes.css?v=1" />
        {/* Apply the saved palette before the body paints, also in the static export. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme.js?v=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
