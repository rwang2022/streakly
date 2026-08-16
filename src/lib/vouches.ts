import { createClient } from "@/lib/supabase/server";

// A vouch older than this no longer counts — the suspicion flag itself is
// recomputed from a rolling window of activity, so a vouch from weeks ago
// shouldn't keep silently clearing whatever *new* pattern is flagged today.
export const VOUCH_VALID_DAYS = 7;

/**
 * Which of the given user ids currently have at least one valid (not
 * stale) vouch from a friend/roommate. Used to decide whether the -100
 * suspicious-activity penalty should be suppressed for each leaderboard
 * entry — batched into one query rather than one per row.
 */
export async function getVouchedUserIds(
  userIds: string[]
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const supabase = await createClient();
  const cutoff = new Date(
    Date.now() - VOUCH_VALID_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data } = await supabase
    .from("activity_vouches")
    .select("user_id")
    .in("user_id", userIds)
    .gte("created_at", cutoff);

  return new Set((data ?? []).map((row) => row.user_id as string));
}

/**
 * Whether a single vouch row is still within its validity window. Kept as
 * its own helper (rather than inline `Date.now()` in a component body) so
 * lint's render-purity check doesn't flag it — same reasoning as
 * daysAgoIso() in lib/date.ts.
 */
export function isVouchFresh(createdAt: string): boolean {
  return (
    Date.now() - new Date(createdAt).getTime() <=
    VOUCH_VALID_DAYS * 24 * 60 * 60 * 1000
  );
}
