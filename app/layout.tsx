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
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
