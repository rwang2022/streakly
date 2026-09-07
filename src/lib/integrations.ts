import type { ActivityType } from "@/lib/types";

// Mirrors the activities_logged_at_reasonable CHECK (migration 5): a
// workout more than 24h old can't be inserted, and one dated in the
// future is clock skew. Either way the ingest route skips it rather than
// erroring, so a Shortcut firing on a stale workout doesn't retry-loop.
export const INGEST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const INGEST_FUTURE_SKEW_MS = 5 * 60 * 1000;

const VALID_TYPES: ActivityType[] = ["gym", "hike", "walk", "run", "other"];
const MAX_NOTE_LENGTH = 100;
const MAX_DURATION_MINUTES = 1000;

/** Hex SHA-256 of a raw token. Only the hash is ever stored. */
export async function hashToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A fresh ingest token: `strk_` + 32 random bytes, URL-safe base64. */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `strk_${b64}`;
}

export interface WorkoutRow {
  type: ActivityType;
  duration_minutes: number | null;
  note: string;
  logged_at: string;
  source: string;
  external_id: string;
}

export type NormalizeResult =
  | { ok: true; row: WorkoutRow }
  | { ok: false; status: number; reason: string };

/**
 * Turns the JSON an iOS Shortcut posts for a finished workout into an
 * `activities` insert row (minus `user_id`, which the route fills in).
 *
 * Deliberately lenient about the optional fields — a bad `durationMinutes`
 * becomes `null` rather than failing the whole log — but strict about
 * `startedAt`, since that's what dedupe and the streak calendar hinge on.
 */
export function normalizeWorkout(
  body: unknown,
  now: Date = new Date()
): NormalizeResult {
  const b = (body ?? {}) as Record<string, unknown>;

  const rawStart = b.startedAt ?? b.startDate;
  if (typeof rawStart !== "string" && typeof rawStart !== "number") {
    return { ok: false, status: 400, reason: "missing_startedAt" };
  }
  const started = new Date(rawStart);
  if (Number.isNaN(started.getTime())) {
    return { ok: false, status: 400, reason: "bad_startedAt" };
  }

  const ageMs = now.getTime() - started.getTime();
  if (ageMs > INGEST_MAX_AGE_MS || ageMs < -INGEST_FUTURE_SKEW_MS) {
    // Not an error — just too old (or clock-skewed) to log. 200 so the
    // Shortcut treats it as done and doesn't keep re-sending.
    return { ok: false, status: 200, reason: "outside_window" };
  }

  let duration: number | null = null;
  if (b.durationMinutes != null && b.durationMinutes !== "") {
    const n = Number(b.durationMinutes);
    if (Number.isFinite(n)) {
      duration = Math.min(Math.max(Math.round(n), 0), MAX_DURATION_MINUTES);
    }
  }

  const rawNote = typeof b.note === "string" ? b.note.trim() : "";
  const note = (rawNote || "Strong").slice(0, MAX_NOTE_LENGTH);

  const type: ActivityType = VALID_TYPES.includes(b.type as ActivityType)
    ? (b.type as ActivityType)
    : "gym";

  const iso = started.toISOString();
  return {
    ok: true,
    row: {
      type,
      duration_minutes: duration,
      note,
      logged_at: iso,
      source: "strong",
      external_id: `strong:${iso}`,
    },
  };
}
