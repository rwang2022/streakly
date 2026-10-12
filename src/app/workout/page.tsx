"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BookmarkPlus, Check, Dumbbell, Minus, Pencil, Plus, Timer, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { ExercisePicker } from "@/components/ExercisePicker";
import { haptic } from "@/lib/haptics";
import { getExistingSubscription, isPushSupported, subscribeToPush } from "@/lib/push";
import {
  DEFAULT_REST_SECONDS,
  REPEAT_PLAN_KEY,
  REST_STEP_SECONDS,
  WORKOUT_DRAFT_KEY as DRAFT_KEY,
  buildSetPayload,
  clampRestSeconds,
  defaultTemplateName,
  draftFromPlan,
  equipmentLabel,
  formatElapsed,
  formatSet,
  lastSessionSets,
  planFromDraft,
  workoutDurationMinutes,
  type DraftExercise,
  type DraftWorkout,
  type PlanExercise,
  type SavedSet,
  type WeightUnit,
  type WorkoutTemplate,
} from "@/lib/workout";

// The in-progress workout survives leaving the page, closing the app, or
// iOS evicting the Home Screen app from memory. Storage can be missing or
// throw (private mode, cleared site data), so every access is guarded and
// the page still works without it — you'd just lose the draft on close.
const UNIT_KEY = "streakly-weight-unit";
const REST_KEY = "streakly-rest-seconds";

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

function readRestSeconds(): number {
  try {
    const n = Number(localStorage.getItem(REST_KEY));
    return n > 0 ? clampRestSeconds(n) : DEFAULT_REST_SECONDS;
  } catch {
    return DEFAULT_REST_SECONDS;
  }
}

// Tells the server about the rest countdown so it can push a "rest's
// over" notification to a locked phone (see /api/rest-timer). Best
// effort: the in-app countdown works regardless.
function syncRestTimer(seconds: number | null) {
  fetch("/api/rest-timer", {
    method: seconds === null ? "DELETE" : "POST",
    headers: { "Content-Type": "application/json" },
    body: seconds === null ? undefined : JSON.stringify({ seconds }),
  }).catch(() => {});
}

// Two short beeps. Needs an AudioContext that was created/resumed during
// a tap, which toggleDone() takes care of.
function chime(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    [0, 0.25].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
  } catch {}
}

function newWorkoutBase(): Omit<DraftWorkout, "exercises"> {
  return {
    startedAt: new Date().toISOString(),
    note: "",
    unit: readUnit(),
    restSeconds: readRestSeconds(),
    rest: null,
  };
}

// A plan handed over by "Repeat" in History. Read once, then cleared.
function takeRepeatPlan(): PlanExercise[] | null {
  try {
    const raw = sessionStorage.getItem(REPEAT_PLAN_KEY);
    sessionStorage.removeItem(REPEAT_PLAN_KEY);
    const plan = raw ? (JSON.parse(raw) as PlanExercise[]) : null;
    return Array.isArray(plan) && plan.length > 0 ? plan : null;
  } catch {
    return null;
  }
}

