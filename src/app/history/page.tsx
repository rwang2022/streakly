import { createClient } from "@/lib/supabase/server";
import { getCachedUser, getRequestTimeZone } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { DeleteActivityButton } from "@/components/DeleteActivityButton";
import type { Activity } from "@/lib/types";
import { daysAgoIso, formatDateKey, formatDisplayDate } from "@/lib/date";
import { countsTowardStreak } from "@/lib/scoring";
import { Dumbbell, Mountain, PersonStanding, Zap, Sparkles } from "lucide-react";

const MONTHS = 3;
// Grid rows run Sun→Sat; single letters keep the rail narrow, the way
// Apple's own calendar/fitness grids label weekdays.
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

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

  // "Today" as a calendar date in the person's own timezone, then pinned to
  // UTC-midnight purely so we can do whole-day arithmetic on it — from here
  // on these are abstract calendar dates, not real UTC instants.
  const todayKey = formatDateKey(new Date(), timeZone);
  const today = new Date(`${todayKey}T00:00:00Z`);

  const monthNameFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
  });

  type Cell = {
    key: string;
    active: boolean;
    isFuture: boolean;
    isToday: boolean;
  } | null;

  // One self-contained block per calendar month, oldest first: the current
  // month and the two before it. Each block is its own Sun→Sat grid of that
  // month's weeks (row 0 = Sunday); the days before the 1st — and, in the
  // current month, the days after today — are left as blank slots so the
  // first column sits at the right weekday offset. `weekOffset` is the
  // running column count of earlier blocks, used only to stagger the
  // mount animation across the whole strip.
  const months: {
    key: string;
    label: string;
    columns: Cell[][];
    daysInMonth: number;
    weekOffset: number;
  }[] = [];
  let weekOffset = 0;
  let activeCount = 0;
  for (let i = 0; i < MONTHS; i++) {
    const anchor = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (MONTHS - 1 - i), 1)
    );
    const year = anchor.getUTCFullYear();
    const month = anchor.getUTCMonth();
    const startWeekday = anchor.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const weekCount = Math.ceil((startWeekday + daysInMonth) / 7);

    const columns: Cell[][] = [];
    for (let w = 0; w < weekCount; w++) {
      const col: Cell[] = [];
      for (let d = 0; d < 7; d++) {
        const dayNum = w * 7 + d - startWeekday + 1;
        if (dayNum < 1 || dayNum > daysInMonth) {
          col.push(null);
          continue;
        }
        const date = new Date(Date.UTC(year, month, dayNum));
        const key = date.toISOString().slice(0, 10);
        const active = activeDates.has(key);
        if (active) activeCount++;
        col.push({
          key,
          active,
          isFuture: date.getTime() > today.getTime(),
          isToday: key === todayKey,
        });
      }
      columns.push(col);
    }

    months.push({
      key: `${year}-${month}`,
      label: monthNameFmt.format(anchor),
      columns,
      daysInMonth,
      weekOffset,
    });
    weekOffset += weekCount;
  }

  return (
    <main className="min-h-dvh px-6 pb-32 pt-[calc(env(safe-area-inset-top)+2.5rem)] md:pb-10 md:pl-72">
      <div className="mx-auto max-w-md md:max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted">Last {MONTHS} months</p>

        <div className="mt-6 rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <div className="flex items-stretch gap-2 sm:gap-3">
            {/* Weekday rail — a spacer up top keeps its rows lined up with
                the day cells despite the month-name row beside it. */}
            <div className="flex w-3 shrink-0 flex-col gap-1 sm:w-3.5 sm:gap-1.5">
              <div className="h-7 sm:h-8" aria-hidden />
              {WEEKDAYS.map((w, d) => (
                <div
                  key={d}
                  className="flex flex-1 items-center justify-center text-[10px] font-medium leading-none text-muted"
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="flex flex-1 gap-2.5 sm:gap-5">
              {months.map((m) => (
                <div
                  key={m.key}
                  className="flex flex-col gap-1 sm:gap-1.5"
                  style={{ flexGrow: m.columns.length, flexBasis: 0 }}
                >
                  <div className="flex h-7 flex-col justify-end gap-0.5 sm:h-8">
                    <div className="text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {m.label}
                    </div>
                    {/* Week ruler: a day-of-month tick above the column that
                        contains it (1, 8, 15, …) so a lit cell can be dated
                        by counting from the nearest number. */}
                    <div className="flex gap-1 sm:gap-1.5">
                      {m.columns.map((_, w) => {
                        const day = 1 + 7 * w;
                        return (
                          <div
                            key={w}
                            className="flex-1 text-center text-[8px] font-medium leading-none text-muted/60"
                          >
                            {day <= m.daysInMonth ? day : ""}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex flex-1 gap-1 sm:gap-1.5">
                    {m.columns.map((col, w) => (
                      <div key={w} className="flex flex-1 flex-col gap-1 sm:gap-1.5">
                        {col.map((cell, d) =>
                          cell === null ? (
                            <div key={d} className="aspect-square" />
                          ) : (
                            <div
                              key={cell.key}
                              title={cell.key}
                              style={{
                                animationDelay: `${Math.min(
                                  (m.weekOffset + w) * 22,
                                  520
                                )}ms`,
                              }}
                              className={[
                                "heat-cell aspect-square rounded-[28%]",
                                cell.isFuture
                                  ? "bg-surface-2/40"
                                  : cell.active
                                    ? "bg-accent shadow-[0_0_12px] shadow-accent/20"
                                    : "bg-surface-2",
                                cell.isToday
                                  ? cell.active
                                    ? "ring-2 ring-inset ring-white/60"
                                    : "ring-2 ring-inset ring-accent/50"
                                  : "",
                              ].join(" ")}
                            />
                          )
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-1.5 border-t border-border pt-3.5 text-xs text-muted">
            <span className="font-semibold text-foreground">{activeCount}</span>
            active {activeCount === 1 ? "day" : "days"} logged
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
