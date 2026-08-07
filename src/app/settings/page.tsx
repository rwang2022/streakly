"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import type { Profile } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
    <main className="min-h-dvh px-6 pb-28 pt-10">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

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
      </div>
      <BottomNav />
    </main>
  );
}
