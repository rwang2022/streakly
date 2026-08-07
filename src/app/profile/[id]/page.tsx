import Link from "next/link";
import { ArrowLeft, Flame, Dumbbell, Mountain, PersonStanding, Zap, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { computeScore } from "@/lib/scoring";
import { BottomNav } from "@/components/BottomNav";
import type { Activity } from "@/lib/types";
import { daysAgoIso } from "@/lib/date";

const WEEKS = 12;
const DAY_MS = 86400000;

const ICONS: Record<string, React.ReactNode> = {
  gym: <Dumbbell size={16} />,
  hike: <Mountain size={16} />,
  walk: <PersonStanding size={16} />,
  run: <Zap size={16} />,
  other: <Sparkles size={16} />,
};

function dateKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (!profile) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="text-muted">This person couldn&apos;t be found.</p>
        <Link href="/leaderboard" className="mt-4 text-sm text-accent">
          Back to leaderboard
        </Link>
      </main>
    );
  }

  const since = daysAgoIso(WEEKS * 7);
  const { data } = await supabase
    .from("activities")
    .select("*")
    .eq("user_id", id)
    .gte("logged_at", since)
    .order("logged_at", { ascending: false });

  const activities = (data ?? []) as Activity[];
  const noAccess = activities.length === 0 && user?.id !== id;
  const scoreResult = computeScore(activities);
  const activeDates = new Set(activities.map((a) => dateKey(a.logged_at)));

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
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
    <main className="min-h-dvh px-6 pb-28 pt-10">
      <div className="mx-auto max-w-md">
        <Link
          href="/leaderboard"
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
            <div className="mt-6 grid grid-cols-3 gap-3">
              <Stat label="Score" value={String(scoreResult.score)} />
              <Stat
                label="Streak"
                value={`${scoreResult.currentStreak}d`}
                icon={<Flame size={13} className="text-accent" />}
              />
              <Stat label="Active/30d" value={String(scoreResult.activeDaysLast30)} />
            </div>

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
                      {new Date(a.logged_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
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
