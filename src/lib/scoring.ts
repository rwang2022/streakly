import type { Activity } from "@/lib/types";
import { formatDateKey, daysBetweenDateKeys, DEFAULT_TIMEZONE } from "@/lib/date";

const DAY_MS = 24 * 60 * 60 * 1000;
const CONSISTENCY_WINDOW_DAYS = 30;
const WEEK_WINDOW_DAYS = 7;
const STREAK_CAP_DAYS = 30;
const VOLUME_CAP_MINUTES = 600; // ~20 min/day average over 30 days
const SLACKING_THRESHOLD_DAYS = 3;
const DEFAULT_DURATION_MINUTES = 20; // credited when a log has no duration set
// Anything explicitly logged at 5 minutes or under doesn't move the needle —
// a "creatine" or "chia seeds" entry is worth keeping as a record (it still
// saves fine and still shows up in history), it just shouldn't be able to
// extend a streak or count toward consistency/volume the way a real workout
// does. Leaving duration blank is unaffected — that still gets
// DEFAULT_DURATION_MINUTES credit, same as before; this only targets
// activities *explicitly* logged short.
const MIN_COUNTED_DURATION_MINUTES = 5;
// A single missed day doesn't have to end a long streak — one grace day is
// allowed per rolling week, same idea as Duolingo-style streak freezes.
// The missed day itself still doesn't count toward the streak *number*
// (only real active days increment it), it just doesn't reset the chain.
const FREEZE_WINDOW_DAYS = 7;
// Safety valve: never walk the streak back further than this, regardless
// of freezes. Without a bound, a freeze consumed right at the edge of
// however much activity history was fetched could misread "no data fetched
// this far back" as "a forgivable miss" and extend the streak indefinitely.
const MAX_STREAK_LOOKBACK_DAYS = 400;

export interface ScoreResult {
  score: number; // 0-100, weighted 70% consistency / 20% streak / 10% volume
  consistencyPct: number;
  currentStreak: number;
  longestStreak: number;
  activeDaysLast7: number;
  activeDaysLast30: number;
  totalMinutesLast30: number;
  isSlacking: boolean;
  lastActiveDate: string | null;
  usedStreakFreeze: boolean;
}

function daysAgoKey(days: number, from: Date, timeZone: string): string {
  return formatDateKey(new Date(from.getTime() - days * DAY_MS), timeZone);
}

// Shared with the heatmap builders (history + profile pages) so a day only
// lights up green there if it would also actually count toward the streak
// computed here — otherwise a "just took creatine" day would show active on
// the calendar while silently not extending the streak, which reads as a
// bug rather than the intended behavior.
export function countsTowardStreak(durationMinutes: number | null): boolean {
  return (
    durationMinutes === null || durationMinutes > MIN_COUNTED_DURATION_MINUTES
  );
}

/**
 * Computes the consistency-weighted score for a user from their raw activity
 * log rows. Pass in activities from at least the last ~35 days for an
 * accurate streak; only the last 30 days count toward consistency/volume.
 *
 * `timeZone` is the *person's* IANA timezone (e.g. "America/New_York"), not
 * the server's. This runs in a server component, which otherwise only
 * knows the server's own timezone (UTC on Vercel) — without this, "today"
 * and which calendar day an activity falls on would silently drift by a
 * day for anyone west of UTC, especially in the evening.
 */
