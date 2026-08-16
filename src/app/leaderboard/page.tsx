import Link from "next/link";
import { Crown, Flag, Flame, Settings2, Skull, Star } from "lucide-react";
import { getLeaderboard, getMyRooms } from "@/lib/leaderboard";
import { BottomNav } from "@/components/BottomNav";
import { ScoreInfo } from "@/components/ScoreInfo";
import { ShareRankButton } from "@/components/ShareRankButton";
import {
  ShareLeaderboardButton,
  type ShareLeaderboardRow,
} from "@/components/ShareLeaderboardButton";
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

  // Precomputed once so both the header share button and each Row can
  // reuse the same status logic without repeating it inline.
  const shareRows: ShareLeaderboardRow[] = entries.map((entry, i) => {
    const rank = i + 1;
    const isBusted = entry.isSuspicious && !entry.isVouched;
    const isChampion = rank === 1 && !isBusted && !entry.isSlacking;
    const status: ShareLeaderboardRow["status"] = isChampion
      ? "champion"
      : isBusted
      ? "busted"
      : entry.isSlacking
      ? "slacking"
      : "normal";
    return {
      rank,
      name: entry.profile.display_name ?? `@${entry.profile.username}`,
      score: entry.score,
      status,
      isMe: entry.isMe,
    };
  });

  // Rows that have "gone quiet" (but weren't caught gaming the system —
  // that's its own separate red-flag treatment, not part of the graveyard).
  // These decay progressively the further down the pack they are, and the
  // very last one gets a literal tombstone instead of just fading out.
  const slackerEntries = entries.filter(
    (e) => e.isSlacking && !(e.isSuspicious && !e.isVouched)
  );

  return (
    <main className="min-h-dvh px-6 pb-32 pt-[calc(env(safe-area-inset-top)+2.5rem)] md:pb-10 md:pl-72">
      <div className="mx-auto max-w-md md:max-w-2xl">
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
          <div className="flex shrink-0 items-center gap-2">
            {entries.length > 0 && (
              <ShareLeaderboardButton
                title={activeRoom ? activeRoom.name : "Friends"}
                rows={shareRows}
              />
            )}
            <Link
              href="/rooms"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted"
              aria-label="Manage rooms"
            >
              <Settings2 size={16} />
            </Link>
          </div>
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

        {/* Extra top room (vs. a plain mt-9) so the big crown above the
            champion row has clearance above it without colliding with the
            room-switcher tabs — verified against a scaled mockup. */}
        <div className="mt-28 space-y-2">
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

function MossBlob({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width="20"
      height="15"
      viewBox="0 0 20 15"
      className={className}
      style={style}
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

// A real laurel wreath graphic ("Gold Laurel Wreath" by Arvin61r58 via
// Openclipart, CC0 — see public/laurel-wreath.svg) instead of a
// hand-drawn approximation. Sized and offset against composited test
// renders at the actual 88px avatar size: the wreath's natural gap sits
// at the top (for the crown above it) and its small joining ornament
// sits just past the avatar's bottom edge.
function Laurel() {
  return (
    <img
      src="/laurel-wreath.svg"
      alt=""
      aria-hidden
      className="pointer-events-none absolute select-none max-w-none"
      // Tailwind's preflight sets `img { max-width: 100% }`, which — since
      // this img's containing block is the 88px avatar wrapper, not the
      // page — would otherwise cap this down to 88px regardless of the
      // width set below. max-w-none overrides that.
      //
      // 140/-26/-28 (re-verified at 4x scale, not just a small preview —
      // the first pass at 190/-51/-54 looked snug in a small composite
      // but left a real gap around the avatar and overlapped neighboring
      // elements) puts the avatar snugly inside the wreath's ring with
      // leaves just overlapping its edge, matching a real wreath.
      style={{ width: 140, left: -26, top: -28 }}
    />
  );
}

// A big decorative crown floating above the CHAMPION ribbon — separate
// from the small rank-slot crown icon, which stays as the plain "this is
// rank 1" indicator. Sized and positioned against a verified mockup so it
// clears the room-switcher tabs above it instead of colliding with them.
function BigCrown() {
  return (
    <svg
      viewBox="-40 -30 80 60"
      aria-hidden
      className="pointer-events-none absolute -top-[86px] left-1/2 h-[68px] w-[68px] -translate-x-1/2 -z-10"
    >
      <path
        d="M -30 22 L -35 -12 L -14 8 L 0 -26 L 14 8 L 35 -12 L 30 22 Z"
        fill="#f6a623"
        stroke="#c9860a"
        strokeWidth="2"
      />
      <rect x="-30" y="18" width="60" height="7" rx="2" fill="#c9860a" />
      <circle cx="-35" cy="-12" r="5.5" fill="#ffd60a" />
      <circle cx="0" cy="-26" r="7" fill="#ffd60a" />
      <circle cx="35" cy="-12" r="5.5" fill="#ffd60a" />
      <circle cx="0" cy="9" r="4.5" fill="#ff453a" />
      <circle cx="-17" cy="15" r="3.2" fill="#30d158" />
      <circle cx="17" cy="15" r="3.2" fill="#0a84ff" />
    </svg>
  );
}

function ChampionStars() {
  return (
    <div className="mt-1.5 flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={13} className="fill-amber-400 text-amber-500" />
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
    <div className="relative flex flex-col items-center pb-4 pt-6">
      <span className="text-[10px] font-medium text-muted">#{rank}</span>

      <div className="absolute right-2 top-4">
        <ShareRankButton
          variant="tombstone"
          name={name}
          rank={rank}
          score={entry.score}
          subtitle={epitaph}
        />
      </div>

      <div className="relative mt-4 flex flex-col items-center">
        {/* bigger cross above the stone */}
        <div className="relative h-6 w-6">
          <div className="absolute left-1/2 top-0 h-6 w-[7px] -translate-x-1/2 rounded-sm bg-border" />
          <div className="absolute left-1/2 top-[7px] h-[7px] w-6 -translate-x-1/2 rounded-sm bg-border" />
        </div>

        {/* headstone — bigger, with a weathered stone texture and cracks */}
        <div
          className="relative -mt-px w-72 rounded-t-[5.5rem] rounded-b-lg border-2 border-border px-5 pb-4 pt-8 text-center shadow-md active:scale-[0.99]"
          style={{
            background:
              "radial-gradient(ellipse at 35% 25%, var(--surface) 0%, var(--surface-2) 100%)",
          }}
        >
          {/* crack lines etched into the stone */}
          <svg
            aria-hidden
            viewBox="0 0 288 190"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
          >
            <path
              d="M 90 40 L 104 68 L 96 90"
              fill="none"
              stroke="currentColor"
              className="text-muted"
              strokeWidth="1.5"
            />
            <path
              d="M 210 70 L 200 96"
              fill="none"
              stroke="currentColor"
              className="text-muted"
              strokeWidth="1.5"
            />
          </svg>

          <MossBlob className="absolute -left-2 bottom-3 scale-125" />
          <MossBlob className="absolute -right-2 top-14 scale-110 scale-x-[-1]" />
          <MossBlob className="absolute left-10 -top-1 scale-90 opacity-90" />
          <MossBlob className="absolute right-12 bottom-2 scale-100 opacity-90" />

          <p className="font-serif text-sm font-bold tracking-[0.35em] text-muted">
            R.I.P.
          </p>
          <div className="mx-auto mt-2 h-px w-20 bg-border" />
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <Skull size={17} className="shrink-0 text-muted" />
            <p className="truncate text-base font-bold text-muted line-through decoration-muted/60">
              {name}
              {entry.isMe && (
                <span className="ml-1 text-xs font-normal no-underline text-muted">
                  (you)
                </span>
              )}
            </p>
          </div>
          <p className="mt-1.5 text-xs text-muted/80">{epitaph}</p>
          <p className="mt-2.5 text-sm font-semibold text-muted">
            {entry.score} pts
          </p>
        </div>

        {/* ground shadow */}
        <div className="mt-1 h-3 w-56 rounded-full bg-black/15 blur-[3px] dark:bg-black/50" />
        <MossBlob className="-mt-3 scale-125 opacity-90" />
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

  // Verified against a scaled mockup (including the real slacker-count
  // math, not just an isolated 4-row test) that -12deg/0.45 opacity still
  // leaves a clean gap above the tombstone instead of overlapping it.
  const cardStyle: React.CSSProperties | undefined = isDecaying
    ? {
        transformOrigin: "center",
        opacity: lerp(1, 0.45, decayT),
        transform: `scale(${lerp(1, 0.6, decayT)}) rotate(${lerp(
          0,
          -12,
          decayT
        )}deg)`,
      }
    : undefined;

  // More moss the further decayed a row is — starts almost immediately
  // and piles up fast, so by the time a row is nearing the tombstone
  // it's nearly overgrown rather than just lightly spotted.
  const mossCount = decayT > 0.05 ? Math.min(5, 1 + Math.floor(decayT * 6)) : 0;
  const mossScale = lerp(0.75, 1.35, decayT);

  const inner = (
    <div
      style={cardStyle}
      className={`relative flex items-center gap-3 rounded-2xl border px-4 transition active:scale-[0.99] ${
        isChampion ? "champion-row py-7" : "py-4"
      } ${
        isBusted
          ? "border-2 border-accent bg-accent/10"
          : isDecaying
          ? "border-dashed border-border bg-surface-2/60"
          : isChampion
          ? "border-transparent"
          : entry.isMe
          ? "border-accent/40 bg-accent/5"
          : "border-border bg-surface active:bg-surface-2"
      }`}
    >
      {isBusted && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1.5 text-[10px] font-bold tracking-[0.2em] text-white shadow-sm"
          >
            DISGRACED
          </div>
          {/* fracture lines spreading across the whole card, like the
              tombstone's crack accents — "broken", not just flagged */}
          <svg
            aria-hidden
            viewBox="0 0 300 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full text-accent opacity-25"
          >
            <path
              d="M 60 0 L 52 22 L 68 34 L 48 52 L 66 66 L 40 100"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M 150 8 L 165 30 L 145 46 L 172 70"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M 230 0 L 218 20 L 238 40 L 210 58 L 232 100"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </>
      )}

      {isChampion && (
        <>
          {/* soft gold glow, sized to fit inside the row's own gap so it
              doesn't fight neighboring cards for paint order */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-8 -inset-y-3 -z-10 rounded-[2.5rem] blur-lg"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(245,158,11,0.45) 0%, rgba(245,158,11,0.15) 45%, transparent 75%)",
            }}
          />
          {/* literal sunburst rays fanning out from behind the big crown —
              short rays in a viewBox close to real px, verified against a
              scaled mockup so they stay contained above the card instead
              of shooting off past the tab bar */}
          <svg
            aria-hidden
            viewBox="0 0 200 66"
            className="pointer-events-none absolute -top-16 left-0 h-16 w-full -z-10"
          >
            {Array.from({ length: 15 }).map((_, i) => {
              const angle = -160 + i * (320 / 14);
              const rad = (angle * Math.PI) / 180;
              const x1 = 100;
              const y1 = 60;
              const x2 = x1 + Math.cos(rad) * 30;
              const y2 = y1 + Math.sin(rad) * 30;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#f5b942"
                  strokeWidth={i % 2 === 0 ? 2.2 : 1.2}
                  opacity={i % 2 === 0 ? 0.55 : 0.3}
                />
              );
            })}
          </svg>
          <BigCrown />
          {/* CHAMPION ribbon */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-1.5 text-[10px] font-bold tracking-[0.2em] text-white shadow-sm"
          >
            CHAMPION
          </div>
        </>
      )}

      {mossCount > 0 && (
        <>
          {Array.from({ length: mossCount }).map((_, mi) => (
            <MossBlob
              key={mi}
              className="pointer-events-none absolute bottom-1 opacity-85"
              style={{
                left: `${8 + mi * (74 / Math.max(mossCount - 1, 1))}%`,
                bottom: mi % 2 === 0 ? "2px" : "10px",
                transform: `scale(${mossScale})`,
              }}
            />
          ))}
          {decayT > 0.35 && (
            <MossBlob
              className="pointer-events-none absolute right-1 top-1 opacity-75"
              style={{ transform: `scale(${mossScale * 0.7})` }}
            />
          )}
          {decayT > 0.6 && (
            <MossBlob
              className="pointer-events-none absolute left-1 top-1 opacity-70"
              style={{ transform: `scale(${mossScale * 0.6}) scaleX(-1)` }}
            />
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

      {/* Extra left margin on champion only: the wreath still overflows
          the avatar by ~26px on each side, which would otherwise sit on
          top of the small rank-slot crown icon just to the left. */}
      <div className={`relative shrink-0 ${isChampion ? "ml-4" : ""}`}>
        <div
          className={`flex items-center justify-center rounded-full font-semibold ${
            isChampion
              ? "h-[88px] w-[88px] text-3xl bg-gradient-to-br from-amber-300 to-amber-500 text-white ring-[3px] ring-amber-300/70 ring-offset-2 ring-offset-surface"
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
        {/* wreath renders after (on top of) the avatar so its leaves
            overlap the avatar's outer edge slightly, like a real wreath */}
        {isChampion && <Laurel />}
        {/* a hard diagonal slash plus shatter cracks across the avatar —
            "struck off" and broken, not just faded — for the
            caught-cheating case */}
        {isBusted && (
          <svg
            aria-hidden
            viewBox="0 0 40 40"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <path
              d="M 14 4 L 17 14 L 10 19 L 20 24 L 15 36"
              fill="none"
              stroke="#7a1a13"
              strokeWidth="1"
              opacity="0.6"
            />
            <path
              d="M 30 10 L 24 18 L 32 24 L 27 33"
              fill="none"
              stroke="#7a1a13"
              strokeWidth="1"
              opacity="0.6"
            />
            <line
              x1="7"
              y1="7"
              x2="33"
              y2="33"
              stroke="#ff453a"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      {/* The wreath overflows the avatar wrapper by ~26px on each side
          (it's absolutely positioned, so flex layout doesn't account for
          it) — extra left margin here on champion only so its right-side
          leaves don't sit on top of the name/streak text. */}
      <div className={`min-w-0 flex-1 ${isChampion ? "ml-4" : ""}`}>
        <div className="flex items-center gap-1.5">
          <p
            className={`truncate font-medium ${
              isChampion ? "text-2xl" : ""
            } ${
              isBusted
                ? "text-accent line-through decoration-accent/70"
                : entry.isSlacking
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
              ? "font-semibold text-accent"
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
              isChampion ? "text-5xl" : "text-lg"
            } ${
              isBusted
                ? "text-accent line-through decoration-accent/70"
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
              ? "bg-accent/20 text-accent"
              : entry.isSlacking
              ? "bg-accent-2/20 text-accent-2"
              : "bg-surface-2 text-muted"
          }`}
        >
          {badge.emoji} {badge.label}
        </span>
      </div>

      <ShareRankButton
        variant={isChampion ? "champion" : isBusted ? "disgraced" : "normal"}
        name={entry.profile.display_name ?? `@${entry.profile.username}`}
        rank={rank}
        score={entry.score}
        subtitle={
          isBusted
            ? "Caught gaming it — score tanked"
            : entry.isSlacking
            ? slackerLine
            : `${entry.currentStreak}d streak · ${entry.activeDaysLast30}/30 active days`
        }
        badgeLabel={badge.label}
        decaying={isDecaying}
      />
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
