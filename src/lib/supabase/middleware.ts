import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/join", "/privacy", "/terms"];

// Google Search Console's "HTML file" domain-ownership verification serves
// a static file like /google88149f6b8ea54fea.html straight from /public —
// it has to return the actual file content to Google's crawler (which has
// no session), not get redirected to /login like every other unauthed
// request. Matched by pattern rather than one hardcoded filename so a
// future re-verification file doesn't silently break the same way.
const GOOGLE_SITE_VERIFICATION_PATTERN = /^\/google[0-9a-f]+\.html$/;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Route gating only needs to know "is there a plausible session at all,"
  // not a fully server-revalidated one — getSession() reads the JWT
  // straight out of the cookie with no network round-trip to the Auth
  // server, versus getUser() which calls out every time. That network call
  // on every single navigation was the single biggest latency cost in the
  // app. Actual data access is still fully protected by Postgres row-level
  // security regardless of what middleware decides here, so this only
  // affects how fast a redirect decision gets made, never what data anyone
  // can read or write.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const path = request.nextUrl.pathname;
  const isPublic =
    PUBLIC_PATHS.some((p) => path.startsWith(p)) ||
    GOOGLE_SITE_VERIFICATION_PATTERN.test(path);

  if (!session && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (session && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
