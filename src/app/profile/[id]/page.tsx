import Link from "next/link";
import { ArrowLeft, Flag, Flame, Handshake, Dumbbell, Mountain, PersonStanding, Zap, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser, getRequestTimeZone } from "@/lib/auth";
import { computeScore } from "@/lib/scoring";
import { detectSuspiciousPattern } from "@/lib/fraud";
import { getAdminUserIds, isVouchFresh } from "@/lib/vouches";
import { getBadge } from "@/lib/badges";
import { BottomNav } from "@/components/BottomNav";
import { VouchButton } from "@/components/VouchButton";
import type { Activity } from "@/lib/types";
import { daysAgoIso, formatDateKey, formatDisplayDate } from "@/lib/date";

const WEEKS = 12;
const DAY_MS = 86400000;

const ICONS: Record<string, React.ReactNode> = {
  gym: <Dumbbell size={16} />,
  hike: <Mountain size={16} />,
  walk: <PersonStanding size={16} />,
  run: <Zap size={16} />,
  other: <Sparkles size={16} />,
};

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ room?: string }>;
}) {
  const { id } = await params;
  const { room: roomId } = await searchParams;
  const backHref = roomId ? `/leaderboard?room=${roomId}` : "/leaderboard";
  const supabase = await createClient();

  const [{ data: { user } }, timeZone] = await Promise.all([
    getCachedUser(),
    getRequestTimeZone(),
  ]);

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (!profile) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="text-muted">This person couldn&apos;t be found.</p>
        <Link href={backHref} className="mt-4 text-sm text-accent">
          Back to leaderboard
        </Link>
      </main>
    );
  }

  const since = daysAgoIso(WEEKS * 7);
  const isSelf = user?.id === id;

  // Whether we're even allowed to see this person's activity is a real
  // relationship check (friends or shared room), not something you can
  // infer from an empty activities array — someone you're genuinely
  // friends with might just not have logged anything yet, which looks
  // identical to "blocked by RLS" if you only look at row count.
  let hasAccess = isSelf;
  if (!isSelf && user) {
    const [{ data: isFriend }, { data: sharesRoom }] = await Promise.all([
      supabase.rpc("is_friend", { a: user.id, b: id }),
      supabase.rpc("share_room", { a: user.id, b: id }),
    ]);
    hasAccess = Boolean(isFriend) || Boolean(sharesRoom);
  }

  const { data } = hasAccess
    ? await supabase
        .from("activities")
        .select("*")
        .eq("user_id", id)
        .gte("logged_at", since)
        .order("logged_at", { ascending: false })
    : { data: [] as Activity[] };

  const activities = (data ?? []) as Activity[];
  const noAccess = !hasAccess;
  const scoreResult = computeScore(activities, new Date(), timeZone);
  const suspicion = detectSuspiciousPattern(activities, timeZone);

  // Has a friend/roommate vouched this is real? Only matters if something
  // was actually flagged. Fetched as raw rows (not just a boolean) so we
  // can also tell whether *this viewer* is the one who vouched, for the
  // button's state, and who to credit in the banner below.
  const { data: vouchRows } =
    hasAccess && suspicion.suspicious
      ? await supabase
          .from("activity_vouches")
          .select("vouched_by, created_at")
          .eq("user_id", id)
      : { data: [] as { vouched_by: string; created_at: string }[] };
  const activeVouches = (vouchRows ?? []).filter((v) => isVouchFresh(v.created_at));
  // Anyone can vouch and everyone who has is shown/credited below, but only
  // an admin's vouch actually lifts the penalty — see lib/vouches.ts.
  const adminIds = suspicion.suspicious ? await getAdminUserIds() : new Set<string>();
  const isVouched = activeVouches.some((v) => adminIds.has(v.vouched_by));
  const myVouch = activeVouches.some((v) => v.vouched_by === user?.id);
  const hasNonAdminVouches = activeVouches.length > 0 && !isVouched;

  const voucherIds = activeVouches.map((v) => v.vouched_by);
  const { data: voucherProfiles } =
    voucherIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, username")
          .in("id", voucherIds)
      : { data: [] as { id: string; display_name: string | null; username: string | null }[] };
  const voucherNames = (voucherProfiles ?? [])
    .map((p) => p.display_name ?? `@${p.username}`)
    .join(", ");

  // Same flat -100 penalty applied on the leaderboard, uncapped so it can
  // go negative — see lib/leaderboard.ts for the rationale. Suppressed only
  // once an admin specifically has vouched — a pile of non-admin vouches
  // alone still leaves the flag (and penalty) in place.
  const displayScore =
    suspicion.suspicious && !isVouched
      ? scoreResult.score - 100
      : scoreResult.score;
  const activeDates = new Set(
    activities.map((a) => formatDateKey(new Date(a.logged_at), timeZone))
  );

  const todayKey = formatDateKey(new Date(), timeZone);
  const today = new Date(`${todayKey}T00:00:00Z`);
  const startOffset = today.getUTCDay();
  const gridStart = new Date(
    today.getTime() - (WEEKS * 7 - 1 + startOffset) * DAY_MS
  );

  const columns: { key: string; active: boolean; isFuture: boolean }[][] = [];
  for (let w = 0; w < WEEKS + 1; w++) {
    const col: { key: string; active: boolean; isFuture: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart.getTime() + (w * 7 + d) * DAY_MS);
      const key = date.toISOString().slice(0, 10);
      col.push({
        key,
        active: activeDates.has(key),
        isFuture: date.getTime() > today.getTime(),
      });
    }
    columns.push(col);
  }

  return (
    <main className="min-h-dvh px-6 pb-32 pt-10">
      <div className="mx-auto max-w-md">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted"
        >
          <ArrowLeft size={16} /> Back
        </Link>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-semibold">
            {(profile.display_name ?? profile.username ?? "?")
              .charAt(0)
              .toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {profile.display_name ?? `@${profile.username}`}
            </h1>
            {profile.username && (
              <p className="text-sm text-muted">@{profile.username}</p>
            )}
          </div>
        </div>

        {noAccess ? (
          <p className="mt-8 text-sm text-muted">
            You need to be friends or share a room with this person to see
            their activity.
          </p>
        ) : (
          <>
            <div className="mt-6 flex items-center justify-center">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  suspicion.suspicious && !isVouched
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : suspicion.suspicious && isVouched
                    ? "bg-success/15 text-success"
                    : scoreResult.isSlacking
                    ? "bg-accent-2/15 text-accent-2"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {
                  getBadge({
                    ...scoreResult,
                    isSuspicious: suspicion.suspicious,
                    isVouched,
                  }).emoji
                }{" "}
                {
                  getBadge({
                    ...scoreResult,
                    isSuspicious: suspicion.suspicious,
                    isVouched,
                  }).label
                }
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="Score" value={String(displayScore)} />
              <Stat
                label={scoreResult.usedStreakFreeze ? "Streak ❄️" : "Streak"}
                value={`${scoreResult.currentStreak}d`}
                icon={<Flame size={13} className="text-accent" />}
              />
              <Stat label="Active/30d" value={String(scoreResult.activeDaysLast30)} />
            </div>

            {suspicion.suspicious && !isVouched && (
              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                <Flag size={14} className="mt-0.5 shrink-0" />
                <p>
                  <span className="font-medium">-100 penalty applied:</span>{" "}
                  {suspicion.reason}. Score would&apos;ve been{" "}
                  {scoreResult.score} — flagged patterns like this tank it
                  instead. Not proof of anything, just a heads up to friends.{" "}
                  {hasNonAdminVouches
                    ? `Vouched for by ${voucherNames}, but only an admin's vouch clears it.`
                    : "Only an admin's vouch clears it."}
                </p>
              </div>
            )}

            {suspicion.suspicious && isVouched && (
              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-xs text-success">
                <Handshake size={14} className="mt-0.5 shrink-0" />
                <p>
                  <span className="font-medium">Penalty cleared:</span>{" "}
                  {suspicion.reason}, but vouched for by{" "}
                  {voucherNames || "an admin"}. Score stayed at{" "}
                  {scoreResult.score}.
                </p>
              </div>
            )}

            {hasAccess && !isSelf && suspicion.suspicious && (
              <VouchButton targetUserId={id} initiallyVouched={myVouch} />
            )}

            <p className="mt-8 text-sm font-medium text-muted">
              Last {WEEKS} weeks
            </p>
            <div className="mt-2 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-4">
              {columns.map((col, i) => (
                <div key={i} className="flex flex-col gap-1">
                  {col.map((day) =>
                    day.isFuture ? (
                      <div key={day.key} className="h-3 w-3" />
                    ) : (
                      <div
                        key={day.key}
                        title={day.key}
                        className={`h-3 w-3 rounded-[3px] ${
                          day.active ? "bg-accent" : "bg-surface-2"
                        }`}
                      />
                    )
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-2">
              {activities.length === 0 && (
                <p className="text-sm text-muted">No activity logged yet.</p>
              )}
              {activities.slice(0, 30).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-accent">
                    {ICONS[a.type]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium capitalize">{a.type}</p>
                    <p className="truncate text-xs text-muted">
                      {formatDisplayDate(a.logged_at, timeZone)}
                      {a.duration_minutes ? ` · ${a.duration_minutes} min` : ""}
                      {a.note ? ` · ${a.note}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </main>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3 py-3 text-center">
      <div className="flex items-center justify-center gap-1 text-lg font-semibold">
        {icon}
        {value}
      </div>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
    </div>
  );
}
