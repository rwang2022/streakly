import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The current user, memoized per request AND read from the local session
 * cookie rather than revalidated against the Auth server.
 *
 * supabase.auth.getUser() makes a real network round-trip to Supabase on
 * every call — that was happening on every single server-rendered page
 * (dashboard, leaderboard, history, profile), on top of the actual data
 * queries, which is exactly what made those pages feel slow compared to
 * client-rendered pages. getSession() reads the already-validated session
 * out of the cookie with no network call. Route access is still gated by
 * middleware, and all real data access is enforced by Postgres row-level
 * security regardless of what this function returns — so this is a safe
 * place to trade "revalidated every time" for "fast," the same trade-off
 * already made in middleware.
 */
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { data: { user: session?.user ?? null } };
});
