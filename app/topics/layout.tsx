import type { Metadata } from "next";

// The screen itself is a client component and cannot export metadata, so the
// route's own title lives here — otherwise the tab keeps the course's name.
export const metadata: Metadata = {
  title: "Темы наизусть — разбор и повторение по книге",
  description:
    "Отдельная часть рядом с курсом: тема из вашей книги разбирается по занятиям, проверяется припоминанием и возвращается по расписанию, пока не останется в памяти.",
};

export default function TopicsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
