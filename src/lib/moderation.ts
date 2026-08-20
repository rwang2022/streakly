import { createClient } from "@/lib/supabase/server";

export interface ManualFlag {
  userId: string;
  flaggedBy: string;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface CombinedSuspicion {
  isSuspicious: boolean;
  isVouched: boolean;
  suspicionReason: string | null;
}

/**
 * Merges the algorithmic heuristic (lib/fraud.ts) with a manual mod flag
 * into the single isSuspicious/isVouched/suspicionReason trio the rest of
 * the app reads. Pulled out as one pure function — rather than duplicated
 * inline in both lib/leaderboard.ts and the profile page — so the two
 * places that need this can't drift apart on the actual rule, which is:
 *
 * - A manual flag is a separate, independent reason to be suspicious.
 * - A vouch only ever clears the *heuristic* side (heuristicClearedByVouch
 *   already reflects that upstream). It never clears a manual flag.
 * - "Vouched" (as consumed by scoring/badges — penalty applies iff
 *   isSuspicious && !isVouched) therefore only comes back true when the
 *   heuristic was the sole cause and it's been cleared, and nothing else
 *   (i.e. no manual flag) is holding the penalty in place.
 */
export function combineSuspicion({
  heuristicSuspicious,
  heuristicReason,
  heuristicClearedByVouch,
  manualFlag,
}: {
  heuristicSuspicious: boolean;
  heuristicReason: string | null;
  heuristicClearedByVouch: boolean;
  manualFlag: ManualFlag | null;
}): CombinedSuspicion {
  const isSuspicious = heuristicSuspicious || Boolean(manualFlag);
  const isVouched = heuristicClearedByVouch && !manualFlag;

  const reasonParts: string[] = [];
  if (heuristicSuspicious && heuristicReason) reasonParts.push(heuristicReason);
  if (manualFlag) {
    reasonParts.push(
      manualFlag.reason
        ? `Flagged by a mod: ${manualFlag.reason}`
        : "Flagged by a mod"
    );
  }

  return {
    isSuspicious,
    isVouched,
    suspicionReason: reasonParts.join(" · ") || null,
  };
}

/**
 * Active mod-created suspicion flags for the given user ids, batched into
 * one query. Unlike activity_vouches (which can have many rows per user —
 * one per voucher), manual_flags has at most one row per user, so this
 * doubles as "who flagged them and why" for the profile page and "which
 * of these ids are flagged" for the leaderboard.
 *
 * Expired flags (expires_at in the past) are filtered out in the query
 * itself, not left for callers to remember to check — an expired flag
 * should behave exactly like no flag at all everywhere it's used.
 */
export async function getManualFlags(userIds: string[]): Promise<ManualFlag[]> {
  if (userIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("manual_flags")
    .select("user_id, flagged_by, reason, created_at, expires_at")
    .in("user_id", userIds)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  return (data ?? []).map((row) => ({
    userId: row.user_id as string,
    flaggedBy: row.flagged_by as string,
    reason: row.reason as string | null,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string | null,
  }));
}
