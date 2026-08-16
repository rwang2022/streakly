import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Public, unauthenticated page — see PUBLIC_PATHS in
// lib/supabase/middleware.ts. Required (along with /terms) to submit
// Streakly's Google OAuth consent screen for branding verification, so the
// sign-in screen shows "Streakly" + the app logo instead of the bare
// Supabase project domain.
export const metadata = {
  title: "Privacy Policy — Streakly",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh px-6 pb-20 pt-[calc(env(safe-area-inset-top)+2.5rem)]">
      <div className="mx-auto max-w-md">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-sm text-muted"
        >
          <ArrowLeft size={16} /> Back
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-1 text-sm text-muted">Last updated August 2026.</p>

        <div className="mt-8 space-y-7 text-sm leading-relaxed text-foreground">
          <section>
            <p>
              Streakly is a small, friends-only fitness accountability app.
              This page explains what data it collects, why, and how you can
              control or remove it. It&apos;s written in plain language on
              purpose — there&apos;s no ad network or data broker involved
              here, just an app for logging workouts with people you know.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">What we collect</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted">
              <li>
                From Google sign-in: your name, email address, and profile
                photo, used only to create and identify your account.
              </li>
              <li>
                What you enter yourself: a username, the workouts you log
                (type, duration, an optional note, and when you logged
                them).
              </li>
              <li>
                Your social graph on the app: friend connections and any
                rooms you&apos;ve joined or created.
              </li>
              <li>
                If you turn on reminder notifications: a push subscription
                identifier and your device&apos;s timezone, so a reminder can
                reach the right device at the right local time.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold">Who can see it</h2>
            <p className="mt-2 text-muted">
              Only people you&apos;ve added as friends or who share a room
              with you can see your activity, streak, and score. This is
              enforced at the database level (row-level security), not just
              hidden in the app&apos;s interface. Nothing you log is public,
              and there&apos;s no discovery feed or public profile.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">What we don&apos;t do</h2>
            <p className="mt-2 text-muted">
              We don&apos;t sell or share your data with advertisers, don&apos;t
              run third-party analytics or ad trackers, and don&apos;t use your
              data for anything beyond running the features you see in the
              app.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Who else touches your data</h2>
            <p className="mt-2 text-muted">
              Three services, all purely infrastructure — none of them see
              your data for any purpose beyond hosting it:
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted">
              <li>Google — sign-in only.</li>
              <li>Supabase — hosts the database and authentication.</li>
              <li>Vercel — hosts the app itself.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold">Your controls</h2>
            <p className="mt-2 text-muted">
              From Settings, at any time, you can: export everything
              associated with your account as a JSON file, permanently
              delete your activity history, friendships, and rooms
              you&apos;ve created, or turn reminder notifications off. Deleting
              your data signs you out and keeps only your account itself
              (so you can sign back in later) — it&apos;s a full data wipe, not
              a hidden soft-delete.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Data retention</h2>
            <p className="mt-2 text-muted">
              Your data is kept for as long as your account exists, or until
              you delete it yourself via Settings.
            </p>
          </section>

          <section>
            <h2 className="font-semibold">Changes</h2>
            <p className="mt-2 text-muted">
              If this policy changes in any meaningful way, the &ldquo;last
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
