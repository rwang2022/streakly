import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/integrations";
import { SITE_URL } from "@/lib/site";

// Session-authed (cookie) management of the user's single ingest token for
// the Strong / Apple Health integration. The raw token is returned exactly
// once, on POST; only its hash is stored. See migration 15.
export const dynamic = "force-dynamic";

const INGEST_URL = `${SITE_URL}/api/integrations/strong`;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function GET() {
  const ctx = await requireUser();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });

  const { data } = await ctx.supabase
    .from("integration_tokens")
    .select("created_at, last_used_at")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  return NextResponse.json({
    connected: Boolean(data),
    createdAt: data?.created_at ?? null,
    lastUsedAt: data?.last_used_at ?? null,
    url: INGEST_URL,
  });
}

export async function POST() {
  const ctx = await requireUser();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });

  const token = generateToken();
  const token_hash = await hashToken(token);

  // One active token per user — regenerating replaces the old one, which
  // is also how "revoke a leaked token" works.
  await ctx.supabase
    .from("integration_tokens")
    .delete()
    .eq("user_id", ctx.user.id);

  const { error } = await ctx.supabase
    .from("integration_tokens")
    .insert({ user_id: ctx.user.id, token_hash, label: "Apple Health" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token, url: INGEST_URL });
}

export async function DELETE() {
  const ctx = await requireUser();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });

  await ctx.supabase
    .from("integration_tokens")
    .delete()
    .eq("user_id", ctx.user.id);

  return NextResponse.json({ ok: true });
}
