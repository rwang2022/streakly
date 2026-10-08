import { formatDateKey, localHour } from "./date";

export const DEFAULT_REMINDER_HOUR = 20;

export interface ReminderSubscription {
  time_zone: string;
  reminder_hour: number;
  daily_reminder: boolean;
  last_reminded_on: string | null;
}

/**
 * Should this device get its daily reminder in the run happening at
 * `now`? The job runs hourly (migration 18), so: reminders on, it's the
 * chosen hour on the device's own clock, and nothing sent yet today.
 */
export function isReminderDue(sub: ReminderSubscription, now: Date): boolean {
  if (!sub.daily_reminder) return false;
  if (localHour(now, sub.time_zone) !== sub.reminder_hour) return false;
  return sub.last_reminded_on !== formatDateKey(now, sub.time_zone);
}

/** "8 PM", "12 AM", for the Settings picker. */
export function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "AM" : "PM"}`;
}
