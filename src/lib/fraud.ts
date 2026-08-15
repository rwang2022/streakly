import type { Activity } from "@/lib/types";
import { formatDateKey, daysBetweenDateKeys } from "@/lib/date";

// A real person's workout durations vary day to day. The clearest tell of
// someone typing in numbers to inflate their score is the opposite: the
// *same* long duration, logged on consecutive days, over and over. One or
// two matching days is coincidence; a long identical run isn't.
const SUSPICIOUS_DURATION_THRESHOLD_MINUTES = 120;
const SUSPICIOUS_RUN_LENGTH = 5;

export interface SuspicionResult {
  suspicious: boolean;
  reason: string | null;
}

/**
 * Flags (doesn't silently penalize) activity that looks gamed rather than
 * genuinely logged — currently: a long run of consecutive days where the
 * day's total logged duration is exactly the same, high number every time
 * (e.g. "300 min" ten days straight). This is a visible flag, not a score
 * adjustment: friends can see it and call it out, rather than someone's
 * score silently changing for reasons they can't see.
 */
export function detectSuspiciousPattern(
  activities: Pick<Activity, "logged_at" | "duration_minutes">[],
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

  let bestRun = 1;
  let bestValue = minutesByDate.get(sortedKeys[0]) ?? 0;
  let curRun = 1;

  for (let i = 1; i < sortedKeys.length; i++) {
    const prevKey = sortedKeys[i - 1];
    const curKey = sortedKeys[i];
    const prevVal = minutesByDate.get(prevKey) ?? 0;
    const curVal = minutesByDate.get(curKey) ?? 0;
    const isConsecutiveDay = daysBetweenDateKeys(prevKey, curKey) === 1;

    curRun = isConsecutiveDay && curVal === prevVal ? curRun + 1 : 1;

    if (curRun > bestRun) {
      bestRun = curRun;
      bestValue = curVal;
    }
  }

  if (
    bestRun >= SUSPICIOUS_RUN_LENGTH &&
    bestValue >= SUSPICIOUS_DURATION_THRESHOLD_MINUTES
  ) {
    return {
      suspicious: true,
      reason: `${bestRun} days in a row logged at exactly ${bestValue} min`,
    };
  }

  return { suspicious: false, reason: null };
}