function templateError(code: string | undefined, fallback: string) {
  return code === "42P01" || code === "PGRST205"
    ? "Templates aren't set up on the server yet (migration 21)."
    : fallback;
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
  // null = still checking; "unsupported" = e.g. Safari tab, not Home Screen.
  const [push, setPush] = useState<"on" | "off" | "unsupported" | null>(null);
  const [restOver, setRestOver] = useState(false);
  const [yourExercises, setYourExercises] = useState<string[]>([]);
  // null = still loading.
  const [templates, setTemplates] = useState<WorkoutTemplate[] | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [templateSaved, setTemplateSaved] = useState<"idle" | "saving" | "saved">("idle");
  const audioRef = useRef<AudioContext | null>(null);

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
            .select(
              "activity_id, imported_workout_id, performed_at, exercise_name, exercise_position, set_number, weight, reps, unit"
            )
            .eq("user_id", user.id)
            .eq("exercise_name", name)
            // performed_at, not created_at: imported Strong history was
            // created at import time but performed months earlier.
            .order("performed_at", { ascending: false })
            .limit(40);
          return [name, lastSessionSets((data ?? []) as SavedSet[])] as const;
        })
      )
    );
    setPrevious((prev) => ({ ...prev, ...results }));
    return results;
  }, []);

  useEffect(() => {
    let draft = readDraft();
    const plan = takeRepeatPlan();
    if (plan && draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Finish or discard this workout before repeating another one.");
    } else if (plan) {
      draft = draftFromPlan(plan, newWorkoutBase(), newKey);
    }
    // Restoring from localStorage has to happen after mount — the server
    // render can't see it.
    setWorkout(draft);
    setLoaded(true);
    if (draft) loadPrevious(Array.from(new Set(draft.exercises.map((e) => e.name))));
  }, [loadPrevious]);

  // Templates for the start screen. A missing table (migration 21 not run
  // yet) just shows none.
  const loadTemplates = useCallback(async () => {
    const { data } = await createClient()
      .from("workout_templates")
      .select("id, name, exercises")
      .order("updated_at", { ascending: false });
    setTemplates((data ?? []) as WorkoutTemplate[]);
  }, []);

  const idle = loaded && !workout;
  useEffect(() => {
    // setState only runs after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (idle) loadTemplates();
  }, [idle, loadTemplates]);

  useEffect(() => {
    if (!workout) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [workout]);

  // Names from this person's own history that Free Exercise DB doesn't
  // have (custom exercises, imported Strong names), for the picker.
  useEffect(() => {
    if (!picking) return;
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase
        .from("workout_sets")
        .select("exercise_name")
        .eq("user_id", session.user.id)
        .is("exercise_id", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      const names = Array.from(
        new Set((data ?? []).map((r: { exercise_name: string }) => r.exercise_name))
      );
      setYourExercises(names);
    })();
  }, [picking]);

  useEffect(() => {
    if (!isPushSupported()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPush("unsupported");
      return;
    }
    getExistingSubscription()
      .then((sub) => setPush(sub ? "on" : "off"))
      .catch(() => setPush("off"));
  }, []);

  // Rest ran out while the app was open: chime and flash a banner. (When
  // it's in the background the server's push notification covers it.)
  const restEndsAt = workout?.rest?.endsAt ?? null;
  useEffect(() => {
    if (restEndsAt === null || now < restEndsAt) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkout((w) => (w ? { ...w, rest: null } : w));
    setRestOver(true);
    chime(audioRef.current);
    const id = setTimeout(() => setRestOver(false), 4000);
    return () => clearTimeout(id);
  }, [now, restEndsAt]);

  // Mirror every change into storage. Gated on `loaded` so the initial
  // null state can't wipe a saved draft before it's been read back.
  useEffect(() => {
    if (loaded && !saved) writeDraft(workout);
  }, [workout, loaded, saved]);

  function update(next: DraftWorkout) {
    setWorkout(next);
  }

  function start(template?: WorkoutTemplate) {
    haptic();
    setError(null);
    setNow(Date.now());
    setTemplateSaved("idle");
    if (!template) {
      update({ ...newWorkoutBase(), exercises: [] });
      return;
    }
    update(draftFromPlan(template.exercises, { ...newWorkoutBase(), note: template.name }, newKey));
    loadPrevious(Array.from(new Set(template.exercises.map((e) => e.exercise_name))));
  }

  async function saveAsTemplate() {
    if (!workout || templateSaved !== "idle") return;
    if (workout.exercises.length === 0) {
      setError("Add an exercise before saving this as a template.");
      return;
    }
    setError(null);
    setTemplateSaved("saving");
    const { error: dbError } = await createClient()
      .from("workout_templates")
      .insert({
        name: defaultTemplateName(workout.note, new Date(workout.startedAt)),
        exercises: planFromDraft(workout),
      });
    if (dbError) {
      setTemplateSaved("idle");
      setError(templateError(dbError.code, "Couldn't save the template. Try again in a moment."));
      return;
    }
    setTemplateSaved("saved");
  }

  async function renameTemplate() {
    if (!renaming) return;
    const { id } = renaming;
    const name = renaming.name.trim().slice(0, 80);
    setRenaming(null);
    if (!name) return;
    setTemplates((list) => list?.map((t) => (t.id === id ? { ...t, name } : t)) ?? list);
    const { error: dbError } = await createClient()
      .from("workout_templates")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (dbError) {
      setError("Couldn't rename that template.");
      loadTemplates();
    }
  }

  // Two taps, like deleting an activity.
  async function deleteTemplate(id: string) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete((c) => (c === id ? null : c)), 3000);
      return;
    }
    setConfirmDelete(null);
    setTemplates((list) => list?.filter((t) => t.id !== id) ?? list);
    const { error: dbError } = await createClient().from("workout_templates").delete().eq("id", id);
    if (dbError) {
      setError("Couldn't delete that template.");
      loadTemplates();
    }
  }

  function setRestSeconds(seconds: number) {
    if (!workout) return;
    const next = clampRestSeconds(seconds);
    try {
      localStorage.setItem(REST_KEY, String(next));
    } catch {}
    update({ ...workout, restSeconds: next });
  }

  // ±15s on a running countdown. Also nudges the default for next time,
  // since that's usually what you meant.
  function adjustRest(delta: number) {
    if (!workout?.rest) return;
    const remaining = Math.ceil((workout.rest.endsAt - Date.now()) / 1000) + delta;
    if (remaining <= 0) return skipRest();
    const seconds = clampRestSeconds(remaining);
    const restSeconds = clampRestSeconds((workout.restSeconds ?? DEFAULT_REST_SECONDS) + delta);
    try {
      localStorage.setItem(REST_KEY, String(restSeconds));
    } catch {}
    update({
      ...workout,
      restSeconds,
      rest: { endsAt: Date.now() + seconds * 1000, total: Math.max(workout.rest.total, seconds) },
    });
    if (push === "on") syncRestTimer(seconds);
  }

  function skipRest() {
    if (!workout) return;
    update({ ...workout, rest: null });
    if (push === "on") syncRestTimer(null);
  }

  async function enableNotifications() {
    const ok = await subscribeToPush({ dailyReminder: false });
    setPush(ok ? "on" : "off");
    if (!ok) setError("Notifications weren't turned on. Check that Streakly is allowed to notify you.");
  }

  // Tick a set off (or un-tick it). Ticking an empty set copies last
  // time's numbers in, like Strong, then starts the rest countdown.
  function toggleDone(key: string, index: number) {
    if (!workout) return;
    // Created inside a tap so iOS lets it make sound later.
    try {
      audioRef.current ??= new AudioContext();
      audioRef.current.resume().catch(() => {});
    } catch {}

    const ex = workout.exercises.find((e) => e.key === key);
    const set = ex?.sets[index];
    if (!ex || !set) return;
    haptic();
    if (set.done) {
      updateExercise(key, (e) => ({
        ...e,
        sets: e.sets.map((s, i) => (i === index ? { ...s, done: false } : s)),
      }));
      return;
    }

    const prev = (previous[ex.name] ?? [])[index];
    const filled = {
      weight:
        set.weight || (prev?.weight !== null && Number(prev?.weight) > 0 ? String(Number(prev?.weight)) : ""),
      reps: set.reps || (prev?.reps ? String(prev.reps) : ""),
    };
    if (!(Number(filled.reps) > 0)) {
      setError("Enter reps for that set first.");
      return;
    }
    setError(null);
    const seconds = workout.restSeconds ?? DEFAULT_REST_SECONDS;
    update({
      ...workout,
      exercises: workout.exercises.map((e) =>
        e.key === key
          ? { ...e, sets: e.sets.map((s, i) => (i === index ? { ...filled, done: true } : s)) }
          : e
      ),
      rest: { endsAt: Date.now() + seconds * 1000, total: seconds },
    });
    setRestOver(false);
    if (push === "on") syncRestTimer(seconds);
  }

  function discard() {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      setTimeout(() => setConfirmDiscard(false), 3000);
      return;
    }
    setConfirmDiscard(false);
    if (workout?.rest && push === "on") syncRestTimer(null);
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
    haptic();
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

    if (workout.rest && push === "on") syncRestTimer(null);
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
          {error && (
            <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
              {error}
            </p>
          )}
          <button
            onClick={() => start()}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-accent-2 to-accent px-5 py-4 font-medium text-white shadow-sm shadow-accent/30 transition active:scale-[0.98]"
          >
            <Dumbbell size={18} /> Start empty workout
          </button>

          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">Templates</h2>
          {templates === null ? (
            <p className="mt-2 text-sm text-muted">Loading…</p>
          ) : templates.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              No templates yet. Tap &ldquo;Save as template&rdquo; during a workout or
              under a past workout in History. History also has Repeat, to do a past
              workout again.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {templates.map((t) => (
                <div key={t.id} className="rounded-2xl border border-border bg-surface px-4 py-3">
                  <div className="flex items-center gap-2">
                    {renaming?.id === t.id ? (
                      <input
                        autoFocus
                        value={renaming.name}
                        onChange={(e) => setRenaming({ id: t.id, name: e.target.value.slice(0, 80) })}
                        onBlur={renameTemplate}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameTemplate();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        aria-label="Template name"
                        className="min-w-0 flex-1 rounded-lg bg-surface-2 px-2 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-accent/40"
                      />
                    ) : (
                      <p className="min-w-0 flex-1 truncate font-medium">{t.name}</p>
                    )}
                    <button
                      onClick={() => setRenaming({ id: t.id, name: t.name })}
                      aria-label={`Rename ${t.name}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      aria-label={confirmDelete === t.id ? "Confirm delete" : `Delete ${t.name}`}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                        confirmDelete === t.id ? "bg-accent text-white" : "text-muted hover:bg-surface-2"
                      }`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">
                    {t.exercises.map((e) => `${e.sets} × ${e.exercise_name}`).join(" · ")}
                  </p>
                  <button
                    onClick={() => start(t)}
                    className="mt-3 w-full rounded-xl bg-accent/10 py-2.5 text-sm font-medium text-accent transition active:scale-[0.98]"
                  >
                    Start
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-4 pb-56 md:pb-32 md:pl-72">
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

        <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm text-muted">
            <Timer size={16} /> Rest between sets
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setRestSeconds((workout.restSeconds ?? DEFAULT_REST_SECONDS) - REST_STEP_SECONDS)}
              aria-label="Shorter rest"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2"
            >
              <Minus size={14} />
            </button>
            <span className="w-12 text-center text-sm font-medium tabular-nums">
              {formatElapsed((workout.restSeconds ?? DEFAULT_REST_SECONDS) * 1000)}
            </span>
            <button
              onClick={() => setRestSeconds((workout.restSeconds ?? DEFAULT_REST_SECONDS) + REST_STEP_SECONDS)}
              aria-label="Longer rest"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {push === "off" && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
            <Bell size={18} className="shrink-0 text-accent" />
            <p className="flex-1 text-xs text-muted">
              Get a notification when rest is over, even with your phone locked.
            </p>
            <button
              onClick={enableNotifications}
              className="shrink-0 rounded-xl bg-foreground px-3 py-2 text-xs font-medium text-background"
            >
              Turn on
            </button>
          </div>
        )}
        {push === "unsupported" && (
          <p className="mt-3 rounded-2xl border border-border bg-surface px-4 py-3 text-xs text-muted">
            To get rest notifications on iPhone, add Streakly to your Home Screen
            (Share, then Add to Home Screen) and open it from there.
          </p>
        )}

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

                <div className="mt-3 grid grid-cols-[2rem_1fr_4.5rem_4rem_2.25rem] items-center gap-x-2 gap-y-2 text-sm">
                  <span className="text-center text-[11px] font-medium uppercase text-muted">Set</span>
                  <span className="text-[11px] font-medium uppercase text-muted">Previous</span>
                  <span className="text-center text-[11px] font-medium uppercase text-muted">{workout.unit}</span>
                  <span className="text-center text-[11px] font-medium uppercase text-muted">Reps</span>
                  <span />
                  {ex.sets.map((s, i) => {
                    const p = prior[i];
                    const inputClass = `w-full rounded-lg px-2 py-2 text-center tabular-nums outline-none focus:ring-2 focus:ring-accent/40 ${
                      s.done ? "bg-success/15" : "bg-surface-2"
                    }`;
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
                          className={inputClass}
                        />
                        <input
                          value={s.reps}
                          onChange={(e) => setField(ex.key, i, "reps", e.target.value)}
                          inputMode="numeric"
                          placeholder={p?.reps ? String(p.reps) : "0"}
                          aria-label={`Set ${i + 1} reps`}
                          className={inputClass}
                        />
                        <button
                          onClick={() => toggleDone(ex.key, i)}
                          aria-label={s.done ? `Set ${i + 1} done, tap to undo` : `Mark set ${i + 1} done`}
                          aria-pressed={Boolean(s.done)}
                          className={`flex h-9 w-9 items-center justify-center rounded-lg transition active:scale-90 ${
                            s.done ? "bg-success text-white" : "bg-surface-2 text-muted"
                          }`}
                        >
                          <Check size={16} strokeWidth={2.6} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() =>
                      updateExercise(ex.key, (e) => ({
                        ...e,
                        sets: [...e.sets, { weight: e.sets.at(-1)?.weight ?? "", reps: "" }],
                      }))
                    }
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2.5 text-sm font-medium"
                  >
                    <Plus size={16} /> Add set
                  </button>
                  {ex.sets.length > 1 && (
                    <button
                      onClick={() => updateExercise(ex.key, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))}
                      aria-label="Remove last set"
                      className="flex items-center justify-center rounded-xl bg-surface-2 px-4 py-2.5 text-muted"
                    >
                      <Minus size={16} />
                    </button>
                  )}
                </div>
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
          onClick={saveAsTemplate}
          disabled={templateSaved !== "idle"}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-5 py-3 text-sm font-medium disabled:opacity-70"
        >
          {templateSaved === "saved" ? (
            <>
              <Check size={16} /> Saved to templates
            </>
          ) : (
            <>
              <BookmarkPlus size={16} /> {templateSaved === "saving" ? "Saving…" : "Save as template"}
            </>
          )}
        </button>

        <button
          onClick={discard}
          className="mt-3 w-full rounded-2xl px-5 py-3 text-sm font-medium text-muted"
        >
          {confirmDiscard ? "Tap again to discard this workout" : "Discard workout"}
        </button>
      </div>

      {(workout.rest || restOver) && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-30 px-4 md:bottom-6 md:left-64">
          <div
            role="timer"
            aria-live="polite"
            className="mx-auto max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-lg md:max-w-2xl"
          >
            {workout.rest ? (
              <>
                <div className="h-1 bg-surface-2">
                  <div
                    className="h-full bg-accent transition-[width] duration-200 ease-linear"
                    style={{
                      width: `${Math.max(0, Math.min(100, ((workout.rest.endsAt - now) / (workout.rest.total * 1000)) * 100))}%`,
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 px-4 py-3">
                  <div className="flex-1">
                    <p className="text-xs text-muted">Rest</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {formatElapsed(Math.max(0, workout.rest.endsAt - now) + 999)}
                    </p>
                  </div>
                  <button
                    onClick={() => adjustRest(-REST_STEP_SECONDS)}
                    className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-medium tabular-nums"
                  >
                    −{REST_STEP_SECONDS}
                  </button>
                  <button
                    onClick={() => adjustRest(REST_STEP_SECONDS)}
                    className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-medium tabular-nums"
                  >
                    +{REST_STEP_SECONDS}
                  </button>
                  <button
                    onClick={skipRest}
                    className="rounded-xl bg-foreground px-3 py-2 text-sm font-medium text-background"
                  >
                    Skip
                  </button>
                </div>
              </>
            ) : (
              <p className="flex items-center gap-2 px-4 py-4 font-semibold text-success">
                <Timer size={18} /> Rest&apos;s over. Time for your next set.
              </p>
            )}
          </div>
        </div>
      )}

      {picking && (
        <ExercisePicker
          onPick={addExercise}
          onClose={() => setPicking(false)}
          yourExercises={yourExercises}
        />
      )}
      <BottomNav />
    </main>
  );
}
