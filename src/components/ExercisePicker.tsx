"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import {
  EQUIPMENT_FILTERS,
  equipmentLabel,
  searchExercises,
  type Exercise,
} from "@/lib/workout";

/** Full-screen search over Free Exercise DB, with equipment filter chips
 * and a "custom exercise" fallback for anything the list doesn't have.
 * `yourExercises` are names from the person's own history that aren't in
 * that list (custom ones, or Strong's names like "Bench Press (Barbell)"
 * from an import), shown first so their Previous numbers line up. */
export function ExercisePicker({
  onPick,
  onClose,
  yourExercises = [],
}: {
  yourExercises?: string[];
  onPick: (
    exercise: Exercise | { id: null; name: string; equipment: null },
  ) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(
    () => searchExercises(query, equipment),
    [query, equipment],
  );
  const customName = query.trim().slice(0, 120);
  const yours = useMemo(() => {
    if (equipment) return [];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return yourExercises
      .filter((n) => words.every((w) => n.toLowerCase().includes(w)))
      .slice(0, 20);
  }, [query, equipment, yourExercises]);
  const exactMatch =
    yours.some((n) => n.toLowerCase() === customName.toLowerCase()) ||
    results.some((e) => e.name.toLowerCase() === customName.toLowerCase());

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add exercise"
      className="fixed inset-0 z-40 flex flex-col bg-background pt-[env(safe-area-inset-top)] md:left-64"
    >
      <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 pt-4 md:max-w-2xl">
        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-3 focus-within:border-accent">
          <Search size={18} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises"
            className="w-full bg-transparent outline-none"
          />
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
        >
          <X size={20} />
        </button>
      </div>

      <div className="mx-auto w-full max-w-md overflow-x-auto px-4 pt-3 md:max-w-2xl">
        <div className="flex gap-2 pb-1">
          {EQUIPMENT_FILTERS.map((eq) => (
            <button
              key={eq}
              onClick={() => setEquipment(equipment === eq ? null : eq)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                equipment === eq
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-surface text-muted"
              }`}
            >
              {equipmentLabel(eq)}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 md:max-w-2xl">
        {yours.length > 0 && (
          <>
            <p className="mb-2 px-1 text-[11px] font-medium uppercase text-muted">
              Your exercises
            </p>
            <ul className="mb-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {yours.map((name) => (
                <li key={name}>
                  <button
                    onClick={() => onPick({ id: null, name, equipment: null })}
                    className="w-full px-4 py-3 text-left text-sm font-medium transition hover:bg-surface-2"
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {customName && !exactMatch && (
          <button
            onClick={() =>
              onPick({ id: null, name: customName, equipment: null })
            }
            className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-left text-sm"
          >
            <Plus size={16} className="shrink-0 text-accent" />
            <span>
              Add <span className="font-medium">“{customName}”</span> as a
              custom exercise
            </span>
          </button>
        )}
        {results.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted">
            No matching exercises.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {results.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => onPick(e)}
                  className="flex w-full flex-col items-start px-4 py-3 text-left transition hover:bg-surface-2"
                >
                  <span className="text-sm font-medium">{e.name}</span>
                  <span className="text-xs capitalize text-muted">
                    {equipmentLabel(e.equipment)}
                    {e.muscle ? ` · ${e.muscle}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