export function computeScore(
  activities: Pick<Activity, "logged_at" | "duration_minutes">[],
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): ScoreResult {
  // A quick supplement/vitamin-type log (5 min or under) is still worth
  // saving as a record — it just doesn't get to extend a streak or count
  // toward consistency/volume the way a real workout does. Filtered out
  // right here, once, so every calculation below (activeDates, streak,
  // longest streak, minutes) is automatically consistent about it.
  const countedActivities = activities.filter((a) =>
    countsTowardStreak(a.duration_minutes)
  );
  const dateKey = (iso: string) => formatDateKey(new Date(iso), timeZone);
  const activeDates = new Set(countedActivities.map((a) => dateKey(a.logged_at)));

  // --- consistency + volume (last 30 days) ---
  const minutesByDate = new Map<string, number>();
  for (const a of countedActivities) {
    const key = dateKey(a.logged_at);
    minutesByDate.set(
      key,
      (minutesByDate.get(key) ?? 0) + (a.duration_minutes ?? DEFAULT_DURATION_MINUTES)
    );
  }
  let activeDaysLast30 = 0;
  let activeDaysLast7 = 0;
  let totalMinutesLast30 = 0;
  for (let i = 0; i < CONSISTENCY_WINDOW_DAYS; i++) {
    const key = daysAgoKey(i, now, timeZone);
    if (activeDates.has(key)) {
      activeDaysLast30 += 1;
      totalMinutesLast30 += minutesByDate.get(key) ?? 0;
      if (i < WEEK_WINDOW_DAYS) activeDaysLast7 += 1;
    }
  }
  const consistencyPct = (activeDaysLast30 / CONSISTENCY_WINDOW_DAYS) * 100;

  // --- current streak (grace: today isn't "missed" until it's over, plus
  // one streak-freeze day allowed per rolling week) ---
  const startCursor = activeDates.has(daysAgoKey(0, now, timeZone)) ? 0 : 1;
  let currentStreak = 0;
  let cursor = startCursor;
  let usedStreakFreeze = false;
  const freezesUsedAtCursor: number[] = [];
  if (activeDates.size > 0) {
    while (cursor - startCursor < MAX_STREAK_LOOKBACK_DAYS) {
      const key = daysAgoKey(cursor, now, timeZone);
      if (activeDates.has(key)) {
        currentStreak += 1;
        cursor += 1;
        continue;
      }
      const freezeAvailable = !freezesUsedAtCursor.some(
        (usedAt) => cursor - usedAt < FREEZE_WINDOW_DAYS
      );
      if (freezeAvailable) {
        freezesUsedAtCursor.push(cursor);
        usedStreakFreeze = true;
        cursor += 1;
        continue;
      }
      break;
    }
  }
  // A freeze only matters if it actually saved a streak that continues to
  // count for something — don't report "streak freeze used" for a brand
  // new/inactive user with no real streak to protect.
  usedStreakFreeze = usedStreakFreeze && currentStreak > 0;

  // --- longest streak across all provided activity ---
  const sortedDates = Array.from(activeDates).sort();
  let longestStreak = 0;
  let running = 0;
  let prevKey: string | null = null;
  for (const key of sortedDates) {
    if (prevKey && daysBetweenDateKeys(prevKey, key) === 1) {
      running += 1;
    } else {
      running = 1;
    }
    longestStreak = Math.max(longestStreak, running);
    prevKey = key;
  }
  longestStreak = Math.max(longestStreak, currentStreak);

  // --- slacking check ---
  const lastActiveDate = sortedDates.length
    ? sortedDates[sortedDates.length - 1]
    : null;
  const todayKey = formatDateKey(now, timeZone);
  const isSlacking =
    !lastActiveDate ||
    daysBetweenDateKeys(lastActiveDate, todayKey) >= SLACKING_THRESHOLD_DAYS;

  // --- weighted score ---
  const streakComponent = Math.min(currentStreak / STREAK_CAP_DAYS, 1) * 100;
  const volumeComponent = Math.min(totalMinutesLast30 / VOLUME_CAP_MINUTES, 1) * 100;
  const score = Math.round(
    0.7 * consistencyPct + 0.2 * streakComponent + 0.1 * volumeComponent
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    consistencyPct: Math.round(consistencyPct),
    currentStreak,
    longestStreak,
    activeDaysLast7,
    activeDaysLast30,
    totalMinutesLast30,
    isSlacking,
    lastActiveDate,
    usedStreakFreeze,
  };
}
