import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS entirely. Only ever used by
 * the cron reminder route (src/app/api/cron/reminders/route.ts), which
 * legitimately needs to read across *all* users' push subscriptions and
 * activity rows, not just one authenticated person's. Never import this
 * from anything that could end up in a client bundle or a route reachable
 * by a normal user request — the `server-only` import above makes doing
 * so a build error rather than a silent leak.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set to use the admin client."
    );
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
