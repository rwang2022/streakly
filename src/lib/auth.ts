import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The current user, memoized per request. Several server components on the
 * same page (e.g. the leaderboard page calls both getLeaderboard() and
 * getMyRooms()) each used to independently call supabase.auth.getUser(),
 * which is a network round-trip every time. React's cache() dedupes that
 * down to one call per request, regardless of how many places ask for it.
 */
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getUser();
});
