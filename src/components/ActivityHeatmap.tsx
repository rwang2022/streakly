import { formatDateKey } from "@/lib/date";

// Grid rows run Sun→Sat; single letters keep the rail narrow, the way
// Apple's own calendar/fitness grids label weekdays.
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

type Cell = {
  key: string;
  active: boolean;
  isFuture: boolean;
  isToday: boolean;
} | null;

/**
 * The activity calendar shown on both History and friends' profiles: one
 * self-contained block per calendar month (current month plus the two
 * before it), each its own Sun→Sat grid with a 1/8/15/22/29 week ruler.
 * Blocks flex to fill their container so the cells scale with the space
 * rather than floating small in a wide card.
 *
 * `activeDates` is the set of "YYYY-MM-DD" keys (in `timeZone`) that count
 * toward the streak — callers filter out sub-5-minute logs first, same as
 * computeScore(), so a day only lights up here if it actually counted.
 */
export function ActivityHeatmap({
  activeDates,
  timeZone,
  months: monthCount = 3,
  className = "",
}: {
  activeDates: Set<string>;
  timeZone: string;
  months?: number;
  className?: string;
}) {
  // "Today" as a calendar date in the viewer's timezone, pinned to
  // UTC-midnight so the rest of this is plain whole-day arithmetic on
  // abstract calendar dates, not real UTC instants.
  const todayKey = formatDateKey(new Date(), timeZone);
  const today = new Date(`${todayKey}T00:00:00Z`);

  const monthNameFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
  });

  // Days before the 1st — and, in the current month, days after today —
  // are left as blank slots so each block's first column sits at the right
  // weekday offset. `weekOffset` is the running column count of earlier
  // blocks, used only to stagger the mount animation across the strip.
  const months: {
    key: string;
    label: string;
    columns: Cell[][];
    daysInMonth: number;
    weekOffset: number;
  }[] = [];
  let weekOffset = 0;
  let activeCount = 0;
  for (let i = 0; i < monthCount; i++) {
    const anchor = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth() - (monthCount - 1 - i),
        1
      )
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
    <div
      className={`rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-6 ${className}`}
    >
      <div className="flex items-stretch gap-2 sm:gap-3">
        {/* Weekday rail — a spacer up top keeps its rows lined up with the
            day cells despite the month-name row beside it. */}
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
                    contains it (1, 8, 15, …) so a lit cell can be dated by
                    counting from the nearest number. */}
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
  );
}
