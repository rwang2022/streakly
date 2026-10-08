import { describe, it, expect } from "vitest";
import { formatHour, isReminderDue } from "./reminders";

// 00:30 UTC on Oct 9 is 20:30 on Oct 8 in New York (EDT).
const NOW = new Date("2026-10-09T00:30:00Z");
const base = {
  time_zone: "America/New_York",
  reminder_hour: 20,
  daily_reminder: true,
  last_reminded_on: null,
};

describe("isReminderDue", () => {
  it("is due at the chosen local hour", () => {
    expect(isReminderDue(base, NOW)).toBe(true);
  });

  it("isn't due at other hours", () => {
    expect(isReminderDue({ ...base, reminder_hour: 21 }, NOW)).toBe(false);
    expect(isReminderDue({ ...base, time_zone: "UTC" }, NOW)).toBe(false);
  });

  it("isn't sent twice on the same local day", () => {
    expect(isReminderDue({ ...base, last_reminded_on: "2026-10-08" }, NOW)).toBe(false);
    expect(isReminderDue({ ...base, last_reminded_on: "2026-10-07" }, NOW)).toBe(true);
  });

  it("respects the reminder being turned off", () => {
    expect(isReminderDue({ ...base, daily_reminder: false }, NOW)).toBe(false);
  });
});

describe("formatHour", () => {
  it("formats 12-hour times", () => {
    expect(formatHour(0)).toBe("12 AM");
    expect(formatHour(9)).toBe("9 AM");
    expect(formatHour(12)).toBe("12 PM");
    expect(formatHour(20)).toBe("8 PM");
  });
});
