import { describe, it, expect } from "vitest";
import { detectSuspiciousPattern } from "./fraud";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const NOW = new Date("2026-08-15T12:00:00Z");
const TZ = "UTC";

function dayEntry(daysAgo: number, durationMinutes: number) {
  const t = new Date(NOW.getTime() - daysAgo * DAY_MS);
  return {
    logged_at: t.toISOString(),
    duration_minutes: durationMinutes,
    created_at: t.toISOString(),
  };
}

function burstEntry(minutesAgo: number, durationMinutes = 20) {
  const t = new Date(NOW.getTime() - minutesAgo * MIN_MS);
  return {
    logged_at: t.toISOString(),
    duration_minutes: durationMinutes,
    created_at: t.toISOString(),
  };
}

describe("detectSuspiciousPattern", () => {
  it("does not flag empty activity", () => {
    expect(detectSuspiciousPattern([], TZ).suspicious).toBe(false);
  });

  it("does not flag normal, varied logging", () => {
    const activities = [
      dayEntry(0, 30),
      dayEntry(1, 45),
      dayEntry(2, 20),
      dayEntry(3, 60),
      dayEntry(4, 15),
    ];
    expect(detectSuspiciousPattern(activities, TZ).suspicious).toBe(false);
  });

  it("does not flag a short run of identical durations", () => {
    // 3 days of the same duration is coincidence, not a pattern.
    const activities = [dayEntry(0, 300), dayEntry(1, 300), dayEntry(2, 300)];
    expect(detectSuspiciousPattern(activities, TZ).suspicious).toBe(false);
  });

  it("does not flag a long identical run if the duration is low/plausible", () => {
    // 10 days of a totally normal 20-minute walk shouldn't be suspicious
    // just because it repeats — only long, hard-to-repeat-for-real
    // durations should count.
    const activities = Array.from({ length: 10 }, (_, i) => dayEntry(i, 20));
    expect(detectSuspiciousPattern(activities, TZ).suspicious).toBe(false);
  });

  it("flags a long run of identical high-duration days (the '300 min x 10 days' case)", () => {
    const activities = Array.from({ length: 10 }, (_, i) => dayEntry(i, 300));
    const result = detectSuspiciousPattern(activities, TZ);
    expect(result.suspicious).toBe(true);
    expect(result.reason).toMatch(/days in a row/);
  });

  it("does not flag a burst of a few activities logged close together", () => {
    // Someone logging 3 real activities back to back (e.g. catching up
    // after a busy week) shouldn't trip the burst detector.
    const activities = [burstEntry(0), burstEntry(1), burstEntry(2)];
    expect(detectSuspiciousPattern(activities, TZ).suspicious).toBe(false);
  });

  it("flags many activities created within a short window", () => {
    // 8 entries all created within a few minutes of each other.
    const activities = Array.from({ length: 8 }, (_, i) => burstEntry(i * 2));
    const result = detectSuspiciousPattern(activities, TZ);
    expect(result.suspicious).toBe(true);
    expect(result.reason).toMatch(/within a .* span/);
  });

  it("does not flag activities spread across a wider window", () => {
    // Same count, but spread over 3 hours instead of a burst.
    const activities = Array.from({ length: 8 }, (_, i) => burstEntry(i * 25));
    expect(detectSuspiciousPattern(activities, TZ).suspicious).toBe(false);
  });
});
