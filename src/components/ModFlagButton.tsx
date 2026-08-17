"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Admin-only control (the page only renders this for a viewer whose
// profile has is_admin — RLS on manual_flags enforces the same thing
// server-side, so this button is a convenience, not the actual gate).
//
// Deliberately separate from VouchButton: vouching is peer social proof
// meant to clear the *algorithmic* heuristic's false positives, while
// this is a mod's own judgment call — it shouldn't be undoable by the
// same mechanism it was meant to route around. Only removing the flag
// here (or another admin doing so) lifts it.
export function ModFlagButton({
  targetUserId,
  initiallyFlagged,
  initialReason,
}: {
  targetUserId: string;
  initiallyFlagged: boolean;
  initialReason: string | null;
}) {
  const router = useRouter();
  const [flagged, setFlagged] = useState(initiallyFlagged);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (flagged) {
      if (!window.confirm("Remove this mod flag?")) return;
    }

    let reason: string | null = initialReason;
    if (!flagged) {
      const input = window.prompt(
        "Reason (optional — visible to this person's friends/roommates):",
        ""
      );
      if (input === null) return; // cancelled the prompt entirely
      reason = input.trim() || null;
    }

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

    if (flagged) {
      await supabase.from("manual_flags").delete().eq("user_id", targetUserId);
    } else {
      // upsert on user_id: re-flagging (e.g. a different admin) just
      // updates who/why/when rather than erroring on the existing row.
      await supabase.from("manual_flags").upsert(
        {
          user_id: targetUserId,
          flagged_by: me.id,
          reason,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }

    setFlagged((f) => !f);
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] ${
        flagged
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border bg-surface text-muted"
      } ${busy ? "opacity-60" : ""}`}
    >
      <ShieldAlert size={15} />
      {flagged ? "Mod flag active — tap to remove" : "Flag as suspicious (mod)"}
    </button>
  );
}
