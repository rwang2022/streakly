"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dumbbell, Mountain, PersonStanding, Zap, Sparkles, Check, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import type { ActivityType } from "@/lib/types";
import { WORKOUT_DRAFT_KEY } from "@/lib/workout";
import { haptic } from "@/lib/haptics";

const TYPES: { value: ActivityType; label: string; icon: React.ReactNode }[] = [
  { value: "gym", label: "Gym", icon: <Dumbbell size={20} /> },
  { value: "hike", label: "Hike", icon: <Mountain size={20} /> },
  { value: "walk", label: "Walk", icon: <PersonStanding size={20} /> },
  { value: "run", label: "Run", icon: <Zap size={20} /> },
  { value: "other", label: "Other", icon: <Sparkles size={20} /> },
];

export default function LogActivityPage() {
  const router = useRouter();
  const [type, setType] = useState<ActivityType>("gym");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workoutInProgress, setWorkoutInProgress] = useState(false);

  useEffect(() => {
    try {
      // localStorage only exists after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkoutInProgress(Boolean(localStorage.getItem(WORKOUT_DRAFT_KEY)));
    } catch {}
  }, []);

  async function handleSave() {
    haptic();
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

    setSaving(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) {
      setSaving(false);
      return;
    }

    // The insert can genuinely fail — a database-level guardrail (date
    // sanity check, daily rate limit) rejected it, or the connection
    // dropped. Silently discarding the result here would mean the app
    // says "Logged" and redirects even though nothing was saved, which is
    // worse than just being slow: it actively hides the failure.
    const { error: insertError } = await supabase.from("activities").insert({
      user_id: user.id,
      type,
      duration_minutes: parsedDuration,
      note: note || null,
      logged_at: new Date().toISOString(),
    });

    setSaving(false);

    if (insertError) {
      setError(
        insertError.message.includes("Too many activities")
          ? "You've hit today's logging limit. Try again tomorrow."
          : insertError.message.includes("duration_minutes")
          ? "Minutes must be >= 0 and <= 1000."
          : "Couldn't save that. Try again in a moment."
      );
      return;
    }

    setSaved(true);
    setTimeout(() => router.push("/dashboard"), 450);
  }

  return (
    <main className="min-h-dvh px-6 pb-32 pt-[calc(env(safe-area-inset-top)+2.5rem)] md:pb-10 md:pl-72">
      <div className="mx-auto max-w-md md:max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">
          Log activity
        </h1>
        <p className="mt-1 text-sm text-muted">
          Showing up today is what moves the needle.
        </p>

        <Link
          href="/workout"
          className="mt-6 flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-4 transition active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-2 to-accent text-white">
            <Dumbbell size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {workoutInProgress ? "Resume workout" : "Start a strength workout"}
            </p>
            <p className="text-xs text-muted">
              {workoutInProgress
                ? "You have a workout in progress."
                : "Track exercises, sets and weights as you go."}
            </p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-muted" />
        </Link>

        <p className="mt-6 text-sm font-medium text-muted">Or log a quick activity</p>

        <div className="mt-3 grid grid-cols-3 gap-3">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 transition ${
                type === t.value
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-surface text-foreground"
              }`}
            >
              {t.icon}
              <span className="text-xs font-medium">{t.label}</span>
            </button>
          ))}
        </div>

        <label className="mt-6 block text-sm font-medium text-muted">
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
          className="mt-2 w-full rounded-2xl border border-border bg-surface px-4 py-3.5 outline-none focus:border-accent"
        />

        <label className="mt-4 block text-sm font-medium text-muted">
          Note (optional)
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Leg day, trail loop, evening walk…"
          className="mt-2 w-full rounded-2xl border border-border bg-surface px-4 py-3.5 outline-none focus:border-accent"
        />

        {error && (
          <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
            {error}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || saved}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-5 py-4 font-medium text-background shadow-sm transition active:scale-[0.98] disabled:opacity-70"
        >
          {saved ? (
            <>
              <Check size={18} /> Logged
            </>
          ) : saving ? (
            "Saving…"
          ) : (
            "Save activity"
          )}
        </button>
      </div>
      <BottomNav />
    </main>
  );
}
