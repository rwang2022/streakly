import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateKey } from "@/lib/date";
import { isReminderDue } from "@/lib/reminders";

// Runs every hour, triggered from Supabase by pg_cron (see
// supabase/hourly_reminders_cron.sql; Vercel's Hobby plan only allows its
// own cron once a day). Each run only nudges the devices whose chosen
// local hour it currently is (migration 18), and records the day it did
// so, so an extra run in the same hour never sends twice.
export const dynamic = "force-dynamic";

const LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000; // 2 days is plenty to cover "today" in any timezone

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET?.trim()}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Everything below can throw for reasons worth seeing in the response
  // (a malformed VAPID key, a Supabase error, etc.) rather than Vercel
  // just returning an opaque, empty 500 — which is what happened before
  // this try/catch existed.
  try {
    // .trim() defensively strips any accidental leading/trailing
    // whitespace or newline picked up when pasting into Vercel's env var
    // UI — a stray newline on a base64 key is a classic silent-corruption
    // source and would make setVapidDetails() throw synchronously below.
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const vapidSubject = process.env.VAPID_SUBJECT?.trim();
    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return NextResponse.json(
        { error: "VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY, and VAPID_SUBJECT must all be set." },
        { status: 500 }
      );
    }
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createAdminClient();

    const { data: subscriptions, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, time_zone, user_id, reminder_hour, daily_reminder, last_reminded_on");

    if (subsError) {
      return NextResponse.json({ error: `push_subscriptions query failed: ${subsError.message}` }, { status: 500 });
    }

    const now = new Date();
    const due = (subscriptions ?? []).filter((s) => isReminderDue(s, now));
    if (due.length === 0) {
      return NextResponse.json({ checked: 0, sent: 0, removedStale: 0 });
    }

    const userIds = Array.from(new Set(due.map((s) => s.user_id)));
    const { data: recentActivities, error: activitiesError } = await supabase
      .from("activities")
      .select("user_id, logged_at")
      .in("user_id", userIds)
      .gte("logged_at", new Date(Date.now() - LOOKBACK_MS).toISOString());

    if (activitiesError) {
      return NextResponse.json({ error: `activities query failed: ${activitiesError.message}` }, { status: 500 });
    }

    const loggedAtByUser = new Map<string, string[]>();
    for (const a of recentActivities ?? []) {
      const list = loggedAtByUser.get(a.user_id) ?? [];
      list.push(a.logged_at);
      loggedAtByUser.set(a.user_id, list);
    }

    let sent = 0;
    const staleEndpoints: string[] = [];
    const errors: string[] = [];

    // Every due device is marked as handled for its local today, whether
    // it gets a nudge or has already logged, so it isn't re-checked until
    // tomorrow's run at its hour.
    const handledByDay = new Map<string, string[]>();

    for (const sub of due) {
      const todayKey = formatDateKey(now, sub.time_zone);
      handledByDay.set(todayKey, [...(handledByDay.get(todayKey) ?? []), sub.endpoint]);
      const loggedToday = (loggedAtByUser.get(sub.user_id) ?? []).some(
        (iso) => formatDateKey(new Date(iso), sub.time_zone) === todayKey
      );
      if (loggedToday) continue;

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: "Streakly",
            body: "Nothing logged today yet — keep the streak alive.",
            url: "/log",
          })
        );
        sent += 1;
      } catch (err) {
        // 404/410 means the browser revoked this subscription (uninstalled,
        // cleared data, etc.) — clean it up so future runs don't keep
        // retrying a dead endpoint. Anything else gets reported back
        // instead of silently swallowed.
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
        } else {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
    }

    for (const [day, endpoints] of handledByDay) {
      await supabase
        .from("push_subscriptions")
        .update({ last_reminded_on: day })
        .in("endpoint", endpoints);
    }

    if (staleEndpoints.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
    }

    return NextResponse.json({
      checked: due.length,
      sent,
      removedStale: staleEndpoints.length,
      ...(errors.length > 0 ? { sendErrors: errors } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error", stack: err instanceof Error ? err.stack : undefined },
      { status: 500 }
    );
  }
}
