import { Flame } from "lucide-react";
import { getLeaderboard } from "@/lib/leaderboard";
import { BottomNav } from "@/components/BottomNav";
import type { LeaderboardEntry } from "@/lib/types";

export default async function LeaderboardPage() {
  const { entries } = await getLeaderboard();

  return (
    <main className="min-h-dvh px-6 pb-28 pt-10">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted">
          Ranked by consistency, not just volume.
        </p>

        <div className="mt-6 space-y-2">
          {entries.length === 0 && (
            <p className="mt-10 text-center text-sm text-muted">
              Add friends to start a leaderboard.
            </p>
          )}
          {entries.map((entry, i) => (
            <Row key={entry.profile.id} entry={entry} rank={i + 1} />
          ))}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}

function Row({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 ${
        entry.isMe
          ? "border-accent/40 bg-accent/5"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex w-7 shrink-0 items-center justify-center text-sm font-medium text-muted">
        {medal ?? rank}
      </div>

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold">
        {(entry.profile.display_name ?? entry.profile.username ?? "?")
          .charAt(0)
          .toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {entry.profile.display_name ?? `@${entry.profile.username}`}
          {entry.isMe && <span className="ml-1.5 text-xs text-muted">(you)</span>}
        </p>
        <p
          className={`text-xs ${
            entry.isSlacking ? "text-slack" : "text-muted"
          }`}
        >
          {entry.isSlacking
            ? "Slacking — no activity in 3+ days"
            : `${entry.currentStreak}d streak · ${entry.activeDaysLast30}/30 active days`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {entry.currentStreak > 0 && !entry.isSlacking && (
          <Flame size={14} className="text-accent" />
        )}
        <span className="text-lg font-semibold">{entry.score}</span>
      </div>
    </div>
  );
}
