import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Public, unauthenticated page — see PUBLIC_PATHS in
// lib/supabase/middleware.ts. Required (along with /privacy) to submit
// Streakly's Google OAuth consent screen for branding verification.
export const metadata = {
  title: "Terms of Service — Streakly",
};

export default function TermsPage() {
  return (
    <main className="min-h-dvh px-6 pb-20 pt-[calc(env(safe-area-inset-top)+2.5rem)]">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-sm text-muted"
        >
          <ArrowLeft size={16} /> Back
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Terms of Service
        </h1>
        <p className="mt-1 text-sm text-muted">Last updated August 2026.</p>

        <div className="mt-8 space-y-7 text-sm leading-relaxed text-foreground">
          <section>
            <p>
              Streakly is a small, invite-based app for logging workouts and
              keeping friends honest about consistency. By using it, you&apos;re
              agreeing to the basics below. This is a personal project, not
              a company with a legal department — treat these terms as
              plainly as they&apos;re written.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">The service</h2>
            <p className="mt-2 text-muted">
              Streakly lets you log workouts, see a streak and score, and
              compare consistency with friends or roommates you&apos;ve
              connected with. It&apos;s provided as-is, without warranty of any
              kind, and may change, break, or go offline without notice —
              it&apos;s run by one person, not a company with an uptime SLA.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Not medical or fitness advice</h2>
            <p className="mt-2 text-muted">
              Nothing in Streakly is medical, fitness, or professional
              advice. It&apos;s a logging and accountability tool. Talk to a
              qualified professional before starting or changing any
              exercise routine.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Your account</h2>
            <p className="mt-2 text-muted">
              You sign in with Google and pick a username. You&apos;re
              responsible for what happens under your account. Log your own
              activity honestly — the app does flag patterns that look
              fabricated (e.g. many identical entries logged in a burst),
              and friends can see when that happens.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Acceptable use</h2>
            <p className="mt-2 text-muted">
              Don&apos;t use Streakly to harass anyone, impersonate someone
              else, or abuse invite links to access rooms or people&apos;s data
              you have no real connection to.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Ending your use of the service</h2>
            <p className="mt-2 text-muted">
              You can delete your data or stop using Streakly at any time
              from Settings. Accounts that abuse the service may have their
              access revoked.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Limitation of liability</h2>
            <p className="mt-2 text-muted">
              Streakly is offered free of charge with no guarantees. To the
              fullest extent allowed by law, it&apos;s provided without
              liability for any damages arising from your use of it.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Changes</h2>
            <p className="mt-2 text-muted">
              If these terms change in any meaningful way, the &ldquo;last
              updated&rdquo; date above will change too.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Questions</h2>
            <p className="mt-2 text-muted">
              Reach out at{" "}
              <a
                href="mailto:ryanwang601@gmail.com"
                className="text-accent"
              >
                ryanwang601@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
