import type { LeaderboardEntry } from "@/lib/types";

export interface Badge {
  emoji: string;
  label: string;
}

/**
 * A little personality for the leaderboard — replaces plain gold/silver/
 * bronze medals (which only ever reward the top 3) with a tier every row
 * earns based on their own score, so someone in 6th with a strong score
 * still gets something fun instead of just a number.
 */
export function getBadge(
  entry: Pick<LeaderboardEntry, "score" | "isSlacking" | "isSuspicious">
): Badge {
  if (entry.isSuspicious) return { emoji: "🚨", label: "Busted" };
  if (entry.isSlacking) return { emoji: "🪦", label: "RIP streak" };
  if (entry.score >= 90) return { emoji: "🐐", label: "GOAT" };
  if (entry.score >= 75) return { emoji: "🔥", label: "Locked in" };
  if (entry.score >= 55) return { emoji: "💪", label: "Grinding" };
  if (entry.score >= 35) return { emoji: "🌱", label: "Getting there" };
  return { emoji: "😅", label: "Rusty" };
}
