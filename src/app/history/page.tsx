import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/BottomNav";
import type { Activity } from "@/lib/types";
import { daysAgoIso } from "@/lib/date";
import { Dumbbell, Mountain, PersonStanding, Zap, Sparkles } from "lucide-react";

const WEEKS = 12;
const DAY_MS = 86400000;

const ICONS: Record<string, React.ReactNode> = {
  gym: <Dumbbell size={16} />,
  hike: <Mountain size={16} />,
  walk: <PersonStanding size={16} />,
  run: <Zap size={16} />,
  other: <Sparkles size={16} />,
};

function dateKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const since = daysAgoIso(WEEKS * 7);
  const { data } = await supabase
    .from("activities")
    .select("*")
    .eq("user_id", user.id)
    .gte("logged_at", since)
    .order("logged_at", { ascending: false });

  const activities = (data ?? []) as Activity[];
  const activeDates = new Set(activities.map((a) => dateKey(a.logged_at)));

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
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
    <main className="min-h-dvh px-6 pb-28 pt-10">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted">Last {WEEKS} weeks</p>

        <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-4">
          {columns.map((col, i) => (
            <div key={i} className="flex flex-col gap-1">
              {col.map((day) =>
                day.isFuture ? (
                  <div key={day.key} className="h-3 w-3" />
                ) : (
                  <div
                    key={day.key}
                    title={day.key}
                    className={`h-3 w-3 rounded-[3px] ${
                      day.active ? "bg-accent" : "bg-surface-2"
                    }`}
                  />
                )
              )}
            </div>
          ))}
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
                  {new Date(a.logged_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                  {a.duration_minutes ? ` · ${a.duration_minutes} min` : ""}
                  {a.note ? ` · ${a.note}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
