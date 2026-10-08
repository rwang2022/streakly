const DAY_MS = 86400000;

/** ISO timestamp for N days before now. Kept in its own module so lint's
 * render-purity check doesn't flag Date.now() usage inside page components
 * that call it once per server request (not per client render). Used only
 * as a coarse DB query cutoff (with slack built in), so it doesn't need to
 * be timezone-precise the way display/scoring logic does. */
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/** Cookie the client sets with its IANA timezone (e.g. "America/New_York")
 * so server components — which otherwise only know the server's own
 * timezone (UTC on Vercel), never the visiting user's — can bucket
 * activities into the *user's* calendar days instead of UTC's. */
export const TIMEZONE_COOKIE = "streakly-tz";
export const DEFAULT_TIMEZONE = "UTC";

/**
 * "YYYY-MM-DD" for a given instant, as a calendar date *in the given
 * timezone* — not the server's local time and not UTC. This is the one
 * function that should be used anywhere the app needs to answer "what day
 * did this happen on, for this person."
 */
export function formatDateKey(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which is convenient and avoids hand-rolling
  // the padding/ordering ourselves.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Difference in whole days between two "YYYY-MM-DD" date keys. */
export function daysBetweenDateKeys(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / DAY_MS);
}

/** Human-readable "Aug 14" style label for a timestamp, in the given
 * timezone — a server-rendered equivalent of toLocaleDateString(), which
 * on the server reflects the server's timezone, not the visitor's. */
export function formatDisplayDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

/** Hour of the day (0-23) for an instant, on the clock *in the given
 * timezone*. Used to send each daily reminder at that person's chosen
 * local hour. */
export function localHour(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  return Number(hour) % 24;
}
