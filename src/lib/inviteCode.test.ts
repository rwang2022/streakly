import { describe, it, expect } from "vitest";
import { generateInviteCode } from "./inviteCode";

const ALLOWED = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;

describe("generateInviteCode", () => {
  it("returns 7 characters from the unambiguous alphabet by default", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(7);
      expect(code).toMatch(ALLOWED);
    }
  });

  it("respects a custom length", () => {
    expect(generateInviteCode(12)).toHaveLength(12);
  });

  it("doesn't repeat itself across many draws", () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateInviteCode()));
    expect(codes.size).toBe(1000);
  });
});
