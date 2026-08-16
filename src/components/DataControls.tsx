"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function DataControls() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExporting(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) {
      setExporting(false);
      return;
    }

    const [{ data: profile }, { data: activities }, { data: friendships }] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase
          .from("activities")
          .select("*")
          .eq("user_id", user.id)
          .order("logged_at", { ascending: false }),
        supabase
          .from("friendships")
          .select("*")
          .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
      ]);

    const payload = {
      exported_at: new Date().toISOString(),
      profile,
      activities: activities ?? [],
      friendships: friendships ?? [],
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `streakly-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setExporting(false);
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) {
      setDeleting(false);
      return;
    }

    // Deletes only what's covered by existing RLS policies for "own"
    // rows — no admin/service-role access needed. This clears activity
    // history and the social graph but deliberately leaves the profile
    // row itself intact (so signing back in doesn't land in a broken
    // "authenticated but no profile" state); it's a data wipe, not a full
    // account deletion, which would require Supabase's admin API.
    await Promise.all([
      supabase.from("activities").delete().eq("user_id", user.id),
      supabase
        .from("friendships")
        .delete()
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
      supabase.from("room_memberships").delete().eq("user_id", user.id),
      supabase.from("rooms").delete().eq("created_by", user.id),
    ]);

    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="mt-6 space-y-3">
      <button
        onClick={handleExport}
        disabled={exporting}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-5 py-3.5 font-medium text-foreground transition active:scale-[0.98] disabled:opacity-60"
      >
        <Download size={18} />
        {exporting ? "Preparing export…" : "Export my data"}
      </button>

      {!confirmOpen ? (
        <button
          onClick={() => setConfirmOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-5 py-3.5 font-medium text-accent transition active:scale-[0.98]"
        >
          <Trash2 size={18} />
          Delete my data
        </button>
      ) : (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-medium text-accent">
            This permanently deletes your activity history, friendships, and
            rooms you created, then signs you out. Your account itself stays
            (so you can sign back in), but everything else is gone.
          </p>
          <p className="mt-2 text-xs text-muted">
            Type <span className="font-semibold">DELETE</span> to confirm.
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="DELETE"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
              className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={confirmText !== "DELETE" || deleting}
              className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {deleting ? "Deleting…" : "Delete everything"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
