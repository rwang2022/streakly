"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LogOut, Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HapticsToggle } from "@/components/HapticsToggle";
import { PushToggle } from "@/components/PushToggle";
import { StrongImport } from "@/components/StrongImport";
import { DataControls } from "@/components/DataControls";
import type { Profile } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setProfile(data as Profile);
    })();
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="min-h-dvh px-6 pb-32 pt-[calc(env(safe-area-inset-top)+2.5rem)] md:pb-10 md:pl-72">
      <div className="mx-auto max-w-md md:max-w-2xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted"
        >
          <ArrowLeft size={16} /> Back
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Settings</h1>

        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-lg font-semibold">
            {(profile?.display_name ?? profile?.username ?? "?")
              .charAt(0)
              .toUpperCase()}
          </div>
          <div>
            <p className="font-medium">{profile?.display_name ?? "—"}</p>
            <p className="text-sm text-muted">
              @{profile?.username ?? "loading"}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <ThemeToggle />
          <HapticsToggle />
        </div>

        <PushToggle />

        <StrongImport />

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-4">
          <Shield size={18} className="mt-0.5 shrink-0 text-muted" />
          <p className="text-sm text-muted">
            Only your accepted friends can see your activity and score.
            Nothing is public.
          </p>
        </div>

        <button
          onClick={signOut}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-5 py-3.5 font-medium text-accent transition active:scale-[0.98]"
        >
          <LogOut size={18} />
          Sign out
        </button>

        <DataControls />
      </div>
      <BottomNav />
    </main>
  );
}
