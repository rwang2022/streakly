import { describe, it, expect } from "vitest";
import { parseCsv, parseDurationMinutes, parseStrongCsv, parseStrongDate } from "./strongImport";

const HEADER = "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n', ",")).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });
});

describe("parseDurationMinutes", () => {
  it("reads Strong's h/m/s forms and bare seconds", () => {
    expect(parseDurationMinutes("1h 5m")).toBe(65);
    expect(parseDurationMinutes("45m")).toBe(45);
    expect(parseDurationMinutes("2h")).toBe(120);
    expect(parseDurationMinutes("3600")).toBe(60);
    expect(parseDurationMinutes("")).toBeNull();
  });
});

describe("parseStrongDate", () => {
  it("reads a local date-time", () => {
    const d = parseStrongDate("2024-03-05 18:30:00")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2024, 2, 5, 18, 30]);
  });
});

describe("parseStrongCsv", () => {
  const csv = [
    HEADER,
    '2024-03-05 18:30:00,"Push Day",1h 5m,Bench Press (Barbell),1,135,8,,,,,',
    "2024-03-05 18:30:00,Push Day,1h 5m,Bench Press (Barbell),2,145,6,,,,,",
    "2024-03-05 18:30:00,Push Day,1h 5m,Push Up,1,0,20,,,,,",
    "2024-03-05 18:30:00,Push Day,1h 5m,Bench Press (Barbell),3,155,4,,,,,",
    "2024-03-05 18:30:00,Push Day,1h 5m,Running,1,,,3.1,1500,,,",
    "2024-03-07 07:00:00,Legs,50m,Squat (Barbell),1,225,5,,,,,",
  ].join("\n");

  it("groups sets into workouts and exercises in order", () => {
    const { workouts, skippedRows, error } = parseStrongCsv(csv, "lb");
    expect(error).toBeNull();
    expect(skippedRows).toBe(1); // the cardio row has no reps
    expect(workouts.map((w) => [w.name, w.duration_minutes, w.sets.length])).toEqual([
      ["Push Day", 65, 4],
      ["Legs", 50, 1],
    ]);
    const push = workouts[0].sets;
    expect(push.map((s) => [s.exercise_name, s.exercise_position, s.set_number, s.weight, s.reps])).toEqual([
      ["Bench Press (Barbell)", 0, 1, 135, 8],
      ["Bench Press (Barbell)", 0, 2, 145, 6],
      ["Bench Press (Barbell)", 0, 3, 155, 4],
      ["Push Up", 1, 1, null, 20],
    ]);
  });

  it("gives each workout a stable key so re-imports are skipped", () => {
    const a = parseStrongCsv(csv, "lb").workouts.map((w) => w.external_key);
    const b = parseStrongCsv(csv, "kg").workouts.map((w) => w.external_key);
    expect(a).toEqual(b);
    expect(a[0]).toBe("strong:2024-03-05 18:30:00|Push Day");
  });

  it("accepts semicolon-separated exports with headers in any order", () => {
    const semi = "Reps;Exercise Name;Date;Weight\n10;Curl;2024-01-01 10:00:00;30\n";
    const { workouts } = parseStrongCsv(semi, "kg");
    expect(workouts[0].sets[0]).toMatchObject({ exercise_name: "Curl", reps: 10, weight: 30, unit: "kg" });
  });

  it("drops durations from workouts left running for hours", () => {
    const left = `${HEADER}\n2026-06-13 11:39:11,"Morning Workout",28h 42m,"Seated Row (Machine)",1,70.0,12.0,0,0.0,\n`;
    expect(parseStrongCsv(left, "lb").workouts[0].duration_minutes).toBeNull();
  });

  it("rejects files that aren't Strong exports", () => {
    expect(parseStrongCsv("name,age\nBob,3\n", "lb").error).toMatch(/Strong export/);
  });
});
