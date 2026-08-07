import Link from "next/link";
import { Flame, Settings2 } from "lucide-react";
import { getLeaderboard, getMyRooms } from "@/lib/leaderboard";
import { BottomNav } from "@/components/BottomNav";
import { ScoreInfo } from "@/components/ScoreInfo";
import type { LeaderboardEntry } from "@/lib/types";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room: roomId } = await searchParams;
  const [{ entries }, rooms] = await Promise.all([
    getLeaderboard(roomId),
    getMyRooms(),
  ]);

  const activeRoom = roomId ? rooms.find((r) => r.id === roomId) : null;

  return (
    <main className="min-h-dvh px-6 pb-28 pt-10">
      <div className="mx-auto max-w-md">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                Leaderboard
              </h1>
              <ScoreInfo />
            </div>
            <p className="mt-1 text-sm text-muted">
              Ranked by consistency, not just volume.
            </p>
          </div>
          <Link
            href="/rooms"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted"
            aria-label="Manage rooms"
          >
            <Settings2 size={16} />
          </Link>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          <Link
            href="/leaderboard"
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
              !roomId
                ? "bg-foreground text-background"
                : "border border-border bg-surface text-muted"
            }`}
          >
            Friends
          </Link>
          {rooms.map((r) => (
            <Link
              key={r.id}
              href={`/leaderboard?room=${r.id}`}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
                roomId === r.id
                  ? "bg-foreground text-background"
                  : "border border-border bg-surface text-muted"
              }`}
            >
              {r.name}
            </Link>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {entries.length === 0 && (
            <p className="mt-10 text-center text-sm text-muted">
              {activeRoom
                ? "No one's logged anything here yet."
                : "Add friends (or join a room) to start a leaderboard."}
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

  const inner = (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition ${
        entry.isMe
          ? "border-accent/40 bg-accent/5"
          : "border-border bg-surface active:bg-surface-2"
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
          className={`flex items-center gap-1 text-xs ${
            entry.isSlacking ? "text-slack" : "text-muted"
          }`}
        >
          {entry.isSlacking ? (
            "Slacking — no activity in 3+ days"
          ) : (
            <>
              {entry.currentStreak > 0 && (
                <Flame size={11} className="text-accent" />
              )}
              {entry.currentStreak}d streak · {entry.activeDaysLast30}/30
              active days
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span className="text-lg font-semibold leading-none">
          {entry.score}
        </span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">
          score
        </span>
      </div>
    </div>
  );

  if (entry.isMe) return inner;

  return <Link href={`/profile/${entry.profile.id}`}>{inner}</Link>;
}
