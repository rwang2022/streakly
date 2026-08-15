import { createClient } from "@/lib/supabase/server";
import { getCachedUser, getRequestTimeZone } from "@/lib/auth";
import { computeScore } from "@/lib/scoring";
import { detectSuspiciousPattern } from "@/lib/fraud";
import type { Activity, LeaderboardEntry, Profile, Room } from "@/lib/types";

type ScoringActivity = Pick<
  Activity,
  "user_id" | "logged_at" | "duration_minutes" | "created_at"
>;

// 30 days feeds the score (consistency/volume window) plus a small buffer
// so a streak spanning the boundary computes correctly. longestStreak isn't
// shown anywhere in the UI, so there's no need to fetch further back just
// for that — this cuts the typical row count fetched substantially for
// anyone who's been logging for months.
const LOOKBACK_DAYS = 35;

/**
 * Leaderboard entries for either the caller's friends (default) or a
 * specific room's members (pass roomId).
 */
export async function getLeaderboard(roomId?: string): Promise<{
  entries: LeaderboardEntry[];
  me: Profile | null;
}> {
  const supabase = await createClient();
  const [{ data: { user } }, timeZone] = await Promise.all([
    getCachedUser(),
    getRequestTimeZone(),
  ]);

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
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, created_at")
      .in("id", memberIds),
    // Only the columns computeScore()/detectSuspiciousPattern() actually
    // read — type/note/id aren't used and just add payload weight.
    // created_at (distinct from logged_at) is needed for burst detection.
    supabase
      .from("activities")
      .select("user_id, logged_at, duration_minutes, created_at")
      .in("user_id", memberIds)
      .gte(
        "logged_at",
        new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString()
      ),
  ]);

  const activitiesByUser = new Map<string, ScoringActivity[]>();
  for (const a of (activities ?? []) as ScoringActivity[]) {
    const list = activitiesByUser.get(a.user_id) ?? [];
    list.push(a);
    activitiesByUser.set(a.user_id, list);
  }

  const entries: LeaderboardEntry[] = ((profiles ?? []) as Profile[]).map(
    (profile) => {
      const userActivities = activitiesByUser.get(profile.id) ?? [];
      const result = computeScore(userActivities, new Date(), timeZone);
      const suspicion = detectSuspiciousPattern(userActivities, timeZone);
      // Flat -100 penalty, deliberately not clamped back to 0 — the whole
      // point is it visibly wrecks your rank (drops you below everyone,
      // even someone slacking), not just resets you to where a brand new
      // user would start.
      const score = suspicion.suspicious ? result.score - 100 : result.score;
      return {
        profile,
        score,
        consistencyPct: result.consistencyPct,
        currentStreak: result.currentStreak,
        longestStreak: result.longestStreak,
        activeDaysLast30: result.activeDaysLast30,
        isSlacking: result.isSlacking,
        isMe: profile.id === user.id,
        lastActiveDate: result.lastActiveDate,
        isSuspicious: suspicion.suspicious,
        suspicionReason: suspicion.reason,
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
  } = await getCachedUser();
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
