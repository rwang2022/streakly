// Parses a Strong app CSV export (Settings > Export Strong Data) into
// workouts ready for the import_workouts() database function
// (migration 20). Pure, so it's unit-tested in strongImport.test.ts.
//
// Strong writes one row per set. The columns we use, matched by header
// name (case-insensitive) so their order doesn't matter:
//   Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps
// Rows without reps (cardio, timed holds) are skipped. The delimiter is
// detected from the header line, since exports have used both , and ;.
import type { WeightUnit } from "./workout";

export interface ImportSet {
  exercise_name: string;
  exercise_position: number;
  set_number: number;
  weight: number | null;
  reps: number;
  unit: WeightUnit;
}

export interface ImportWorkout {
  external_key: string;
  started_at: string;
  name: string;
  duration_minutes: number | null;
  sets: ImportSet[];
}

export interface ParseResult {
  workouts: ImportWorkout[];
  skippedRows: number;
  error: string | null;
}

// The same limits the workout_sets table enforces (migration 16).
const MAX_EXERCISES = 100;
const MAX_SETS = 100;
const MAX_WEIGHT = 2000;
const MAX_REPS = 1000;
const MAX_NAME = 120;
// A workout left running in Strong records absurd lengths ("28h 42m").
// Anything past this is treated as unknown rather than stored.
const MAX_PLAUSIBLE_MINUTES = 300;

/** Splits CSV text into rows of fields, honouring "quoted, fields". */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

function detectDelimiter(headerLine: string): string {
  const semis = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

/** "1h 5m" / "45m" / "1h" / "30s" → minutes. A bare number is seconds. */
export function parseDurationMinutes(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) / 60);
  const h = Number(v.match(/(\d+)\s*h/)?.[1] ?? 0);
  const m = Number(v.match(/(\d+)\s*m(?!s)/)?.[1] ?? 0);
  const s = Number(v.match(/(\d+)\s*s/)?.[1] ?? 0);
  if (!h && !m && !s) return null;
  return Math.min(1000, Math.round(h * 60 + m + s / 60));
}

/** Strong's "2024-03-05 18:30:00" as local time. */
export function parseStrongDate(value: string): Date | null {
  const v = value.trim();
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const v = value.trim().replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function plausibleMinutes(minutes: number | null): number | null {
  return minutes !== null && minutes <= MAX_PLAUSIBLE_MINUTES ? minutes : null;
}

export function parseStrongCsv(text: string, unit: WeightUnit): ParseResult {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const rows = parseCsv(clean, detectDelimiter(firstLine));
  if (rows.length < 2) {
    return { workouts: [], skippedRows: 0, error: "That file has no workout rows." };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iDate = col("date");
  const iWorkout = col("workout name");
  const iDuration = col("duration");
  const iExercise = col("exercise name");
  const iWeight = col("weight") >= 0 ? col("weight") : header.findIndex((h) => h.startsWith("weight"));
  const iReps = col("reps");
  if (iDate < 0 || iExercise < 0 || iReps < 0) {
    return {
      workouts: [],
      skippedRows: 0,
      error: "This doesn't look like a Strong export (missing Date, Exercise Name or Reps columns).",
    };
  }

  const byWorkout = new Map<string, { started: Date; name: string; duration: number | null; exercises: Map<string, { position: number; sets: ImportSet[] }> }>();
  let skippedRows = 0;

  for (const r of rows.slice(1)) {
    const started = parseStrongDate(r[iDate] ?? "");
    const exercise = (r[iExercise] ?? "").trim().slice(0, MAX_NAME);
    const reps = num(r[iReps]);
    if (!started || !exercise || reps === null || reps <= 0) {
      skippedRows++;
      continue;
    }
    const name = iWorkout >= 0 ? (r[iWorkout] ?? "").trim() : "";
    const key = `strong:${(r[iDate] ?? "").trim()}|${name}`.slice(0, 200);
    let workout = byWorkout.get(key);
    if (!workout) {
      workout = {
        started,
        name,
        duration: plausibleMinutes(iDuration >= 0 ? parseDurationMinutes(r[iDuration] ?? "") : null),
        exercises: new Map(),
      };
      byWorkout.set(key, workout);
    }
    let entry = workout.exercises.get(exercise);
    if (!entry) {
      if (workout.exercises.size >= MAX_EXERCISES) {
        skippedRows++;
        continue;
      }
      entry = { position: workout.exercises.size, sets: [] };
      workout.exercises.set(exercise, entry);
    }
    const sets = entry.sets;
    if (sets.length >= MAX_SETS) {
      skippedRows++;
      continue;
    }
    const weight = iWeight >= 0 ? num(r[iWeight]) : null;
    sets.push({
      exercise_name: exercise,
      exercise_position: entry.position,
      set_number: sets.length + 1,
      weight: weight !== null && weight > 0 ? Math.min(MAX_WEIGHT, Math.round(weight * 100) / 100) : null,
      reps: Math.min(MAX_REPS, Math.round(reps)),
      unit,
    });
  }

  const workouts: ImportWorkout[] = [];
  for (const [key, w] of byWorkout) {
    const sets = Array.from(w.exercises.values()).flatMap((e) => e.sets);
    workouts.push({
      external_key: key,
      started_at: w.started.toISOString(),
      name: w.name,
      duration_minutes: w.duration,
      sets,
    });
  }
  workouts.sort((a, b) => a.started_at.localeCompare(b.started_at));

  return { workouts, skippedRows, error: workouts.length ? null : "No sets with reps found in that file." };
}
