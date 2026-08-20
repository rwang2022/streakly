"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, ShieldAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const DAY_MS = 24 * 60 * 60 * 1000;

// Admin-only control (the page only renders this for a viewer whose
// profile has is_admin — RLS on manual_flags enforces the same thing
// server-side, so this button is a convenience, not the actual gate).
//
// Deliberately separate from VouchButton: vouching is peer social proof
// meant to clear the *algorithmic* heuristic's false positives, while
// this is a mod's own judgment call — it shouldn't be undoable by the
// same mechanism it was meant to route around. Only removing the flag
// here (or another admin doing so) lifts it, or it can be given a timer
// so it lifts on its own.
export function ModFlagButton({
  targetUserId,
  initiallyFlagged,
  initialReason,
  initialExpiresAt,
}: {
  targetUserId: string;
  initiallyFlagged: boolean;
  initialReason: string | null;
  initialExpiresAt: string | null;
}) {
  const router = useRouter();
  const [flagged, setFlagged] = useState(initiallyFlagged);
  const [reason, setReason] = useState(initialReason);
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);
  const [busy, setBusy] = useState(false);

  // Returns null if the person cancelled the prompt entirely (vs. just
  // leaving it blank, which means "permanent" — those are two different
  // outcomes and window.prompt only gives us one signal, null, for both
  // "cancel" and never mind we do need to distinguish: null = Cancel
  // button, "" = OK with empty input = permanent.
  function promptDurationDays(currentLabel: string): number | null | undefined {
    const input = window.prompt(
      `Ban length in days (blank = permanent). ${currentLabel}`,
      ""
    );
    if (input === null) return undefined; // cancelled
    const trimmed = input.trim();
    if (trimmed === "") return null; // permanent
    const days = Number(trimmed);
    if (!Number.isFinite(days) || days <= 0) return null;
    return days;
  }

  async function withSupabaseUser<T>(
    fn: (supabase: ReturnType<typeof createClient>, meId: string) => Promise<T>
  ): Promise<T | undefined> {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const me = session?.user ?? null;
    if (!me) return undefined;
    return fn(supabase, me.id);
  }

  async function handleFlag() {
    const input = window.prompt(
      "Reason (optional — visible to this person's friends/roommates):",
      ""
    );
    if (input === null) return; // cancelled
    const newReason = input.trim() || null;

    const days = promptDurationDays("");
    if (days === undefined) return; // cancelled the duration step
    const newExpiresAt = days === null ? null : new Date(Date.now() + days * DAY_MS).toISOString();

    setBusy(true);
    await withSupabaseUser(async (supabase, meId) => {
      await supabase.from("manual_flags").upsert(
        {
          user_id: targetUserId,
          flagged_by: meId,
          reason: newReason,
          expires_at: newExpiresAt,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    });
    setReason(newReason);
    setExpiresAt(newExpiresAt);
    setFlagged(true);
    setBusy(false);
    router.refresh();
  }

  async function handleEditTime() {
    const currentLabel = expiresAt
      ? `Currently expires ${new Date(expiresAt).toLocaleDateString()}.`
      : "Currently permanent.";
    const days = promptDurationDays(currentLabel);
    if (days === undefined) return; // cancelled
    const newExpiresAt = days === null ? null : new Date(Date.now() + days * DAY_MS).toISOString();

    setBusy(true);
    await withSupabaseUser(async (supabase, meId) => {
      await supabase
        .from("manual_flags")
        .update({ expires_at: newExpiresAt, flagged_by: meId })
        .eq("user_id", targetUserId);
    });
    setExpiresAt(newExpiresAt);
    setBusy(false);
    router.refresh();
  }

  async function handleRemove() {
    if (!window.confirm("Remove this mod flag?")) return;
    setBusy(true);
    await withSupabaseUser(async (supabase) => {
      await supabase.from("manual_flags").delete().eq("user_id", targetUserId);
    });
    setFlagged(false);
    setBusy(false);
    router.refresh();
  }

  if (!flagged) {
    return (
      <button
        type="button"
        onClick={handleFlag}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-muted transition active:scale-[0.98] disabled:opacity-60"
      >
        <ShieldAlert size={15} />
        Flag as suspicious (mod)
      </button>
    );
  }

  const timeLabel = expiresAt
    ? `expires ${new Date(expiresAt).toLocaleDateString()}`
    : "permanent";

  return (
    <div className="mt-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-accent">
        <ShieldAlert size={15} />
        Mod flag active
        <span className="ml-auto flex items-center gap-1 text-xs font-normal text-accent/80">
          <Clock size={12} />
          {timeLabel}
        </span>
      </div>
      {reason && <p className="mt-1 text-xs text-accent/80">{reason}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleEditTime}
          disabled={busy}
          className="flex-1 rounded-xl border border-accent/30 bg-surface px-3 py-1.5 text-xs font-medium text-accent transition active:scale-[0.98] disabled:opacity-60"
        >
          Edit time
        </button>
        <button
          type="button"
          onClick={handleRemove}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          <X size={12} />
          Remove
        </button>
      </div>
    </div>
  );
}
