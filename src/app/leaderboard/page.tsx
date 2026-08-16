import Link from "next/link";
import { Crown, Flag, Flame, Settings2, Skull, Star } from "lucide-react";
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

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
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

  // Rows that have "gone quiet" (but weren't caught gaming the system —
  // that's its own separate red-flag treatment, not part of the graveyard).
  // These decay progressively the further down the pack they are, and the
  // very last one gets a literal tombstone instead of just fading out.
  const slackerEntries = entries.filter(
    (e) => e.isSlacking && !(e.isSuspicious && !e.isVouched)
  );

  return (
    <main className="min-h-dvh px-6 pb-32 pt-[calc(env(safe-area-inset-top)+2.5rem)]">
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

        <div className="mt-9 space-y-2">
          {entries.length === 0 && (
            <p className="mt-10 text-center text-sm text-muted">
              {activeRoom
                ? "No one's logged anything here yet."
                : "Add friends (or join a room) to start a leaderboard."}
            </p>
          )}
          {entries.map((entry, i) => {
            const slackIndex = slackerEntries.findIndex(
              (e) => e.profile.id === entry.profile.id
            );
            const isLastSlacker =
              slackIndex !== -1 && slackIndex === slackerEntries.length - 1;
            return (
              <Row
                key={entry.profile.id}
                entry={entry}
                rank={i + 1}
                todayKey={todayKey}
                roomId={roomId}
                slackIndex={slackIndex}
                slackerCount={slackerEntries.length}
                isLastSlacker={isLastSlacker}
              />
            );
          })}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}

function MossBlob({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="15"
      viewBox="0 0 20 15"
      className={className}
      aria-hidden
    >
      <ellipse cx="4.5" cy="9" rx="4.5" ry="3.2" fill="#5c7a3f" opacity="0.85" />
      <ellipse cx="11" cy="5.5" rx="5.5" ry="3.8" fill="#4a6633" opacity="0.85" />
      <ellipse cx="15.5" cy="10" rx="4" ry="2.8" fill="#6f8f4d" opacity="0.85" />
      <circle cx="7" cy="7" r="1" fill="#2f4020" opacity="0.7" />
      <circle cx="13" cy="9" r="0.8" fill="#2f4020" opacity="0.7" />
    </svg>
  );
}

// A wreath of tangent-oriented leaves hugging the bottom of the avatar
// circle (from ~100° to ~250°, leaving the top open for the crown) —
// verified at actual avatar scale as a mockup before porting the
// coordinates here, since a naive full-height stack of leaves just reads
// as a blurry dotted ring at this size rather than a wreath.
function Laurel({ side }: { side: "left" | "right" }) {
  const flip = side === "right";
  const leaves = Array.from({ length: 7 }).map((_, i) => {
    const t = i / 6;
    const angDeg = lerp(100, 250, t);
    const a = flip ? 180 - angDeg : angDeg;
    const rad = (a * Math.PI) / 180;
    const r = 1.16;
    const size = lerp(0.16, 0.24, t);
    const tangent = a + 90;
    const rot = flip ? tangent + 180 : tangent;
    return {
      x: Math.cos(rad) * r,
      y: Math.sin(rad) * r,
      size,
      rot,
    };
  });

  return (
    <svg
      viewBox="-1.3 -1.3 2.6 2.6"
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {leaves.map((leaf, i) => (
        <ellipse
          key={i}
          cx={leaf.x}
          cy={leaf.y}
          rx={leaf.size}
          ry={leaf.size * 0.4}
          fill="#b8790f"
          stroke="#8a5a08"
          strokeWidth="0.02"
          transform={`rotate(${leaf.rot} ${leaf.x} ${leaf.y})`}
        />
      ))}
    </svg>
  );
}

function ChampionStars() {
  return (
    <div className="mt-1 flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={11} className="fill-amber-400 text-amber-500" />
      ))}
    </div>
  );
}

