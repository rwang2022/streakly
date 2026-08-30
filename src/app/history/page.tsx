import { createClient } from "@/lib/supabase/server";
import { getCachedUser, getRequestTimeZone } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { DeleteActivityButton } from "@/components/DeleteActivityButton";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import type { Activity } from "@/lib/types";
import { daysAgoIso, formatDateKey, formatDisplayDate } from "@/lib/date";
import { countsTowardStreak } from "@/lib/scoring";
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
