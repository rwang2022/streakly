import { createClient } from "@/lib/supabase/server";
import { getCachedUser, getRequestTimeZone } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { DeleteActivityButton } from "@/components/DeleteActivityButton";
import type { Activity } from "@/lib/types";
import { daysAgoIso, formatDateKey, formatDisplayDate } from "@/lib/date";
import { Dumbbell, Mountain, PersonStanding, Zap, Sparkles } from "lucide-react";

const WEEKS = 12;
const DAY_MS = 86400000;
// Grid rows run Sun→Sat; only labeling every other day (GitHub's
// contribution-graph convention) keeps the label column legible at this
// size instead of a blur of tiny single letters.
const DAY_LABELS = ["", "M", "", "W", "", "F", ""];

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

  const since = daysAgoIso(WEEKS * 7);
  const { data } = await supabase
    .from("activities")
    .select("*")
    .eq("user_id", user.id)
    .gte("logged_at", since)
    .order("logged_at", { ascending: false });

  const activities = (data ?? []) as Activity[];
  const activeDates = new Set(
    activities.map((a) => formatDateKey(new Date(a.logged_at), timeZone))
  );

  // "Today" as a calendar date in the person's own timezone, then pinned to
  // UTC-midnight purely so we can do whole-day arithmetic on it — from here
  // on these are abstract calendar dates, not real UTC instants.
  const todayKey = formatDateKey(new Date(), timeZone);
  const today = new Date(`${todayKey}T00:00:00Z`);
  // Align grid to start on a Sunday.
  const startOffset = today.getUTCDay();
  const gridStart = new Date(
    today.getTime() - (WEEKS * 7 - 1 + startOffset) * DAY_MS
  );

  const columns: { key: string; active: boolean; isFuture: boolean }[][] = [];
  for (let w = 0; w < WEEKS + 1; w++) {
    const col: { key: string; active: boolean; isFuture: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart.getTime() + (w * 7 + d) * DAY_MS);
      const key = date.toISOString().slice(0, 10);
      col.push({
        key,
        active: activeDates.has(key),
        isFuture: date.getTime() > today.getTime(),
      });
    }
    columns.push(col);
  }

  return (
    <main className="min-h-dvh px-6 pb-32 pt-[calc(env(safe-area-inset-top)+2.5rem)] md:pb-10 md:pl-72">
      <div className="mx-auto max-w-md md:max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted">Last {WEEKS} weeks</p>

        <div className="mt-6 flex justify-center overflow-x-auto rounded-2xl border border-border bg-surface p-4">
          <div className="flex gap-1">
            <div className="flex flex-col gap-1 pr-1">
              {DAY_LABELS.map((label, d) => (
                <div
                  key={d}
                  className="flex h-3.5 w-3.5 items-center justify-center text-[9px] font-medium text-muted"
                >
                  {label}
                </div>
              ))}
            </div>
            {columns.map((col, i) => (
              <div key={i} className="flex flex-col gap-1">
                {col.map((day) =>
                  day.isFuture ? (
                    <div key={day.key} className="h-3.5 w-3.5" />
                  ) : (
                    <div
                      key={day.key}
                      title={day.key}
                      className={`h-3.5 w-3.5 rounded-[3px] ${
                        day.active ? "bg-accent" : "bg-surface-2"
                      }`}
                    />
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 space-y-2">
          {activities.length === 0 && (
            <p className="text-sm text-muted">No activity logged yet.</p>
          )}
          {activities.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-accent">
                {ICONS[a.type]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium capitalize">{a.type}</p>
                <p className="truncate text-xs text-muted">
                  {formatDisplayDate(a.logged_at, timeZone)}
                  {a.duration_minutes ? ` · ${a.duration_minutes} min` : ""}
                  {a.note ? ` · ${a.note}` : ""}
                </p>
              </div>
              <DeleteActivityButton activityId={a.id} />
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