function Tombstone({
  entry,
  rank,
  roomId,
  todayKey,
}: {
  entry: LeaderboardEntry;
  rank: number;
  roomId?: string;
  todayKey: string;
}) {
  const name = entry.profile.display_name ?? `@${entry.profile.username}`;
  const daysSince = daysSinceLastActive(entry.lastActiveDate, todayKey);
  const epitaph =
    daysSince === null
      ? "Never logged a single rep"
      : daysSince >= 14
      ? `Missing for ${daysSince} days. Presumed dead.`
      : `Last seen ${daysSince}d ago`;

  const content = (
    <div className="relative flex flex-col items-center pb-3 pt-2">
      <span className="text-[10px] font-medium text-muted">#{rank}</span>

      <div className="relative mt-3 flex flex-col items-center">
        {/* small cross above the stone */}
        <div className="relative h-4 w-4">
          <div className="absolute left-1/2 top-0 h-4 w-1 -translate-x-1/2 rounded-full bg-border" />
          <div className="absolute left-1/2 top-1 h-1 w-4 -translate-x-1/2 rounded-full bg-border" />
        </div>

        {/* headstone */}
        <div className="relative -mt-px w-56 rounded-t-[4.5rem] rounded-b-lg border border-border bg-surface-2 px-4 pb-3 pt-6 text-center shadow-sm active:scale-[0.99]">
          <MossBlob className="absolute -left-1.5 bottom-2" />
          <MossBlob className="absolute -right-1.5 top-8 scale-x-[-1]" />
          <MossBlob className="absolute left-8 top-0.5 scale-75 opacity-90" />

          <p className="font-serif text-xs font-bold tracking-[0.3em] text-muted">
            R.I.P.
          </p>
          <div className="mx-auto mt-1.5 h-px w-16 bg-border" />
          <div className="mt-2 flex items-center justify-center gap-1.5">
            <Skull size={13} className="shrink-0 text-muted" />
            <p className="truncate text-sm font-semibold text-muted line-through decoration-muted/60">
              {name}
              {entry.isMe && (
                <span className="ml-1 text-xs font-normal no-underline text-muted">
                  (you)
                </span>
              )}
            </p>
          </div>
          <p className="mt-1 text-[11px] text-muted/80">{epitaph}</p>
          <p className="mt-2 text-xs font-semibold text-muted">
            {entry.score} pts
          </p>
        </div>

        {/* ground shadow */}
        <div className="mt-0.5 h-2.5 w-44 rounded-full bg-black/10 blur-[2px] dark:bg-black/50" />
      </div>
    </div>
  );

  if (entry.isMe) return content;

  const profileHref = roomId
    ? `/profile/${entry.profile.id}?room=${roomId}`
    : `/profile/${entry.profile.id}`;

  return <Link href={profileHref}>{content}</Link>;
}

