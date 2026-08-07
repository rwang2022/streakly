import { createClient } from "@/lib/supabase/server";
import { computeScore } from "@/lib/scoring";
import type { Activity, LeaderboardEntry, Profile, Room } from "@/lib/types";

const LOOKBACK_DAYS = 90;

/**
 * Leaderboard entries for either the caller's friends (default) or a
 * specific room's members (pass roomId).
 */
export async function getLeaderboard(roomId?: string): Promise<{
  entries: LeaderboardEntry[];
  me: Profile | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { entries: [], me: null };

  let memberIds: string[];

  if (roomId) {
    const { data: memberships } = await supabase
      .from("room_memberships")
      .select("user_id")
      .eq("room_id", roomId);
    memberIds = Array.from(
      new Set([user.id, ...((memberships ?? []).map((m) => m.user_id))])
    );
  } else {
    const { data: friendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    const friendIds = (friendships ?? []).map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );
    memberIds = Array.from(new Set([user.id, ...friendIds]));
  }

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

/** Rooms the current user has joined, with member counts. */
export async function getMyRooms(): Promise<Room[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase
    .from("room_memberships")
    .select("room_id")
    .eq("user_id", user.id);

  const roomIds = (memberships ?? []).map((m) => m.room_id);
  if (roomIds.length === 0) return [];

  const [{ data: rooms }, { data: allMemberships }] = await Promise.all([
    supabase.from("rooms").select("*").in("id", roomIds),
    supabase.from("room_memberships").select("room_id").in("room_id", roomIds),
  ]);

  const counts = new Map<string, number>();
  for (const m of allMemberships ?? []) {
    counts.set(m.room_id, (counts.get(m.room_id) ?? 0) + 1);
  }

  return ((rooms ?? []) as Room[])
    .map((r) => ({ ...r, memberCount: counts.get(r.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
