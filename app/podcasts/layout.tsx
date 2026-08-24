import type { Metadata } from "next";

// The screen itself is a client component and cannot export metadata, so the
// route's own title lives here — otherwise the tab keeps the course's name.
export const metadata: Metadata = {
  title: "العربية كل يوم — подкаст в день",
  description: "Один арабский подкаст каждый день: серия, календарь и список выпусков из ваших каналов на YouTube.",
};

export default function PodcastsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
