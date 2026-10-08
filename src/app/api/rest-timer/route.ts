import { NextResponse, after, type NextRequest } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_REST_SECONDS } from "@/lib/workout";

// Rest-over push notification for the workout tracker (migration 17).
//
// POST { seconds } starts (or replaces) the caller's rest timer; the
// response returns straight away and the wait happens in after(), which
// then sends a push to every device the person has notifications on for.
// DELETE cancels it. Each POST gets a fresh token and the send only goes
// out if that token is still the current one, so Skip / +15s / starting
// the next rest never leave a stale notification behind.
//
// The wait runs inside this function, so the longest rest is bounded by
// the platform's function timeout — maxDuration below, with a margin
// (MAX_REST_SECONDS) for the request itself and the send.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function configurePush(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { seconds?: unknown };
  const seconds = Number(body.seconds);
  if (!Number.isFinite(seconds) || seconds < 1) {
    return NextResponse.json({ error: "seconds must be a positive number" }, { status: 400 });
  }
  const waitMs = Math.min(seconds, MAX_REST_SECONDS) * 1000;

  if (!configurePush()) {
    // No VAPID keys (e.g. local dev): the in-app countdown still works,
    // there's just nothing to send to a locked phone.
    return NextResponse.json({ ok: true, push: false });
  }

  const admin = createAdminClient();
  const token = crypto.randomUUID();
  const endsAt = new Date(Date.now() + waitMs);

  const { error } = await admin
    .from("rest_timers")
    .upsert({ user_id: user.id, token, ends_at: endsAt.toISOString() });
  if (error) {
    return NextResponse.json({ ok: true, push: false, error: error.message });
  }

  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    // Claim the timer: only delete-and-send if it's still ours.
    const { data: claimed } = await admin
      .from("rest_timers")
      .delete()
      .eq("user_id", user.id)
      .eq("token", token)
      .select("user_id");
    if (!claimed || claimed.length === 0) return;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user.id);

    const stale: string[] = [];
    await Promise.all(
      (subs ?? []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: "Rest's over",
              body: "Time for your next set.",
              url: "/workout",
              tag: "rest-timer",
            }),
            // Pointless once the next rest has started anyway.
            { TTL: 60, urgency: "high" }
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) stale.push(sub.endpoint);
        }
      })
    );
    if (stale.length > 0) {
      await admin.from("push_subscriptions").delete().in("endpoint", stale);
    }
  });

  return NextResponse.json({ ok: true, push: true });
}

export async function DELETE() {
  const user = await requireUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await createAdminClient().from("rest_timers").delete().eq("user_id", user.id);
  }
  return NextResponse.json({ ok: true });
}
