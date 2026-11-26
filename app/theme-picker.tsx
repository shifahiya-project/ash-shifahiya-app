"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "sepia";
declare global {
  interface Window {
    ShifahiyaTheme?: { get(): Theme; set(value: Theme): void };
  }
}

const choices = [{ value: "light", label: "Светлая" }, { value: "dark", label: "Тёмная" },
  { value: "sepia", label: "Сепия" }] as const;
const snapshot = () => window.ShifahiyaTheme?.get() ?? "light";
const serverSnapshot = (): Theme => "light";
function subscribe(notify: () => void) {
  window.addEventListener("shifahiya-theme-change", notify);
  return () => window.removeEventListener("shifahiya-theme-change", notify);
}

export function ThemePicker() {
  const selected = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return (
    <fieldset className="theme-picker">
      <legend>Оформление</legend>
      <div>
        {choices.map(({ value, label }) => <button type="button" key={value} data-theme-choice={value}
          aria-pressed={selected === value} onClick={event => {
            window.ShifahiyaTheme?.set(value);
            event.currentTarget.closest("details")?.removeAttribute("open");
          }}>{label}</button>)}
      </div>
    </fieldset>
  );
}

export function ThemeMenu() {
  return <details className="theme-menu"><summary aria-label="Оформление"><span aria-hidden="true">◐</span><span className="theme-label">Оформление</span></summary><ThemePicker /></details>;
}
