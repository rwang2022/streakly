"use client";

import { useEffect, useState } from "react";
import { Vibrate } from "lucide-react";
import { haptic, hapticsEnabled, setHapticsEnabled } from "@/lib/haptics";

export function HapticsToggle() {
  // null until mounted: the setting lives in localStorage.
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(hapticsEnabled());
  }, []);

  if (on === null) {
    return <div className="mt-3 h-[52px] w-full rounded-2xl bg-surface-2" />;
  }

  return (
    <button
      type="button"
      onClick={() => {
        const next = !on;
        setOn(next);
        setHapticsEnabled(next);
        // A sample buzz when turning it on.
        if (next) haptic();
      }}
      className="mt-3 flex w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3.5"
    >
      <span className="flex items-center gap-2.5 text-sm font-medium">
        <Vibrate size={17} className="text-accent-2" />
        Vibrate on taps
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          on ? "bg-accent" : "bg-surface-2"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-[20px]" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
