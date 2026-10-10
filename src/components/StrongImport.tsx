"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseStrongCsv, type ImportWorkout } from "@/lib/strongImport";
import type { WeightUnit } from "@/lib/workout";

// Workouts sent per import_workouts() call (the function caps it at 100).
const BATCH = 25;

/** Settings card: import past workouts from a Strong CSV export. They
 * become history (History list, "Previous" numbers), never streak credit
 * — see migration 20. */
export function StrongImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [unit, setUnit] = useState<WeightUnit>("lb");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const parsed = text ? parseStrongCsv(text, unit) : null;

  async function handleFile(file: File | undefined) {
    setMessage(null);
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  async function handleImport() {
    if (!parsed || parsed.workouts.length === 0) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    let added = 0;
    const total = parsed.workouts.length;
    for (let i = 0; i < total; i += BATCH) {
      const chunk: ImportWorkout[] = parsed.workouts.slice(i, i + BATCH);
      setProgress(`Importing ${Math.min(i + BATCH, total)} of ${total}…`);
      const { data, error } = await supabase.rpc("import_workouts", { p_workouts: chunk });
      if (error) {
        setBusy(false);
        setProgress("");
        setMessage(
          error.code === "PGRST202" || error.message.includes("import_workouts")
            ? "Importing isn't set up on the server yet (migration 20)."
            : `Stopped after ${added} workouts: ${error.message}`
        );
        return;
      }
      added += Number(data ?? 0);
    }
    setBusy(false);
    setProgress("");
    setText(null);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
    const skipped = total - added;
    setMessage(
      `Imported ${added} ${added === 1 ? "workout" : "workouts"}` +
        (skipped ? ` (${skipped} already imported).` : ".")
    );
  }

  const first = parsed?.workouts[0]?.started_at;
  const last = parsed?.workouts.at(-1)?.started_at;
  const setCount = parsed?.workouts.reduce((n, w) => n + w.sets.length, 0) ?? 0;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface px-4 py-4">
      <div className="flex items-start gap-3">
        <Upload size={18} className="mt-0.5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Import from Strong</p>
          <p className="text-xs text-muted">
            In Strong, open Settings → Export Strong Data, then choose that file here.
            Imported workouts show in History and fill in your Previous numbers, but
            don&apos;t count toward your streak.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <label className="flex-1 cursor-pointer truncate rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted">
          {fileName || "Choose CSV file"}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
        <div className="flex shrink-0 overflow-hidden rounded-xl border border-border text-xs font-medium">
          {(["lb", "kg"] as const).map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              aria-label={`Weights are in ${u}`}
              className={`px-3 py-2.5 ${unit === u ? "bg-foreground text-background" : "bg-surface text-muted"}`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {parsed && (
        <div className="mt-3 text-sm">
          {parsed.error ? (
            <p className="text-accent">{parsed.error}</p>
          ) : (
            <>
              <p className="text-muted">
                Found {parsed.workouts.length} workouts and {setCount} sets
                {first && last ? `, ${fmt(first)} to ${fmt(last)}` : ""}.
                {parsed.skippedRows > 0 ? ` ${parsed.skippedRows} rows without reps (cardio, timed holds) will be skipped.` : ""}
              </p>
              <button
                onClick={handleImport}
                disabled={busy}
                className="mt-3 w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-60"
              >
                {busy ? progress || "Importing…" : `Import ${parsed.workouts.length} workouts`}
              </button>
            </>
          )}
        </div>
      )}

      {message && <p className="mt-3 text-sm text-muted">{message}</p>}
    </div>
  );
}
