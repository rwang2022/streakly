// Pure logic for the Strong-style workout logger (src/app/workout). Kept
// out of the page so it can be unit-tested; see workout.test.ts.
import exerciseData from "@/data/exercises.json";

export type WeightUnit = "lb" | "kg";

/** One entry from Free Exercise DB (trimmed by scripts/build-exercises.mjs). */
export interface Exercise {
  id: string;
  name: string;
  equipment: string | null;
  muscle: string | null;
}

export const EXERCISES = exerciseData as Exercise[];

export interface DraftSet {
  weight: string;
  reps: string;
  // Ticked off. Starts the rest timer; doesn't affect what gets saved.
  done?: boolean;
}

export interface DraftExercise {
  // Unique within the workout, so the same exercise can be added twice.
  key: string;
  exerciseId: string | null;
  name: string;
  equipment: string | null;
  sets: DraftSet[];
}

/** An in-progress workout. Lives in localStorage until it's finished, so
 * closing the app mid-workout (or iOS killing the PWA) doesn't lose it. */
export interface DraftWorkout {
  startedAt: string;
  note: string;
  unit: WeightUnit;
  exercises: DraftExercise[];
  // Rest length used each time a set is ticked off.
  restSeconds?: number;
  // The running rest countdown, if any (epoch ms).
  rest?: { endsAt: number; total: number } | null;
}

/** Row shape the log_workout() Postgres function expects (migration 16). */
export interface SetPayload {
  exercise_id: string | null;
  exercise_name: string;
  exercise_position: number;
  set_number: number;
  weight: number | null;
  reps: number;
  unit: WeightUnit;
}

/** A saved set, as read back from workout_sets. It belongs to either a
 * workout logged in the app (activity_id) or one imported from Strong
 * (imported_workout_id, migration 20). */
export interface SavedSet {
  activity_id: string | null;
  imported_workout_id?: string | null;
  performed_at?: string;
  exercise_id?: string | null;
  exercise_name: string;
  exercise_position: number;
  set_number: number;
  weight: number | null;
  reps: number | null;
  unit: WeightUnit;
}

const EQUIPMENT_LABELS: Record<string, string> = {
  "body only": "Bodyweight",
  machine: "Machine",
  cable: "Cable",
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  kettlebells: "Kettlebell",
  bands: "Bands",
  "medicine ball": "Medicine ball",
  "exercise ball": "Exercise ball",
  "e-z curl bar": "EZ bar",
  "foam roll": "Foam roller",
  other: "Other",
};

export function equipmentLabel(equipment: string | null): string {
  if (!equipment) return "No equipment";
  return EQUIPMENT_LABELS[equipment] ?? equipment;
}

/** Equipment values in the order the filter chips show them. */
export const EQUIPMENT_FILTERS = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "body only",
  "kettlebells",
  "e-z curl bar",
  "bands",
];

/**
 * Exercises matching a search, best matches first: every word typed has
 * to appear somewhere in the name, and names that start with the query
 * rank above ones that merely contain it.
 */
export function searchExercises(
  query: string,
  equipment: string | null = null,
  list: Exercise[] = EXERCISES,
  limit = 50
): Exercise[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const q = words.join(" ");
  const matches = list.filter((e) => {
    if (equipment && e.equipment !== equipment) return false;
    const name = e.name.toLowerCase();
    return words.every((w) => name.includes(w));
  });
  if (q) {
    const rank = (e: Exercise) => (e.name.toLowerCase().startsWith(q) ? 0 : 1);
    matches.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }
  return matches.slice(0, limit);
}

function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Turns the draft into rows for log_workout(). A set only counts once it
 * has reps; blank sets (added but never filled in) are dropped, and an
 * exercise with no filled sets is dropped entirely so it doesn't leave
 * gaps in the numbering.
 */
export function buildSetPayload(workout: DraftWorkout): SetPayload[] {
  const out: SetPayload[] = [];
  let position = 0;
  for (const ex of workout.exercises) {
    const filled = ex.sets
      .map((s) => ({ weight: parseNumber(s.weight), reps: parseNumber(s.reps) }))
      .filter((s): s is { weight: number | null; reps: number } =>
        s.reps !== null && s.reps > 0
      );
    if (filled.length === 0) continue;
    filled.forEach((s, i) => {
      out.push({
        exercise_id: ex.exerciseId,
        exercise_name: ex.name,
        exercise_position: position,
        set_number: i + 1,
        weight: s.weight !== null ? Math.max(0, Math.round(s.weight * 100) / 100) : null,
        reps: Math.round(s.reps),
        unit: workout.unit,
      });
    });
    position += 1;
  }
  return out;
}

/** Whole minutes between start and now, kept inside the 0–1000 bound
 * the activities table enforces (migration 10). */
export function workoutDurationMinutes(startedAt: string, now: Date): number {
  const ms = now.getTime() - new Date(startedAt).getTime();
  return Math.min(1000, Math.max(0, Math.round(ms / 60000)));
}

