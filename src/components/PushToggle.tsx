"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import {
  getExistingSubscription,
  getReminderSettings,
  isPushSupported,
  subscribeToPush,
  updateReminderSettings,
} from "@/lib/push";
import { DEFAULT_REMINDER_HOUR, formatHour } from "@/lib/reminders";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function PushToggle() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(DEFAULT_REMINDER_HOUR);
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
      const settings = existing ? await getReminderSettings(existing) : null;
      setEnabled(Boolean(settings?.dailyReminder));
      if (settings) setHour(settings.reminderHour);
      setChecked(true);
    })();
  }, []);

  // Turning it off keeps the device subscribed (workout rest alerts use
  // the same subscription) and just stops the daily nudge.
  async function handleToggle() {
    setBusy(true);
    const existing = await getExistingSubscription();
    if (enabled) {
      if (existing) await updateReminderSettings(existing, { daily_reminder: false });
      setEnabled(false);
    } else {
      let ok = await subscribeToPush({ dailyReminder: true });
      const sub = ok ? await getExistingSubscription() : null;
      if (sub) ok = await updateReminderSettings(sub, { reminder_hour: hour });
      setEnabled(ok);
    }
    setBusy(false);
  }

  async function handleHourChange(next: number) {
    const previous = hour;
    setHour(next);
    const existing = await getExistingSubscription();
    if (existing && !(await updateReminderSettings(existing, { reminder_hour: next }))) {
      setHour(previous);
    }
  }

  if (!checked) return null;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface px-4 py-4">
      <div className="flex items-center justify-between">
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
      {supported && enabled && (
        <label className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted">Send at</span>
          <select
            value={hour}
            onChange={(e) => handleHourChange(Number(e.target.value))}
            className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
