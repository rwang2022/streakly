import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Excludes /api/* too, not just static assets — API routes are never
    // meant to redirect an unauthenticated caller to the /login *page*
    // (that only makes sense for browser navigation). /api/cron/reminders
    // in particular is called server-to-server by Vercel Cron with no
    // browser session at all; it has its own bearer-token check inside
    // the route handler, but that check never even ran before this fix
    // because this proxy redirected the request to /login first.
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
