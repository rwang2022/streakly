import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE_COOKIE, DEFAULT_TIMEZONE } from "@/lib/date";

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

/**
 * The visiting person's IANA timezone (e.g. "America/New_York"), read from
 * a cookie the client sets on mount. Memoized per request. Falls back to
 * UTC for the very first request before that cookie exists — after that,
 * it's set for every subsequent navigation.
 *
 * Server components only know the *server's* timezone (UTC on Vercel) —
 * without this, day-bucketing for streaks/consistency and "today" itself
 * would silently be computed in UTC instead of the person's actual
 * calendar day, which is exactly what caused activity logged in the
 * evening (US timezones especially) to appear to land on the wrong day.
 */
export const getRequestTimeZone = cache(async (): Promise<string> => {
  const cookieStore = await cookies();
  const tz = cookieStore.get(TIMEZONE_COOKIE)?.value;
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    // Validate it's a real IANA zone before trusting a client-supplied
    // cookie value — Intl throws on garbage input.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
});
