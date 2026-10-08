import { describe, it, expect } from "vitest";
import {
  EXERCISES,
  buildSetPayload,
  formatElapsed,
  formatSet,
  groupSetsByExercise,
  lastSessionSets,
  searchExercises,
  workoutDurationMinutes,
  type DraftWorkout,
  type SavedSet,
} from "./workout";

function draft(exercises: DraftWorkout["exercises"]): DraftWorkout {
  return { startedAt: "2026-10-08T15:00:00Z", note: "", unit: "lb", exercises };
}

describe("exercise list", () => {
  it("is loaded from Free Exercise DB without stretches", () => {
    expect(EXERCISES.length).toBeGreaterThan(500);
    expect(EXERCISES.some((e) => e.name === "Barbell Squat")).toBe(true);
  });
});

describe("searchExercises", () => {
  it("matches every word in any order", () => {
    const names = searchExercises("press bench").map((e) => e.name);
    expect(names).toContain("Barbell Bench Press - Medium Grip");
  });

  it("ranks names that start with the query first", () => {
    const [first] = searchExercises("bench press");
    expect(first.name.toLowerCase().startsWith("bench press")).toBe(true);
  });

  it("filters by equipment", () => {
    const results = searchExercises("curl", "dumbbell");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((e) => e.equipment === "dumbbell")).toBe(true);
  });
});

describe("buildSetPayload", () => {
  it("drops blank sets and exercises, and renumbers what's left", () => {
    const payload = buildSetPayload(
      draft([
        {
          key: "a",
          exerciseId: "Barbell_Squat",
          name: "Barbell Squat",
          equipment: "barbell",
          sets: [
            { weight: "225", reps: "5" },
            { weight: "", reps: "" },
            { weight: "235", reps: "3" },
          ],
        },
        { key: "b", exerciseId: null, name: "Empty", equipment: null, sets: [{ weight: "", reps: "" }] },
        { key: "c", exerciseId: null, name: "Pull-ups", equipment: null, sets: [{ weight: "", reps: "10" }] },
      ])
    );
    expect(payload).toEqual([
      { exercise_id: "Barbell_Squat", exercise_name: "Barbell Squat", exercise_position: 0, set_number: 1, weight: 225, reps: 5, unit: "lb" },
      { exercise_id: "Barbell_Squat", exercise_name: "Barbell Squat", exercise_position: 0, set_number: 2, weight: 235, reps: 3, unit: "lb" },
      { exercise_id: null, exercise_name: "Pull-ups", exercise_position: 1, set_number: 1, weight: null, reps: 10, unit: "lb" },
    ]);
  });

  it("ignores zero or invalid reps", () => {
    const payload = buildSetPayload(
      draft([
        {
          key: "a",
          exerciseId: null,
          name: "Row",
          equipment: null,
          sets: [
            { weight: "100", reps: "0" },
            { weight: "100", reps: "abc" },
          ],
        },
      ])
    );
    expect(payload).toEqual([]);
  });
});

describe("workoutDurationMinutes", () => {
  it("rounds to whole minutes and caps at 1000", () => {
    expect(workoutDurationMinutes("2026-10-08T15:00:00Z", new Date("2026-10-08T15:47:40Z"))).toBe(48);
    expect(workoutDurationMinutes("2026-10-01T00:00:00Z", new Date("2026-10-08T00:00:00Z"))).toBe(1000);
  });
});

describe("formatting", () => {
  it("formats the timer", () => {
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
  });

  it("formats sets with and without weight", () => {
    expect(formatSet({ weight: 135, reps: 8, unit: "lb" })).toBe("135 lb × 8");
    expect(formatSet({ weight: null, reps: 12, unit: "lb" })).toBe("× 12");
  });
});

function saved(activity: string, position: number, set: number, weight = 100): SavedSet {
  return { activity_id: activity, exercise_name: "Bench", exercise_position: position, set_number: set, weight, reps: 5, unit: "lb" };
}

describe("lastSessionSets", () => {
  it("keeps only the newest workout's sets, in set order", () => {
    const result = lastSessionSets([saved("new", 0, 2, 110), saved("new", 0, 1, 105), saved("old", 0, 1, 95)]);
    expect(result.map((s) => s.weight)).toEqual([105, 110]);
  });
});

describe("groupSetsByExercise", () => {
  it("groups by position in workout order", () => {
    const groups = groupSetsByExercise([
      { ...saved("a", 1, 1), exercise_name: "Row" },
      saved("a", 0, 2),
      saved("a", 0, 1),
    ]);
    expect(groups.map((g) => [g.name, g.sets.length])).toEqual([
      ["Bench", 2],
      ["Row", 1],
    ]);
  });
});
