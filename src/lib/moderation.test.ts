import { describe, it, expect } from "vitest";
import { combineSuspicion, type ManualFlag } from "./moderation";

const flag: ManualFlag = {
  userId: "u1",
  flaggedBy: "admin1",
  reason: "admitted to fudging logs",
  createdAt: "2026-08-01T00:00:00Z",
};

describe("combineSuspicion", () => {
  it("is not suspicious when nothing applies", () => {
    const result = combineSuspicion({
      heuristicSuspicious: false,
      heuristicReason: null,
      heuristicClearedByVouch: false,
      manualFlag: null,
    });
    expect(result).toEqual({
      isSuspicious: false,
      isVouched: false,
      suspicionReason: null,
    });
  });

  it("is suspicious and not vouched when only the heuristic trips", () => {
    const result = combineSuspicion({
      heuristicSuspicious: true,
      heuristicReason: "5 days in a row logged at exactly 300 min",
      heuristicClearedByVouch: false,
      manualFlag: null,
    });
    expect(result.isSuspicious).toBe(true);
    expect(result.isVouched).toBe(false);
    expect(result.suspicionReason).toBe(
      "5 days in a row logged at exactly 300 min"
    );
  });

  it("clears the penalty once an admin vouch clears the heuristic", () => {
    const result = combineSuspicion({
      heuristicSuspicious: true,
      heuristicReason: "5 days in a row logged at exactly 300 min",
      heuristicClearedByVouch: true,
      manualFlag: null,
    });
    expect(result.isSuspicious).toBe(true);
    expect(result.isVouched).toBe(true);
  });

  it("is suspicious from a manual flag alone, even with no heuristic hit", () => {
    const result = combineSuspicion({
      heuristicSuspicious: false,
      heuristicReason: null,
      heuristicClearedByVouch: false,
      manualFlag: flag,
    });
    expect(result.isSuspicious).toBe(true);
    expect(result.isVouched).toBe(false);
    expect(result.suspicionReason).toBe(
      "Flagged by a mod: admitted to fudging logs"
    );
  });

  it("uses generic wording when a manual flag has no reason", () => {
    const result = combineSuspicion({
      heuristicSuspicious: false,
      heuristicReason: null,
      heuristicClearedByVouch: false,
      manualFlag: { ...flag, reason: null },
    });
    expect(result.suspicionReason).toBe("Flagged by a mod");
  });

  // The core rule this whole module exists to enforce: a vouch only ever
  // clears the algorithmic heuristic, never a manual mod flag. Even if the
  // heuristic side gets vouched-clear, the manual flag alone should keep
  // the penalty in place.
  it("stays penalized when a manual flag coexists with a vouched-clear heuristic", () => {
    const result = combineSuspicion({
      heuristicSuspicious: true,
      heuristicReason: "5 days in a row logged at exactly 300 min",
      heuristicClearedByVouch: true,
      manualFlag: flag,
    });
    expect(result.isSuspicious).toBe(true);
    expect(result.isVouched).toBe(false);
    expect(result.suspicionReason).toBe(
      "5 days in a row logged at exactly 300 min · Flagged by a mod: admitted to fudging logs"
    );
  });
});
