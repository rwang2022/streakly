"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ActivityType } from "@/lib/types";

const TYPES: { value: ActivityType; label: string }[] = [
  { value: "gym", label: "Gym" },
  { value: "hike", label: "Hike" },
  { value: "walk", label: "Walk" },
  { value: "run", label: "Run" },
  { value: "other", label: "Other" },
];

// "YYYY-MM-DDTHH:mm" in *local* time — what <input type="datetime-local">
// wants, and (importantly) what `new Date(...)` on the way back out also
// interprets as local time when it has no timezone suffix. Building this
// by hand instead of slicing an ISO string, since toISOString() is UTC
// and would silently shift the default by the viewer's offset.
function nowForDateTimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// Admin-only control for backfilling an entry someone forgot to log, or
// fixing a gap after the fact — for *any* user, not just yourself.
// Regular inserts are capped to a 24h/5min window at the database level
// (activities_logged_at_reasonable) to stop the backdating exploit that
// window originally closed; migration 14 carves out a matching exception
// for admin-authored rows via is_admin_user(), so this button can save a
// row with any logged_at and the database will actually accept it. RLS
// has a matching additive policy letting an admin insert for any
// user_id, not just their own.
export function AdminAddActivityButton({
  targetUserId,
}: {
  targetUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ActivityType>("gym");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [loggedAt, setLoggedAt] = useState(nowForDateTimeLocal);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);

    const parsedDuration = duration.trim() ? Number(duration) : null;
    if (
      parsedDuration !== null &&
      (!Number.isFinite(parsedDuration) ||
        parsedDuration < 0 ||
        parsedDuration > 1000)
    ) {
      setError("Minutes must be >= 0 and <= 1000.");
      return;
    }

    const parsedDate = new Date(loggedAt);
    if (!loggedAt || Number.isNaN(parsedDate.getTime())) {
      setError("Pick a valid date/time.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("activities").insert({
      user_id: targetUserId,
      type,
      duration_minutes: parsedDuration,
      note: note || null,
      logged_at: parsedDate.toISOString(),
    });
    setSaving(false);

    if (insertError) {
      setError(
        insertError.message.includes("Too many activities")
          ? "This person already hit the daily logging limit."
          : insertError.message.includes("duration_minutes")
          ? "Minutes must be >= 0 and <= 1000."
          : "Couldn't save that. Try again in a moment."
      );
      return;
    }

    setSaved(true);
    setNote("");
    setDuration("");
    setLoggedAt(nowForDateTimeLocal());
    router.refresh();
    setTimeout(() => {
      setSaved(false);
      setOpen(false);
    }, 900);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-muted transition active:scale-[0.98]"
      >
        <CalendarPlus size={15} />
        Add activity for them (admin)
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarPlus size={15} />
          Add activity (admin)
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="text-muted"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={`rounded-xl border px-1 py-1.5 text-[11px] font-medium transition ${
              type === t.value
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface-2 text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label className="mt-3 block text-xs font-medium text-muted">
        When
      </label>
      <input
        type="datetime-local"
        value={loggedAt}
        max={nowForDateTimeLocal()}
        onChange={(e) => setLoggedAt(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
      />

      <label className="mt-3 block text-xs font-medium text-muted">
        Duration (minutes, optional)
      </label>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={1000}
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        placeholder="30"
        className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
      />

      <label className="mt-3 block text-xs font-medium text-muted">
        Note (optional)
      </label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Backfilled — they forgot to log it"
        className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
      />

      {error && <p className="mt-2 text-xs text-accent">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || saved}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-sm font-medium text-background transition active:scale-[0.98] disabled:opacity-70"
      >
        {saved ? (
          <>
            <Check size={14} /> Added
          </>
        ) : saving ? (
          "Saving…"
        ) : (
          "Save activity"
        )}
      </button>
    </div>
  );
}
