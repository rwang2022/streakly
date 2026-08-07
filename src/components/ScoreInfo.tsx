"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

export function ScoreInfo() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        aria-label="How scoring works"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        className="flex h-5 w-5 items-center justify-center rounded-full text-muted transition hover:text-accent"
      >
        <Info size={16} />
      </button>

      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          className="absolute left-1/2 top-7 z-30 w-64 -translate-x-1/2 rounded-2xl border border-border bg-surface p-4 text-left shadow-lg"
        >
          <p className="text-xs font-semibold">How score is calculated</p>
          <ul className="mt-2 space-y-1.5 text-xs text-muted">
            <li>
              <span className="font-medium text-foreground">70%</span>{" "}
              consistency — % of the last 30 days you were active.
            </li>
            <li>
              <span className="font-medium text-foreground">20%</span>{" "}
              streak — your current daily streak, capped at 30 days.
            </li>
            <li>
              <span className="font-medium text-foreground">10%</span>{" "}
              volume — minutes logged, a small bonus on top.
            </li>
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            Showing up often beats one big session.
          </p>
          <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-border bg-surface" />
        </div>
      )}
    </div>
  );
}
