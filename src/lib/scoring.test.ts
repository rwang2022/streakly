import { describe, it, expect } from "vitest";
import { computeScore } from "./scoring";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-15T12:00:00Z");
const TZ = "UTC";

function activityDaysAgo(daysAgo: number, durationMinutes: number | null = 20) {
  const d = new Date(NOW.getTime() - daysAgo * DAY_MS);
  return {
    logged_at: d.toISOString(),
    duration_minutes: durationMinutes,
    created_at: d.toISOString(),
  };
}

describe("computeScore", () => {
  it("returns a zeroed-out, slacking result for no activity at all", () => {
    const result = computeScore([], NOW, TZ);
    expect(result.score).toBe(0);
    expect(result.consistencyPct).toBe(0);
    expect(result.currentStreak).toBe(0);
    expect(result.activeDaysLast30).toBe(0);
    expect(result.isSlacking).toBe(true);
    expect(result.lastActiveDate).toBeNull();
  });

  it("counts today as day 1 of a streak", () => {
    const result = computeScore([activityDaysAgo(0)], NOW, TZ);
    expect(result.currentStreak).toBe(1);
    expect(result.activeDaysLast30).toBe(1);
    expect(result.isSlacking).toBe(false);
  });

  it("doesn't break the streak just because today hasn't happened yet", () => {
    // Active yesterday, nothing logged yet today — today isn't "missed"
    // until the day is actually over, so the streak should still read 1
    // (yesterday), not 0.
    const result = computeScore([activityDaysAgo(1)], NOW, TZ);
    expect(result.currentStreak).toBe(1);
  });

  it("builds a consecutive streak across multiple days", () => {
    const activities = [0, 1, 2, 3, 4].map((d) => activityDaysAgo(d));
    const result = computeScore(activities, NOW, TZ);
    expect(result.currentStreak).toBe(5);
    expect(result.activeDaysLast30).toBe(5);
    expect(result.activeDaysLast7).toBe(5);
  });

  it("only counts the trailing 7 days toward activeDaysLast7, unlike activeDaysLast30", () => {
    const activities = Array.from({ length: 10 }, (_, i) => activityDaysAgo(i));
    const result = computeScore(activities, NOW, TZ);
    expect(result.activeDaysLast7).toBe(7);
    expect(result.activeDaysLast30).toBe(10);
  });

  it("breaks the streak on a gap too big for one freeze to cover", () => {
    // Active today, but missing the two days before that. A single freeze
    // can absorb the first missed day, but the second consecutive miss
    // still ends the streak — freezes only forgive one day at a time.
    const activities = [activityDaysAgo(0), activityDaysAgo(3)];
    const result = computeScore(activities, NOW, TZ);
    expect(result.currentStreak).toBe(1);
  });

  it("streak freeze covers a single missed day without breaking the chain", () => {
    // Active today and 2 days ago, but not yesterday — exactly the one
    // grace day a streak freeze is meant to absorb. The missed day itself
    // doesn't count toward the number, but it doesn't reset the streak.
    const activities = [activityDaysAgo(0), activityDaysAgo(2)];
    const result = computeScore(activities, NOW, TZ);
    expect(result.currentStreak).toBe(2);
    expect(result.usedStreakFreeze).toBe(true);
  });

  it("only allows one streak freeze per rolling 7-day window", () => {
    // Active every day except two 1-day gaps close together (day 2 and
    // day 5 missing, within the same week) — only the first gap should be
    // forgiven; the second should end the streak.
    const activeDays = [0, 1, 3, 4, 6, 7, 8].map((d) => activityDaysAgo(d));
    const result = computeScore(activeDays, NOW, TZ);
    // today(0), yesterday(1) active, day2 frozen, day3-4 active, day5
    // missing again within 7 days of the first freeze -> streak stops there.
    expect(result.currentStreak).toBe(4);
    expect(result.usedStreakFreeze).toBe(true);
  });

  it("does not report a used freeze when there's no streak to protect", () => {
    const result = computeScore([], NOW, TZ);
    expect(result.usedStreakFreeze).toBe(false);
  });

  it("flags slacking once the gap since last activity hits the threshold", () => {
    const result = computeScore([activityDaysAgo(3)], NOW, TZ);
    expect(result.isSlacking).toBe(true);
  });

  it("does not flag slacking just under the threshold", () => {
    const result = computeScore([activityDaysAgo(2)], NOW, TZ);
    expect(result.isSlacking).toBe(false);
  });

  it("credits a default duration when none is provided", () => {
    const result = computeScore([activityDaysAgo(0, null)], NOW, TZ);
    expect(result.totalMinutesLast30).toBeGreaterThan(0);
  });

  it("sums multiple same-day activities toward volume", () => {
    const activities = [activityDaysAgo(0, 30), activityDaysAgo(0, 30)];
    const result = computeScore(activities, NOW, TZ);
    expect(result.totalMinutesLast30).toBe(60);
    // Still only one *active day*, though — logging twice in one day
    // shouldn't count as two days of consistency.
    expect(result.activeDaysLast30).toBe(1);
  });

  it("weights consistency far more heavily than a single long session", () => {
    // 30 consecutive small sessions should heavily outscore one huge one.
    const consistent = computeScore(
      Array.from({ length: 30 }, (_, i) => activityDaysAgo(i, 20)),
      NOW,
      TZ
    );
    const bingeOnce = computeScore([activityDaysAgo(0, 600)], NOW, TZ);
    expect(consistent.score).toBeGreaterThan(bingeOnce.score);
  });

  it("caps the score at 100 even with excess volume/streak", () => {
    const activities = Array.from({ length: 40 }, (_, i) =>
      activityDaysAgo(i, 60)
    );
    const result = computeScore(activities, NOW, TZ);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("ignores activity older than the 30-day consistency window for scoring, but still uses it for streak lookback", () => {
    // 35 days of unbroken activity: only the most recent 30 should count
    // toward consistencyPct, but the streak itself (which can extend
    // beyond 30 days) should still reflect the true run length.
    const activities = Array.from({ length: 35 }, (_, i) => activityDaysAgo(i));
    const result = computeScore(activities, NOW, TZ);
    expect(result.activeDaysLast30).toBe(30);
    expect(result.currentStreak).toBe(35);
  });
});
