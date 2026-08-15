import Link from "next/link";
import { Flag, Flame, Settings2, Skull } from "lucide-react";
import { getLeaderboard, getMyRooms } from "@/lib/leaderboard";
import { BottomNav } from "@/components/BottomNav";
import { ScoreInfo } from "@/components/ScoreInfo";
import { getBadge } from "@/lib/badges";
import { getRequestTimeZone } from "@/lib/auth";
import { formatDateKey, daysBetweenDateKeys } from "@/lib/date";
import type { LeaderboardEntry } from "@/lib/types";

// lastActiveDate is already a "YYYY-MM-DD" key computed in the viewer's
// timezone (see lib/leaderboard.ts / lib/scoring.ts), so this just diffs
// two date keys against "today" in that same timezone — no raw millisecond
// math against Date.now(), which was the root cause of the Aug 15 bug
// (server runs in UTC on Vercel, so "today" there can be a day ahead of a
// US-based visitor's actual calendar day).
function daysSinceLastActive(
  lastActiveDate: string | null,
  todayKey: string
): number | null {
  if (!lastActiveDate) return null;
  return daysBetweenDateKeys(lastActiveDate, todayKey);
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room: roomId } = await searchParams;
  const [{ entries }, rooms, timeZone] = await Promise.all([
    getLeaderboard(roomId),
    getMyRooms(),
    getRequestTimeZone(),
  ]);
  const todayKey = formatDateKey(new Date(), timeZone);

  const activeRoom = roomId ? rooms.find((r) => r.id === roomId) : null;

  return (
    <main className="min-h-dvh px-6 pb-32 pt-10">
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
            <Row
              key={entry.profile.id}
              entry={entry}
              rank={i + 1}
              todayKey={todayKey}
              roomId={roomId}
            />
          ))}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}

function Row({
  entry,
  rank,
  todayKey,
  roomId,
}: {
  entry: LeaderboardEntry;
  rank: number;
  todayKey: string;
  roomId?: string;
}) {
  const badge = getBadge(entry);
  const daysSince = daysSinceLastActive(entry.lastActiveDate, todayKey);
  const isBusted = entry.isSuspicious;

  let slackerLine: string;
  if (daysSince === null) {
    slackerLine = "Never logged a single rep";
  } else if (daysSince >= 14) {
    slackerLine = `Missing for ${daysSince} days. Presumed hibernating.`;
  } else {
    slackerLine = `Last seen ${daysSince}d ago`;
  }

  const inner = (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-4 transition active:scale-[0.99] ${
        isBusted
          ? "border-dashed border-amber-500/50 bg-amber-500/10"
          : entry.isSlacking
          ? "border-dashed border-accent-2/40 bg-accent-2/10"
          : entry.isMe
          ? "border-accent/40 bg-accent/5"
          : "border-border bg-surface active:bg-surface-2"
      }`}
    >
      <div className="flex w-6 shrink-0 items-center justify-center text-sm font-medium text-muted">
        {rank}
      </div>

      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold ${
          isBusted || entry.isSlacking ? "opacity-40 grayscale" : ""
        }`}
      >
        {(entry.profile.display_name ?? entry.profile.username ?? "?")
          .charAt(0)
          .toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p
            className={`truncate font-medium ${
              entry.isSlacking && !isBusted
                ? "text-muted line-through decoration-accent-2/50"
                : ""
            }`}
          >
            {entry.profile.display_name ?? `@${entry.profile.username}`}
            {entry.isMe && <span className="ml-1 text-xs text-muted">(you)</span>}
          </p>
        </div>
        <p
          title={isBusted ? entry.suspicionReason ?? undefined : undefined}
          className={`mt-0.5 flex items-center gap-1 text-xs ${
            isBusted
              ? "font-semibold text-amber-600 dark:text-amber-400"
              : entry.isSlacking
              ? "font-semibold text-accent-2"
              : "text-muted"
          }`}
        >
          {isBusted ? (
            <>
              <Flag size={11} className="shrink-0" />
              Caught gaming it — score tanked
            </>
          ) : entry.isSlacking ? (
            <>
              <Skull size={11} className="shrink-0" />
              {slackerLine}
            </>
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

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex flex-col items-end">
          <span
            className={`text-lg font-semibold leading-none ${
              isBusted ? "text-amber-600 dark:text-amber-400" : ""
            }`}
          >
            {entry.score}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-muted">
            score
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
            isBusted
              ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
              : entry.isSlacking
              ? "bg-accent-2/20 text-accent-2"
              : "bg-surface-2 text-muted"
          }`}
        >
          {badge.emoji} {badge.label}
        </span>
      </div>
    </div>
  );

  if (entry.isMe) return inner;

  // Carry the active room (if any) along so the profile page's back link
  // can return here instead of always dropping back to the Friends tab.
  const profileHref = roomId
    ? `/profile/${entry.profile.id}?room=${roomId}`
    : `/profile/${entry.profile.id}`;

  return <Link href={profileHref}>{inner}</Link>;
}
