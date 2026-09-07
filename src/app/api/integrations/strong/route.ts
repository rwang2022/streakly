import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, normalizeWorkout } from "@/lib/integrations";

// Ingest endpoint for auto-logged workouts. Called server-to-server by an
// iOS Shortcut (no browser session), authed with a per-user bearer token
// whose SHA-256 lives in integration_tokens. Runs with the service-role
// key, same as the cron reminder route — the database still enforces the
// 12/day rate limit (migration 6) and the 24h logged_at window
// (migration 5) regardless, and those rejections are treated as "skip",
// not "error", so a misbehaving automation can't retry-storm.
export const dynamic = "force-dynamic";

function bearer(request: NextRequest): string {
  const header = request.headers.get("authorization") ?? "";
  return header.slice(0, 7).toLowerCase() === "bearer "
    ? header.slice(7).trim()
    : "";
}

async function resolveToken(token: string) {
  if (!token) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("integration_tokens")
    .select("id, user_id")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  return data ? { ...data, supabase } : null;
}

// GET is the "test connection" ping — confirms the token resolves without
// writing anything.
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveToken(bearer(request));
    if (!auth) return new NextResponse("Unauthorized", { status: 401 });

    const { data: profile } = await auth.supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", auth.user_id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      connectedAs:
        profile?.username ?? profile?.display_name ?? "your Streakly account",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function handlePost(request: NextRequest) {
  const auth = await resolveToken(bearer(request));
  if (!auth) return new NextResponse("Unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const normalized = normalizeWorkout(body);
  if (!normalized.ok) {
    return NextResponse.json(
      normalized.status === 200
        ? { ok: true, skipped: normalized.reason }
        : { ok: false, error: normalized.reason },
      { status: normalized.status }
    );
  }

  const { data, error } = await auth.supabase
    .from("activities")
    .insert({ ...normalized.row, user_id: auth.user_id })
    .select("id")
    .single();

  if (error) {
    // 23505: hit the (user_id, external_id) unique index — this exact
    // workout is already logged. The Shortcut fires on every app close,
    // so this is the common, expected path, not a failure.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, deduped: true });
    }
    // P0001: 12/day rate-limit trigger. 23514: logged_at CHECK (only
    // reachable on clock skew, since normalizeWorkout already gates the
    // window). Neither should make the automation retry.
    if (error.code === "P0001") {
      return NextResponse.json({ ok: true, skipped: "rate_limited" });
    }
    if (error.code === "23514") {
      return NextResponse.json({ ok: true, skipped: "outside_window" });
    }
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  await auth.supabase
    .from("integration_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", auth.id);

  return NextResponse.json({ ok: true, deduped: false, activityId: data.id });
}
