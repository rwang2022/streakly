"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Dumbbell, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { ExercisePicker } from "@/components/ExercisePicker";
import {
  WORKOUT_DRAFT_KEY as DRAFT_KEY,
  buildSetPayload,
  equipmentLabel,
  formatElapsed,
  formatSet,
  lastSessionSets,
  workoutDurationMinutes,
  type DraftExercise,
  type DraftWorkout,
  type SavedSet,
  type WeightUnit,
} from "@/lib/workout";

// The in-progress workout survives leaving the page, closing the app, or
// iOS evicting the Home Screen app from memory. Storage can be missing or
// throw (private mode, cleared site data), so every access is guarded and
// the page still works without it — you'd just lose the draft on close.
const UNIT_KEY = "streakly-weight-unit";

function readDraft(): DraftWorkout | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as DraftWorkout) : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: DraftWorkout | null) {
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Not fatal — see above.
  }
}

function readUnit(): WeightUnit {
  try {
    return localStorage.getItem(UNIT_KEY) === "kg" ? "kg" : "lb";
  } catch {
    return "lb";
  }
}

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `${Date.now().toString(36)}-${keyCounter}`;
}

export default function WorkoutPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [workout, setWorkout] = useState<DraftWorkout | null>(null);
  const [previous, setPrevious] = useState<Record<string, SavedSet[]>>({});
  const [now, setNow] = useState(() => Date.now());
  const [picking, setPicking] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetches what this person did last time for each named exercise, for
  // the "Previous" column. Missing table (migration 16 not run yet) or no
  // history both just leave the column showing a dash.
  const loadPrevious = useCallback(async (names: string[]) => {
    if (names.length === 0) return {};
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return {};
    const results = Object.fromEntries(
      await Promise.all(
        names.map(async (name) => {
          const { data } = await supabase
            .from("workout_sets")
            .select("activity_id, exercise_name, exercise_position, set_number, weight, reps, unit")
            .eq("user_id", user.id)
            .eq("exercise_name", name)
            .order("created_at", { ascending: false })
            .limit(40);
          return [name, lastSessionSets((data ?? []) as SavedSet[])] as const;
        })
      )
    );
    setPrevious((prev) => ({ ...prev, ...results }));
    return results;
  }, []);

  useEffect(() => {
    const draft = readDraft();
    // Restoring from localStorage has to happen after mount — the server
    // render can't see it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkout(draft);
    setLoaded(true);
    if (draft) loadPrevious(Array.from(new Set(draft.exercises.map((e) => e.name))));
  }, [loadPrevious]);

  useEffect(() => {
    if (!workout) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [workout]);

  // Mirror every change into storage. Gated on `loaded` so the initial
  // null state can't wipe a saved draft before it's been read back.
  useEffect(() => {
    if (loaded && !saved) writeDraft(workout);
  }, [workout, loaded, saved]);

  function update(next: DraftWorkout) {
    setWorkout(next);
  }

  function start() {
    setError(null);
    setNow(Date.now());
    update({ startedAt: new Date().toISOString(), note: "", unit: readUnit(), exercises: [] });
  }

  function discard() {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      setTimeout(() => setConfirmDiscard(false), 3000);
      return;
    }
    setConfirmDiscard(false);
    setWorkout(null);
    setError(null);
  }

  function setUnit(unit: WeightUnit) {
    if (!workout) return;
    try {
      localStorage.setItem(UNIT_KEY, unit);
    } catch {}
    update({ ...workout, unit });
  }

  function addExercise(ex: { id: string | null; name: string; equipment: string | null }) {
    if (!workout) return;
    setPicking(false);
    const prior = previous[ex.name];
    // Start with as many rows as last time, like Strong, so the Previous
    // column lines up set-for-set.
    const rows = Math.max(1, prior?.length ?? 1);
    const entry: DraftExercise = {
      key: newKey(),
      exerciseId: ex.id,
      name: ex.name,
      equipment: ex.equipment,
      sets: Array.from({ length: rows }, () => ({ weight: "", reps: "" })),
    };
    update({ ...workout, exercises: [...workout.exercises, entry] });
    if (!prior) {
      loadPrevious([ex.name]).then((results) => {
        // Grow the new exercise to match last time once that arrives, if
        // nothing's been typed into it yet.
        const count = results[ex.name]?.length ?? 0;
        if (count <= 1) return;
        setWorkout((w) => {
          if (!w) return w;
          const next = {
            ...w,
            exercises: w.exercises.map((e) =>
              e.key === entry.key && e.sets.length < count && e.sets.every((s) => !s.weight && !s.reps)
                ? { ...e, sets: Array.from({ length: count }, () => ({ weight: "", reps: "" })) }
                : e
            ),
          };
          return next;
        });
      });
    }
  }

  function updateExercise(key: string, fn: (e: DraftExercise) => DraftExercise | null) {
    if (!workout) return;
    const exercises = workout.exercises
      .map((e) => (e.key === key ? fn(e) : e))
      .filter((e): e is DraftExercise => e !== null);
    update({ ...workout, exercises });
  }

  function setField(key: string, index: number, field: "weight" | "reps", value: string) {
    updateExercise(key, (e) => ({
      ...e,
      sets: e.sets.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }));
  }

  // Tapping the Previous value copies it into the row, like Strong.
  function copyPrevious(key: string, index: number, prev: SavedSet) {
    updateExercise(key, (e) => ({
      ...e,
      sets: e.sets.map((s, i) =>
        i === index
          ? {
              weight: prev.weight !== null && Number(prev.weight) > 0 ? String(Number(prev.weight)) : "",
              reps: prev.reps !== null ? String(prev.reps) : "",
            }
          : s
      ),
    }));
  }

  async function finish() {
    if (!workout) return;
    setError(null);
    const sets = buildSetPayload(workout);
    if (sets.length === 0) {
      setError("Fill in reps for at least one set before finishing.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("log_workout", {
      p_started_at: workout.startedAt,
      p_duration_minutes: workoutDurationMinutes(workout.startedAt, new Date()),
      p_note: workout.note,
      p_sets: sets,
    });
    setSaving(false);

    if (rpcError) {
      const msg = rpcError.message;
      setError(
        msg.includes("Too many activities")
          ? "You've hit today's logging limit. Try again tomorrow."
          : msg.includes("logged_at")
          ? "This workout started more than 24 hours ago, so it can't be saved."
          : msg.includes("log_workout") || rpcError.code === "PGRST202"
          ? "Workout saving isn't set up on the server yet (migration 16)."
          : "Couldn't save that. Try again in a moment."
      );
      return;
    }

    writeDraft(null);
    setSaved(true);
    setTimeout(() => router.push("/history"), 450);
  }

  if (!loaded) {
    return (
      <main className="min-h-dvh px-6 pb-32 pt-[calc(env(safe-area-inset-top)+2.5rem)] md:pb-10 md:pl-72">
        <BottomNav />
      </main>
    );
  }

  if (!workout) {
    return (
      <main className="min-h-dvh px-6 pb-32 pt-[calc(env(safe-area-inset-top)+2.5rem)] md:pb-10 md:pl-72">
        <div className="mx-auto max-w-md md:max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Workout</h1>
          <p className="mt-1 text-sm text-muted">
            Track exercises, sets and weights as you go. Finishing logs it as a
            Gym session for your streak.
          </p>
          <button
            onClick={start}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-accent-2 to-accent px-5 py-4 font-medium text-white shadow-sm shadow-accent/30 transition active:scale-[0.98]"
          >
            <Dumbbell size={18} /> Start workout
          </button>
        </div>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-4 pb-32 md:pb-10 md:pl-72">
      <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-background/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] backdrop-blur-lg md:-ml-8">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 md:max-w-2xl">
          <div>
            <p className="text-xs text-muted">Workout in progress</p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">
              {formatElapsed(now - new Date(workout.startedAt).getTime())}
            </p>
          </div>
          <button
            onClick={finish}
            disabled={saving || saved}
            className="flex items-center gap-1.5 rounded-xl bg-success px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-70"
          >
            {saved ? (
              <>
                <Check size={16} /> Saved
              </>
            ) : saving ? (
              "Saving…"
            ) : (
              "Finish"
            )}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-md pt-4 md:max-w-2xl">
        <div className="flex items-center gap-2">
          <input
            value={workout.note}
            onChange={(e) => update({ ...workout, note: e.target.value.slice(0, 200) })}
            placeholder="Name this workout (optional)"
            className="min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
          />
          <div className="flex shrink-0 overflow-hidden rounded-xl border border-border text-xs font-medium">
            {(["lb", "kg"] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`px-3 py-3 ${workout.unit === u ? "bg-foreground text-background" : "bg-surface text-muted"}`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
            {error}
          </p>
        )}

        <div className="mt-4 space-y-4">
          {workout.exercises.map((ex) => {
            const prior = previous[ex.name] ?? [];
            return (
              <section key={ex.key} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-accent">{ex.name}</h2>
                    <p className="text-xs text-muted">{equipmentLabel(ex.equipment)}</p>
                  </div>
                  <button
                    onClick={() => updateExercise(ex.key, () => null)}
                    aria-label={`Remove ${ex.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-[2rem_1fr_4.5rem_4rem_2rem] items-center gap-x-2 gap-y-2 text-sm">
                  <span className="text-center text-[11px] font-medium uppercase text-muted">Set</span>
                  <span className="text-[11px] font-medium uppercase text-muted">Previous</span>
                  <span className="text-center text-[11px] font-medium uppercase text-muted">{workout.unit}</span>
                  <span className="text-center text-[11px] font-medium uppercase text-muted">Reps</span>
                  <span />
                  {ex.sets.map((s, i) => {
                    const p = prior[i];
                    return (
                      <div key={i} className="contents">
                        <span className="text-center font-medium text-muted">{i + 1}</span>
                        {p ? (
                          <button
                            onClick={() => copyPrevious(ex.key, i, p)}
                            className="truncate text-left text-muted"
                            aria-label={`Use previous: ${formatSet(p)}`}
                          >
                            {formatSet(p)}
                          </button>
                        ) : (
                          <span className="text-muted">–</span>
                        )}
                        <input
                          value={s.weight}
                          onChange={(e) => setField(ex.key, i, "weight", e.target.value)}
                          inputMode="decimal"
                          placeholder={p?.weight ? String(Number(p.weight)) : "0"}
                          aria-label={`Set ${i + 1} weight`}
                          className="w-full rounded-lg bg-surface-2 px-2 py-2 text-center tabular-nums outline-none focus:ring-2 focus:ring-accent/40"
                        />
                        <input
                          value={s.reps}
                          onChange={(e) => setField(ex.key, i, "reps", e.target.value)}
                          inputMode="numeric"
                          placeholder={p?.reps ? String(p.reps) : "0"}
                          aria-label={`Set ${i + 1} reps`}
                          className="w-full rounded-lg bg-surface-2 px-2 py-2 text-center tabular-nums outline-none focus:ring-2 focus:ring-accent/40"
                        />
                        <button
                          onClick={() =>
                            updateExercise(ex.key, (e) =>
                              e.sets.length > 1 ? { ...e, sets: e.sets.filter((_, j) => j !== i) } : e
                            )
                          }
                          disabled={ex.sets.length <= 1}
                          aria-label={`Delete set ${i + 1}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 disabled:opacity-30"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() =>
                    updateExercise(ex.key, (e) => ({
                      ...e,
                      sets: [...e.sets, { weight: e.sets.at(-1)?.weight ?? "", reps: "" }],
                    }))
                  }
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2.5 text-sm font-medium"
                >
                  <Plus size={16} /> Add set
                </button>
              </section>
            );
          })}
        </div>

        <button
          onClick={() => setPicking(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-accent/40 bg-accent/10 px-5 py-3.5 font-medium text-accent transition active:scale-[0.98]"
        >
          <Plus size={18} /> Add exercise
        </button>

        <button
          onClick={discard}
          className="mt-3 w-full rounded-2xl px-5 py-3 text-sm font-medium text-muted"
        >
          {confirmDiscard ? "Tap again to discard this workout" : "Discard workout"}
        </button>
      </div>

      {picking && <ExercisePicker onPick={addExercise} onClose={() => setPicking(false)} />}
      <BottomNav />
    </main>
  );
}
