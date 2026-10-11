"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Check, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { REPEAT_PLAN_KEY, defaultTemplateName, type PlanExercise } from "@/lib/workout";

// "Repeat" and "Save as template" under a finished or imported workout in
// History. Repeat hands the plan to /workout through sessionStorage, which
// starts a new workout from it.
export function WorkoutActions({
  plan,
  name,
  at,
}: {
  plan: PlanExercise[];
  name: string | null;
  at: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  function repeat() {
    try {
      sessionStorage.setItem(REPEAT_PLAN_KEY, JSON.stringify(plan));
    } catch {
      setError("Couldn't start it here. Try again from the Home Screen app.");
      return;
    }
    router.push("/workout");
  }

  async function saveTemplate() {
    if (state !== "idle") return;
    setError(null);
    setState("saving");
    const { error: dbError } = await createClient()
      .from("workout_templates")
      .insert({ name: defaultTemplateName(name, new Date(at)), exercises: plan });
    if (dbError) {
      setState("idle");
      setError(
        dbError.code === "42P01" || dbError.code === "PGRST205"
          ? "Templates aren't set up on the server yet (migration 21)."
          : "Couldn't save the template. Try again in a moment."
      );
      return;
    }
    setState("saved");
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <button
          onClick={repeat}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2 text-xs font-medium"
        >
          <RotateCcw size={14} /> Repeat
        </button>
        <button
          onClick={saveTemplate}
          disabled={state !== "idle"}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2 text-xs font-medium disabled:opacity-70"
        >
          {state === "saved" ? (
            <>
              <Check size={14} /> Saved to templates
            </>
          ) : (
            <>
              <BookmarkPlus size={14} /> {state === "saving" ? "Saving…" : "Save as template"}
            </>
          )}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-accent">{error}</p>}
    </div>
  );
}
