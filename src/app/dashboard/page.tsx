import Link from "next/link";
import { Flame, Plus } from "lucide-react";
import { getLeaderboard } from "@/lib/leaderboard";
import { ScoreRing } from "@/components/ScoreRing";
import { BottomNav } from "@/components/BottomNav";

export default async function DashboardPage() {
  const { entries, me } = await getLeaderboard();
  const mine = entries.find((e) => e.isMe);
  const rank = mine ? entries.findIndex((e) => e.isMe) + 1 : null;

  return (
    <main className="min-h-dvh px-6 pb-28 pt-10">
      <div className="mx-auto max-w-md">
        <p className="text-sm text-muted">Welcome back</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {me?.display_name ?? `@${me?.username ?? ""}`}
        </h1>

        <div className="mt-8 flex flex-col items-center rounded-3xl border border-border bg-surface p-8 shadow-sm">
          <ScoreRing score={mine?.score ?? 0} />

          <div className="mt-6 grid w-full grid-cols-2 gap-3">
            <Stat
              icon={<Flame size={16} className="text-accent" />}
              label="Current streak"
              value={`${mine?.currentStreak ?? 0}d`}
            />
            <Stat
              label="Rank in group"
              value={rank ? `#${rank} of ${entries.length}` : "—"}
            />
          </div>
        </div>

        <Link
          href="/log"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-5 py-4 font-medium text-background shadow-sm transition active:scale-[0.98]"
        >
          <Plus size={18} />
          Log activity
        </Link>

        {mine?.isSlacking && (
          <p className="mt-4 text-center text-sm text-muted">
            No activity in a few days — your streak is waiting on you.
          </p>
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
    <div className="rounded-2xl bg-surface-2 px-4 py-3 text-center">
      <div className="flex items-center justify-center gap-1.5 text-lg font-semibold">
        {icon}
        {value}
      </div>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}
