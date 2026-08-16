"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function VouchButton({
  targetUserId,
  initiallyVouched,
}: {
  targetUserId: string;
  initiallyVouched: boolean;
}) {
  const router = useRouter();
  const [vouched, setVouched] = useState(initiallyVouched);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const me = session?.user ?? null;
    if (!me) {
      setBusy(false);
      return;
    }

    if (vouched) {
      await supabase
        .from("activity_vouches")
        .delete()
        .eq("user_id", targetUserId)
        .eq("vouched_by", me.id);
    } else {
      await supabase.from("activity_vouches").upsert(
        { user_id: targetUserId, vouched_by: me.id, created_at: new Date().toISOString() },
        { onConflict: "user_id,vouched_by" }
      );
    }

    setVouched((v) => !v);
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] ${
        vouched
          ? "border-success/40 bg-success/10 text-success"
          : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      } ${busy ? "opacity-60" : ""}`}
    >
      <Handshake size={15} />
      {vouched ? "You vouched for this — tap to undo" : "Vouch that this is real"}
    </button>
  );
}
