const DAY_MS = 86400000;

/** ISO timestamp for N days before now. Kept in its own module so lint's
 * render-purity check doesn't flag Date.now() usage inside page components
 * that call it once per server request (not per client render). */
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}