/** "12:05" or "1:02:05" for the running timer. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "135 lb × 8", "× 12" (bodyweight), for the Previous column and history. */
export function formatSet(set: { weight: number | null; reps: number | null; unit: WeightUnit }): string {
  const reps = set.reps ?? 0;
  if (set.weight === null || set.weight === 0) return `× ${reps}`;
  return `${Number(set.weight)} ${set.unit} × ${reps}`;
}

/**
 * From a person's recent sets of one exercise (newest first, any mix of
 * workouts), keep just the sets from the most recent workout, in order.
 * That's what the "Previous" column compares against, like Strong does.
 */
export function lastSessionSets(recentSets: SavedSet[]): SavedSet[] {
  if (recentSets.length === 0) return [];
  const latest = sessionKey(recentSets[0]);
  return recentSets
    .filter((s) => sessionKey(s) === latest)
    .sort((a, b) => a.set_number - b.set_number);
}

/** Which workout a set came from, logged or imported. */
export function sessionKey(set: SavedSet): string {
  return set.activity_id ?? `imported:${set.imported_workout_id ?? ""}`;
}

export interface ExerciseSummary {
  name: string;
  sets: SavedSet[];
}

/** Groups one workout's saved sets by exercise, in the order they were done. */
export function groupSetsByExercise(sets: SavedSet[]): ExerciseSummary[] {
  const byPosition = new Map<number, ExerciseSummary>();
  for (const s of [...sets].sort(
    (a, b) => a.exercise_position - b.exercise_position || a.set_number - b.set_number
  )) {
    const group = byPosition.get(s.exercise_position) ?? { name: s.exercise_name, sets: [] };
    group.sets.push(s);
    byPosition.set(s.exercise_position, group);
  }
  return Array.from(byPosition.values());
}

/** One exercise in a template or repeated workout: what to do and how
 * many sets, not the numbers (the Previous column supplies those). */
export interface PlanExercise {
  exercise_id: string | null;
  exercise_name: string;
  equipment: string | null;
  sets: number;
}

/** A workout_templates row (migration 21). */
export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: PlanExercise[];
}

export const MAX_PLAN_SETS = 20;
const EXERCISES_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

function clampSets(n: number): number {
  return Math.min(MAX_PLAN_SETS, Math.max(1, Math.round(n) || 1));
}

/** The exercises of an in-progress workout, for "Save as template". */
export function planFromDraft(workout: DraftWorkout): PlanExercise[] {
  return workout.exercises.map((e) => ({
    exercise_id: e.exerciseId,
    exercise_name: e.name,
    equipment: e.equipment,
    sets: clampSets(e.sets.length),
  }));
}

/** The exercises of a finished or imported workout, from its saved sets,
 * for "Repeat" and "Save as template" in History. Equipment isn't saved
 * with a set, so it's looked up in the exercise list (custom and Strong
 * names just have none). */
export function planFromSets(sets: SavedSet[]): PlanExercise[] {
  return groupSetsByExercise(sets).map((group) => {
    const id = group.sets[0].exercise_id ?? null;
    return {
      exercise_id: id,
      exercise_name: group.name,
      equipment: (id && EXERCISES_BY_ID.get(id)?.equipment) || null,
      sets: clampSets(group.sets.length),
    };
  });
}

/** A fresh workout pre-filled with a plan's exercises and empty sets. */
export function draftFromPlan(
  plan: PlanExercise[],
  base: Omit<DraftWorkout, "exercises">,
  newKey: () => string
): DraftWorkout {
  return {
    ...base,
    exercises: plan.map((p) => ({
      key: newKey(),
      exerciseId: p.exercise_id,
      name: p.exercise_name,
      equipment: p.equipment,
      sets: Array.from({ length: clampSets(p.sets) }, () => ({ weight: "", reps: "" })),
    })),
  };
}

/** Default template name: the workout's own name, else e.g. "Workout Oct 9". */
export function defaultTemplateName(name: string | null, at: Date): string {
  const trimmed = (name ?? "").trim().slice(0, 80);
  if (trimmed) return trimmed;
  return `Workout ${at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** sessionStorage key handing a plan from History's "Repeat" to /workout. */
export const REPEAT_PLAN_KEY = "streakly-repeat-plan";

/** localStorage key for the in-progress workout (see src/app/workout). */
export const WORKOUT_DRAFT_KEY = "streakly-active-workout";

export const DEFAULT_REST_SECONDS = 90;
export const REST_STEP_SECONDS = 15;
// /api/rest-timer waits inside a serverless function with a 300s limit,
// so rests are capped a little under that.
export const MAX_REST_SECONDS = 285;

export function clampRestSeconds(seconds: number): number {
  return Math.min(MAX_REST_SECONDS, Math.max(REST_STEP_SECONDS, Math.round(seconds)));
}
