import { describe, it, expect } from "vitest";
import { normalizeWorkout, generateToken, hashToken } from "./integrations";

const NOW = new Date("2026-09-06T18:00:00Z");
const iso = (minsAgo: number) =>
  new Date(NOW.getTime() - minsAgo * 60 * 1000).toISOString();

describe("normalizeWorkout", () => {
  it("maps a fresh workout to a gym activity row", () => {
    const r = normalizeWorkout(
      { startedAt: iso(45), durationMinutes: 45, note: "Strong · Push" },
      NOW
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({
      type: "gym",
      duration_minutes: 45,
      note: "Strong · Push",
      source: "strong",
      logged_at: iso(45),
      external_id: `strong:${iso(45)}`,
    });
  });

  it("rejects a missing or unparseable startedAt", () => {
    expect(normalizeWorkout({}, NOW)).toMatchObject({
      ok: false,
      status: 400,
      reason: "missing_startedAt",
    });
    expect(
      normalizeWorkout({ startedAt: "not a date" }, NOW)
    ).toMatchObject({ ok: false, status: 400, reason: "bad_startedAt" });
  });

  it("skips (200) a workout older than 24h or in the future", () => {
    expect(
      normalizeWorkout({ startedAt: iso(25 * 60) }, NOW)
    ).toMatchObject({ ok: false, status: 200, reason: "outside_window" });
    expect(
      normalizeWorkout({ startedAt: iso(-30) }, NOW)
    ).toMatchObject({ ok: false, status: 200, reason: "outside_window" });
  });

  it("allows a workout right at the edge of the window and small future skew", () => {
    expect(normalizeWorkout({ startedAt: iso(23 * 60 + 59) }, NOW).ok).toBe(true);
    expect(normalizeWorkout({ startedAt: iso(-2) }, NOW).ok).toBe(true);
  });

  it("clamps or nulls a bad duration instead of failing", () => {
    const cases: [unknown, number | null][] = [
      [-5, 0],
      [5000, 1000],
      ["45", 45],
      ["", null],
      [null, null],
      [undefined, null],
      ["abc", null],
      [30.7, 31],
    ];
    for (const [input, expected] of cases) {
      const r = normalizeWorkout(
        { startedAt: iso(10), durationMinutes: input },
        NOW
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.row.duration_minutes).toBe(expected);
    }
  });

  it("defaults and truncates the note", () => {
    const blank = normalizeWorkout({ startedAt: iso(10) }, NOW);
    expect(blank.ok && blank.row.note).toBe("Strong");

    const long = normalizeWorkout(
      { startedAt: iso(10), note: "x".repeat(500) },
      NOW
    );
    expect(long.ok && long.row.note.length).toBe(100);
  });

  it("forces type to gym unless a valid activity type is given", () => {
    const bad = normalizeWorkout(
      { startedAt: iso(10), type: "powerlifting" },
      NOW
    );
    expect(bad.ok && bad.row.type).toBe("gym");

    const ok = normalizeWorkout({ startedAt: iso(10), type: "run" }, NOW);
    expect(ok.ok && ok.row.type).toBe("run");
  });

  it("derives the same external_id regardless of ISO precision", () => {
    const a = normalizeWorkout(
      { startedAt: "2026-09-06T17:30:00Z" },
      NOW
    );
    const b = normalizeWorkout(
      { startedAt: "2026-09-06T17:30:00.000Z" },
      NOW
    );
    expect(a.ok && b.ok && a.row.external_id).toBe(
      b.ok ? b.row.external_id : ""
    );
  });
});

describe("tokens", () => {
  it("generates a prefixed, URL-safe token", () => {
    const t = generateToken();
    expect(t).toMatch(/^strk_[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThan(20);
    expect(generateToken()).not.toBe(t);
  });

  it("hashes deterministically to 64 hex chars", async () => {
    const h1 = await hashToken("strk_abc");
    const h2 = await hashToken("strk_abc");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken("strk_different")).not.toBe(h1);
  });
});
