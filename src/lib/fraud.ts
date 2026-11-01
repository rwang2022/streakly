import type { Activity } from "@/lib/types";
import { formatDateKey, daysBetweenDateKeys } from "@/lib/date";

// A real person's workout durations vary day to day. The clearest tell of
// someone typing in numbers to inflate their score is the opposite: the
// *same* long duration, logged on consecutive days, over and over. One or
// two matching days is coincidence; a long identical run isn't.
const SUSPICIOUS_DURATION_THRESHOLD_MINUTES = 120;
const SUSPICIOUS_DAY_RUN_LENGTH = 5;

// The other obvious tell: someone sitting there mashing "Log Activity"
// over and over to backfill a bunch of entries in one sitting. Real
// logging is spread out over the day/week; a pile of entries all created
// within the same short window is not. Uses a sliding window (not "every
// consecutive gap must be small") so one slightly longer pause mid-burst
// — stopping to read a screen, say — doesn't let someone dodge the flag.
const BURST_WINDOW_MS = 20 * 60 * 1000; // any 20-minute window...
const BURST_MIN_COUNT = 6; // ...containing 6+ entries counts as a burst

export interface SuspicionResult {
  suspicious: boolean;
  reason: string | null;
}

type SuspicionActivity = Pick<
  Activity,
  "logged_at" | "duration_minutes" | "created_at"
>;

/**
 * Flags (doesn't silently penalize) activity that looks gamed rather than
 * genuinely logged. Two independent checks, either one trips the flag:
 *
 * 1. A long run of consecutive calendar days where the day's total logged
 *    duration is the exact same high number every time (e.g. "300 min"
 *    five days straight) — real durations vary, identical repeats don't.
 * 2. A burst of many entries all *created* within minutes of each other
 *    (regardless of what date they claim to be logged on) — someone
 *    rapid-firing the log button to backfill a bunch of entries at once.
 *
 * The flag is always visible, with its reason, so a score never changes for
 * reasons the person can't see. lib/leaderboard.ts applies the -100 penalty
 * unless an admin's vouch clears it (see lib/vouches.ts, lib/moderation.ts).
 */
export function detectSuspiciousPattern(
  activities: SuspicionActivity[],
  timeZone: string
): SuspicionResult {
  const burst = detectBurst(activities);
  if (burst.suspicious) return burst;

  return detectIdenticalDayRun(activities, timeZone);
}

function detectBurst(activities: SuspicionActivity[]): SuspicionResult {
  const times = activities
    .map((a) => new Date(a.created_at).getTime())
    .sort((a, b) => a - b);
  if (times.length === 0) return { suspicious: false, reason: null };

  // Sliding window over sorted timestamps: for each right edge, shrink the
  // left edge until the window fits within BURST_WINDOW_MS, then check
  // how many entries are inside it.
  let left = 0;
  let bestCount = 1;
  for (let right = 0; right < times.length; right++) {
    while (times[right] - times[left] > BURST_WINDOW_MS) {
      left += 1;
    }
    bestCount = Math.max(bestCount, right - left + 1);
  }

  if (bestCount >= BURST_MIN_COUNT) {
    const windowMinutes = Math.round(BURST_WINDOW_MS / 60000);
    return {
      suspicious: true,
      reason: `${bestCount} activities logged within a ${windowMinutes}-minute span`,
    };
  }

  return { suspicious: false, reason: null };
}

function detectIdenticalDayRun(
  activities: SuspicionActivity[],
  timeZone: string
): SuspicionResult {
  const minutesByDate = new Map<string, number>();
  for (const a of activities) {
    const key = formatDateKey(new Date(a.logged_at), timeZone);
    minutesByDate.set(
      key,
      (minutesByDate.get(key) ?? 0) + (a.duration_minutes ?? 0)
    );
  }

  const sortedKeys = Array.from(minutesByDate.keys()).sort();
  if (sortedKeys.length === 0) return { suspicious: false, reason: null };

  // Check every run against the thresholds as it grows, not just the single
  // longest run. Tracking only the longest one let an earlier, harmless run
  // (say six days at 30 min) hide a later suspicious one (five days at 300).
  let curRun = 1;
  let flaggedRun = 0;
  let flaggedValue = 0;

  for (let i = 1; i < sortedKeys.length; i++) {
    const prevKey = sortedKeys[i - 1];
    const curKey = sortedKeys[i];
    const prevVal = minutesByDate.get(prevKey) ?? 0;
    const curVal = minutesByDate.get(curKey) ?? 0;
    const isConsecutiveDay = daysBetweenDateKeys(prevKey, curKey) === 1;

    curRun = isConsecutiveDay && curVal === prevVal ? curRun + 1 : 1;

    if (
      curRun >= SUSPICIOUS_DAY_RUN_LENGTH &&
      curVal >= SUSPICIOUS_DURATION_THRESHOLD_MINUTES &&
      curRun > flaggedRun
    ) {
      flaggedRun = curRun;
      flaggedValue = curVal;
    }
  }

  if (flaggedRun > 0) {
    return {
      suspicious: true,
      reason: `${flaggedRun} days in a row logged at exactly ${flaggedValue} min`,
    };
  }

  return { suspicious: false, reason: null };
}
