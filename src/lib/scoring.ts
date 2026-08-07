import type { Activity } from "@/lib/types";

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

/** UTC date key (YYYY-MM-DD) so "a day" is consistent regardless of time-of-day logged. */
function dateKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function daysAgoKey(days: number, from: Date): string {
  return new Date(from.getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Computes the consistency-weighted score for a user from their raw activity
 * log rows. Pass in activities from at least the last ~90 days for an
 * accurate streak; only the last 30 days count toward consistency/volume.
 */
export function computeScore(
  activities: Pick<Activity, "logged_at" | "duration_minutes">[],
  now: Date = new Date()
): ScoreResult {
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
    const key = daysAgoKey(i, now);
    if (activeDates.has(key)) {
      activeDaysLast30 += 1;
      totalMinutesLast30 += minutesByDate.get(key) ?? 0;
    }
  }
  const consistencyPct = (activeDaysLast30 / CONSISTENCY_WINDOW_DAYS) * 100;

  // --- current streak (grace: today isn't "missed" until it's over) ---
  const startCursor = activeDates.has(daysAgoKey(0, now)) ? 0 : 1;
  let currentStreak = 0;
  let cursor = startCursor;
  while (activeDates.has(daysAgoKey(cursor, now))) {
    currentStreak += 1;
    cursor += 1;
  }

  // --- longest streak across all provided activity ---
  const sortedDates = Array.from(activeDates).sort();
  let longestStreak = 0;
  let running = 0;
  let prev: Date | null = null;
  for (const key of sortedDates) {
    const d = new Date(key + "T00:00:00Z");
    if (prev && d.getTime() - prev.getTime() === DAY_MS) {
      running += 1;
    } else {
      running = 1;
    }
    longestStreak = Math.max(longestStreak, running);
    prev = d;
  }
  longestStreak = Math.max(longestStreak, currentStreak);

  // --- slacking check ---
  const lastActiveDate = sortedDates.length
    ? sortedDates[sortedDates.length - 1]
    : null;
  const isSlacking =
    !lastActiveDate ||
    (now.getTime() - new Date(lastActiveDate + "T00:00:00Z").getTime()) / DAY_MS >=
      SLACKING_THRESHOLD_DAYS;

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
