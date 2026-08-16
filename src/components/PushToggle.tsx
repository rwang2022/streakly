"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  getExistingSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

export function PushToggle() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isPushSupported()) {
        setSupported(false);
        setChecked(true);
        return;
      }
      const existing = await getExistingSubscription();
      setEnabled(Boolean(existing));
      setChecked(true);
    })();
  }, []);

  async function handleToggle() {
    setBusy(true);
    if (enabled) {
      await unsubscribeFromPush();
      setEnabled(false);
    } else {
      const ok = await subscribeToPush();
      setEnabled(ok);
    }
    setBusy(false);
  }

  if (!checked) return null;

  return (
    <div className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-4">
      <div className="flex items-start gap-3">
        {enabled ? (
          <Bell size={18} className="mt-0.5 shrink-0 text-accent" />
        ) : (
          <BellOff size={18} className="mt-0.5 shrink-0 text-muted" />
        )}
        <div>
          <p className="text-sm font-medium">Daily reminder</p>
          <p className="text-xs text-muted">
            {supported
              ? "A nudge if you haven't logged anything today."
              : "Not supported in this browser."}
          </p>
        </div>
      </div>
      {supported && (
        <button
          onClick={handleToggle}
          disabled={busy}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle daily reminder"
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            enabled ? "bg-accent" : "bg-surface-2"
          } ${busy ? "opacity-60" : ""}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      )}
    </div>
  );
}