function Row({
  entry,
  rank,
  todayKey,
  roomId,
  slackIndex,
  slackerCount,
  isLastSlacker,
}: {
  entry: LeaderboardEntry;
  rank: number;
  todayKey: string;
  roomId?: string;
  slackIndex: number;
  slackerCount: number;
  isLastSlacker: boolean;
}) {
  const badge = getBadge(entry);
  const daysSince = daysSinceLastActive(entry.lastActiveDate, todayKey);
  // Vouched-for entries keep the flag visible (via the badge pill below)
  // but don't get the full dramatic "busted" row treatment or the -100
  // penalty (already suppressed upstream in lib/leaderboard.ts).
  const isBusted = entry.isSuspicious && !entry.isVouched;
  // #1 gets the glow treatment — but only if they've actually earned it.
  // A slacking or busted account sitting at rank 1 (e.g. everyone else is
  // also inactive) shouldn't get a celebratory glow layered on top of a
  // dashed "you're slacking"/"busted" state.
  const isChampion = rank === 1 && !isBusted && !entry.isSlacking;

  // The very last "gone quiet" row gets a literal tombstone instead of
  // just fading — everyone above it in that tier decays progressively
  // (smaller, greyer, mossier) the closer they get to it.
  if (isLastSlacker) {
    return (
      <Tombstone entry={entry} rank={rank} roomId={roomId} todayKey={todayKey} />
    );
  }

  // 0 = barely decayed (top of the "gone quiet" tier), approaching 1 as
  // it nears the tombstone at the bottom of that tier.
  const decayT =
    slackIndex === -1
      ? 0
      : slackerCount > 1
      ? slackIndex / (slackerCount - 1)
      : 0;
  const isDecaying = slackIndex !== -1;

  let slackerLine: string;
  if (daysSince === null) {
    slackerLine = "Never logged a single rep";
  } else if (daysSince >= 14) {
    slackerLine = `Missing for ${daysSince} days. Presumed hibernating.`;
  } else {
    slackerLine = `Last seen ${daysSince}d ago`;
  }

  const cardStyle: React.CSSProperties | undefined = isDecaying
    ? {
        opacity: lerp(1, 0.6, decayT),
        transform: `scale(${lerp(1, 0.92, decayT)}) rotate(${lerp(
          0,
          -3,
          decayT
        )}deg)`,
      }
    : undefined;

  const inner = (
    <div
      style={cardStyle}
      className={`relative flex items-center gap-3 rounded-2xl border px-4 transition active:scale-[0.99] ${
        isChampion ? "champion-row py-5" : "py-4"
      } ${
        isBusted
          ? "border-dashed border-amber-500/50 bg-amber-500/10"
          : isDecaying
          ? "border-dashed border-border bg-surface-2/60"
          : isChampion
          ? "border-transparent"
          : entry.isMe
          ? "border-accent/40 bg-accent/5"
          : "border-border bg-surface active:bg-surface-2"
      }`}
    >
      {isChampion && (
        <>
          {/* soft gold sunburst-style glow behind the whole card */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-6 -inset-y-8 -z-10 rounded-[2.5rem] bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.28),transparent_70%)] blur-xl"
          />
          {/* CHAMPION ribbon */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-3.5 py-1 text-[9px] font-bold tracking-[0.2em] text-white shadow-sm"
          >
            CHAMPION
          </div>
        </>
      )}

      {isDecaying && decayT > 0.15 && (
        <>
          <MossBlob className="pointer-events-none absolute bottom-1 left-1 opacity-80" />
          {decayT > 0.5 && (
            <MossBlob className="pointer-events-none absolute right-1 top-1 scale-75 opacity-70" />
          )}
        </>
      )}

      <div
        className={`flex w-6 shrink-0 items-center justify-center text-sm font-medium ${
          isChampion ? "text-amber-500" : "text-muted"
        }`}
      >
        {isChampion ? (
          <Crown size={18} className="fill-amber-400 text-amber-500" />
        ) : (
          rank
        )}
      </div>

      <div className="relative shrink-0">
        {isChampion && (
          <>
            <Laurel side="left" />
            <Laurel side="right" />
          </>
        )}
        <div
          className={`flex items-center justify-center rounded-full font-semibold ${
            isChampion
              ? "h-14 w-14 text-lg bg-gradient-to-br from-amber-300 to-amber-500 text-white ring-2 ring-amber-300/60 ring-offset-2 ring-offset-surface"
              : "h-10 w-10 text-sm"
          } ${
            isBusted || isDecaying
              ? "bg-surface-2 opacity-40 grayscale"
              : !isChampion
              ? "bg-surface-2"
              : ""
          }`}
        >
          {isDecaying && decayT > 0.5 ? (
            <Skull size={16} />
          ) : (
            (entry.profile.display_name ?? entry.profile.username ?? "?")
              .charAt(0)
              .toUpperCase()
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p
            className={`truncate font-medium ${
              isChampion ? "text-base" : ""
            } ${
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
              {entry.usedStreakFreeze && (
                <span title="A missed day was covered by a streak freeze">
                  ❄️
                </span>
              )}
            </>
          )}
        </p>
        {isChampion && <ChampionStars />}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex flex-col items-end">
          <span
            className={`font-semibold leading-none ${
              isChampion ? "text-2xl" : "text-lg"
            } ${
              isBusted
                ? "text-amber-600 dark:text-amber-400"
                : isChampion
                ? "text-amber-500"
                : ""
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
