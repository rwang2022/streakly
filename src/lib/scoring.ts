import type { Activity } from "@/lib/types";
import { formatDateKey, daysBetweenDateKeys, DEFAULT_TIMEZONE } from "@/lib/date";

const DAY_MS = 24 * 60 * 60 * 1000;
const CONSISTENCY_WINDOW_DAYS = 30;
const STREAK_CAP_DAYS = 30;
const VOLUME_CAP_MINUTES = 600; // ~20 min/day average over 30 days
const SLACKING_THRESHOLD_DAYS = 3;
const DEFAULT_DURATION_MINUTES = 20; // credited when a log has no duration set

export interface ScoreResult {
  score: number; // 0-100, weighted 70% consistency / 20% streak / 10% volume
  consistencyPct: number;
  currentStreak: number;
  longestStreak: number;
  activeDaysLast30: number;
  totalMinutesLast30: number;
  isSlacking: boolean;
  lastActiveDate: string | null;
}

function daysAgoKey(days: number, from: Date, timeZone: string): string {
  return formatDateKey(new Date(from.getTime() - days * DAY_MS), timeZone);
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
  const dateKey = (iso: string) => formatDateKey(new Date(iso), timeZone);
  const activeDates = new Set(activities.map((a) => dateKey(a.logged_at)));

  // --- consistency + volume (last 30 days) ---
  const minutesByDate = new Map<string, number>();
  for (const a of activities) {
    const key = dateKey(a.logged_at);
    minutesByDate.set(
      key,
      (minutesByDate.get(key) ?? 0) + (a.duration_minutes ?? DEFAULT_DURATION_MINUTES)
    );
  }
  let activeDaysLast30 = 0;
  let totalMinutesLast30 = 0;
  for (let i = 0; i < CONSISTENCY_WINDOW_DAYS; i++) {
    const key = daysAgoKey(i, now, timeZone);
    if (activeDates.has(key)) {
      activeDaysLast30 += 1;
      totalMinutesLast30 += minutesByDate.get(key) ?? 0;
    }
  }
  const consistencyPct = (activeDaysLast30 / CONSISTENCY_WINDOW_DAYS) * 100;

  // --- current streak (grace: today isn't "missed" until it's over) ---
  const startCursor = activeDates.has(daysAgoKey(0, now, timeZone)) ? 0 : 1;
  let currentStreak = 0;
  let cursor = startCursor;
  while (activeDates.has(daysAgoKey(cursor, now, timeZone))) {
    currentStreak += 1;
    cursor += 1;
  }

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
    activeDaysLast30,
    totalMinutesLast30,
    isSlacking,
    lastActiveDate,
  };
}
