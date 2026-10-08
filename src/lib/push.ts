"use client";

import { createClient } from "@/lib/supabase/client";

// Web Push wants the VAPID public key as a raw Uint8Array, but it's
// distributed/copy-pasted as a URL-safe base64 string — this is the
// standard conversion boilerplate every push implementation needs.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/**
 * Requests notification permission, subscribes via the browser's push
 * service, and upserts the subscription into Supabase (RLS-scoped to the
 * signed-in user — no server route needed for this half, only for
 * actually *sending* pushes later, which needs the private VAPID key).
 *
 * `dailyReminder` sets whether this device also gets the daily nudge;
 * the workout screen subscribes with `false`, since it only wants rest
 * alerts (migrations 17 and 18).
 */
export async function subscribeToPush({
  dailyReminder = true,
}: { dailyReminder?: boolean } = {}): Promise<boolean> {
  if (!isPushSupported()) return false;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn("NEXT_PUBLIC_VAPID_PUBLIC_KEY isn't set — push reminders are disabled.");
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    // TS's lib.dom types for BufferSource are stricter about the exact
    // ArrayBuffer vs ArrayBufferLike generic than what a plain
    // `new Uint8Array()` infers — this is a real Uint8Array at runtime,
    // just not typed precisely enough for the PushManager signature.
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return false;

  const json = subscription.toJSON();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
      time_zone: timeZone,
      daily_reminder: dailyReminder,
    },
    { onConflict: "endpoint" }
  );

  return !error;
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;

  const supabase = createClient();
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", subscription.endpoint);

  await subscription.unsubscribe();
}

export interface ReminderSettings {
  dailyReminder: boolean;
  reminderHour: number;
}

/** This device's daily-reminder settings, or null if it isn't subscribed. */
export async function getReminderSettings(
  subscription: PushSubscription
): Promise<ReminderSettings | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("daily_reminder, reminder_hour")
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();
  if (!data) return null;
  return { dailyReminder: data.daily_reminder, reminderHour: data.reminder_hour };
}

/** Updates this device's daily-reminder settings, keeping it subscribed
 * (so workout rest alerts keep working when the daily nudge is off). */
export async function updateReminderSettings(
  subscription: PushSubscription,
  settings: Partial<{ daily_reminder: boolean; reminder_hour: number }>
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .update(settings)
    .eq("endpoint", subscription.endpoint);
  return !error;
}
