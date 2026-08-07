import { createClient } from "@/lib/supabase/server";
import { computeScore } from "@/lib/scoring";
import type { Activity, LeaderboardEntry, Profile } from "@/lib/types";

const LOOKBACK_DAYS = 90;

export async function getLeaderboard(): Promise<{
  entries: LeaderboardEntry[];
  me: Profile | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { entries: [], me: null };

  const { data: friendships } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const friendIds = (friendships ?? []).map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  );
  const memberIds = Array.from(new Set([user.id, ...friendIds]));

  const [{ data: profiles }, { data: activities }] = await Promise.all([
    supabase.from("profiles").select("*").in("id", memberIds),
    supabase
      .from("activities")
      .select("id, user_id, type, duration_minutes, note, logged_at, created_at")
      .in("user_id", memberIds)
      .gte(
        "logged_at",
        new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString()
      ),
  ]);

  const activitiesByUser = new Map<string, Activity[]>();
  for (const a of (activities ?? []) as Activity[]) {
    const list = activitiesByUser.get(a.user_id) ?? [];
    list.push(a);
    activitiesByUser.set(a.user_id, list);
  }

  const entries: LeaderboardEntry[] = ((profiles ?? []) as Profile[]).map(
    (profile) => {
      const result = computeScore(activitiesByUser.get(profile.id) ?? []);
      return {
        profile,
        score: result.score,
        consistencyPct: result.consistencyPct,
        currentStreak: result.currentStreak,
        longestStreak: result.longestStreak,
        activeDaysLast30: result.activeDaysLast30,
        isSlacking: result.isSlacking,
        isMe: profile.id === user.id,
      };
    }
  );

  entries.sort((a, b) => b.score - a.score);

  const me = ((profiles ?? []) as Profile[]).find((p) => p.id === user.id) ?? null;

  return { entries, me };
}
