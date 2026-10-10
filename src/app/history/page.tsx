import { createClient } from "@/lib/supabase/server";
import { getCachedUser, getRequestTimeZone } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { DeleteActivityButton } from "@/components/DeleteActivityButton";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import type { Activity } from "@/lib/types";
import { daysAgoIso, formatDateKey, formatDisplayDate } from "@/lib/date";
import { countsTowardStreak } from "@/lib/scoring";
import {
  formatSet,
  groupSetsByExercise,
  sessionKey,
  type SavedSet,
} from "@/lib/workout";
import { Dumbbell, Mountain, PersonStanding, Zap, Sparkles } from "lucide-react";

const MONTHS = 3;

const ICONS: Record<string, React.ReactNode> = {
  gym: <Dumbbell size={16} />,
  hike: <Mountain size={16} />,
  walk: <PersonStanding size={16} />,
  run: <Zap size={16} />,
  other: <Sparkles size={16} />,
};

export default async function HistoryPage() {
  const supabase = await createClient();
  const [{ data: { user } }, timeZone] = await Promise.all([
    getCachedUser(),
    getRequestTimeZone(),
  ]);
  if (!user) return null;

  const since = daysAgoIso(MONTHS * 31 + 14);
  const { data } = await supabase
    .from("activities")
    .select("*")
    .eq("user_id", user.id)
    .gte("logged_at", since)
    .order("logged_at", { ascending: false });

  const activities = (data ?? []) as Activity[];

  // Workouts imported from Strong (migration 20): listed here as history,
  // never on the heatmap, since they don't count toward the streak.
  const { data: importedRows } = await supabase
    .from("imported_workouts")
    .select("id, started_at, name, duration_minutes")
    .eq("user_id", user.id)
    .gte("started_at", since)
    .order("started_at", { ascending: false });
  const imported = (importedRows ?? []) as {
    id: string;
    started_at: string;
    name: string | null;
    duration_minutes: number | null;
  }[];

  // Sets logged with the workout tracker (migration 16) or imported. If
  // those migrations haven't been run the queries just error and every
  // activity renders as before, with no breakdown.
  const gymIds = activities.filter((a) => a.type === "gym").map((a) => a.id);
  const importedIds = imported.map((w) => w.id);
  const SET_COLUMNS =
    "activity_id, imported_workout_id, exercise_name, exercise_position, set_number, weight, reps, unit";
  const [{ data: setRows }, { data: importedSetRows }] = await Promise.all([
    gymIds.length
      ? supabase.from("workout_sets").select(SET_COLUMNS).in("activity_id", gymIds)
      : Promise.resolve({ data: [] }),
    importedIds.length
      ? supabase.from("workout_sets").select(SET_COLUMNS).in("imported_workout_id", importedIds)
      : Promise.resolve({ data: [] }),
  ]);
  const setsBySession = new Map<string, SavedSet[]>();
  for (const row of [...(setRows ?? []), ...(importedSetRows ?? [])] as SavedSet[]) {
    const key = sessionKey(row);
    const list = setsBySession.get(key) ?? [];
    list.push(row);
    setsBySession.set(key, list);
  }

  // One list, newest first: logged activities and imported workouts.
  const entries = [
    ...activities.map((a) => ({
      id: a.id,
      key: a.id,
      imported: false,
      type: a.type as string,
      at: a.logged_at,
      duration: a.duration_minutes,
      note: a.note,
    })),
    ...imported.map((w) => ({
      id: w.id,
      key: `imported:${w.id}`,
      imported: true,
      type: "gym",
      at: w.started_at,
      duration: w.duration_minutes,
      note: w.name,
    })),
  ].sort((x, y) => y.at.localeCompare(x.at));

  // Same rule computeScore() applies: a quick sub-5-minute log (creatine,
  // chia seeds, etc.) still shows up in the list below, it just doesn't
  // light up its day here — otherwise the calendar would show a day as
  // "active" that the actual streak calculation silently skipped.
  const activeDates = new Set(
    activities
      .filter((a) => countsTowardStreak(a.duration_minutes))
      .map((a) => formatDateKey(new Date(a.logged_at), timeZone))
  );

  return (
    <main className="min-h-dvh px-6 pb-32 pt-[calc(env(safe-area-inset-top)+2.5rem)] md:pb-10 md:pl-72">
      <div className="mx-auto max-w-md md:max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted">Last {MONTHS} months</p>

        <ActivityHeatmap
          activeDates={activeDates}
          timeZone={timeZone}
          months={MONTHS}
          className="mt-6"
        />

        <div className="mt-8 space-y-2">
          {entries.length === 0 && (
            <p className="text-sm text-muted">No activity logged yet.</p>
          )}
          {entries.map((a) => {
            const exercises = groupSetsByExercise(setsBySession.get(a.key) ?? []);
            return (
              <div
                key={a.key}
                className="rounded-2xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-accent">
                    {ICONS[a.type]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium capitalize">
                      {a.type}
                      {a.imported && (
                        <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-normal normal-case text-muted">
                          Imported from Strong
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {formatDisplayDate(a.at, timeZone)}
                      {a.duration ? ` · ${a.duration} min` : ""}
                      {a.note ? ` · ${a.note}` : ""}
                    </p>
                  </div>
                  <DeleteActivityButton activityId={a.id} imported={a.imported} />
                </div>
                {exercises.length > 0 && (
                  <details className="group mt-2 border-t border-border pt-2">
                    <summary className="cursor-pointer list-none text-xs font-medium text-accent">
                      {exercises.length} {exercises.length === 1 ? "exercise" : "exercises"} ·{" "}
                      {exercises.reduce((n, e) => n + e.sets.length, 0)} sets
                      <span className="text-muted group-open:hidden"> · Show</span>
                    </summary>
                    <div className="mt-2 space-y-2">
                      {exercises.map((e, i) => (
                        <div key={i}>
                          <p className="text-sm font-medium">{e.name}</p>
                          <p className="text-xs text-muted">
                            {e.sets.map((s) => formatSet(s)).join("  ·  ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
