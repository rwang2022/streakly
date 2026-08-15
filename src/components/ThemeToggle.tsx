"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  localStorage.setItem("streakly-theme", dark ? "dark" : "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#000000" : "#f5f5f7");
}

export function ThemeToggle() {
  // Starts null so the server-rendered markup and first client render match
  // (avoids a hydration mismatch); the real value is read from the DOM
  // immediately after mount, where the anti-flash script already set it.
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    // Reading DOM state set by the anti-flash script in <head> before
    // hydration — this is the standard pattern for syncing React state from
    // an external source on mount (same approach libraries like next-themes
    // use), not a derived-state antipattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  if (isDark === null) {
    return <div className="h-[52px] w-full rounded-2xl bg-surface-2" />;
  }

  return (
    <button
      type="button"
      onClick={() => {
        const next = !isDark;
        setIsDark(next);
        applyTheme(next);
      }}
      className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3.5"
    >
      <span className="flex items-center gap-2.5 text-sm font-medium">
        {isDark ? (
          <Moon size={17} className="text-accent-2" />
        ) : (
          <Sun size={17} className="text-accent-2" />
        )}
        Dark mode
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          isDark ? "bg-accent" : "bg-surface-2"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
            isDark ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
