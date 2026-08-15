"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function DeleteActivityButton({ activityId }: { activityId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    setBusy(true);
    const supabase = createClient();
    await supabase.from("activities").delete().eq("id", activityId);
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      aria-label={confirming ? "Confirm delete" : "Delete activity"}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
        confirming
          ? "bg-accent text-white"
          : "text-muted hover:bg-surface-2"
      } ${busy ? "opacity-40" : ""}`}
    >
      <Trash2 size={15} />
    </button>
  );
}
