import { describe, expect, it } from "vitest";
import {
  ARC_SWEEP_DEG,
  arcLength,
  fractionToValue,
  pointOnArc,
  pointerToFraction,
  valueToFraction,
} from "../src/components/dial-geometry";

describe("dial geometry", () => {
  it("maps value <-> fraction and clamps", () => {
    expect(valueToFraction(7, 7, 35)).toBe(0);
    expect(valueToFraction(35, 7, 35)).toBe(1);
    expect(valueToFraction(21, 7, 35)).toBeCloseTo(0.5, 5);
    expect(valueToFraction(0, 7, 35)).toBe(0); // clamp
    expect(valueToFraction(99, 7, 35)).toBe(1); // clamp
    expect(fractionToValue(0.5, 10, 20)).toBe(15);
  });

  it("start tip is lower-left, end tip lower-right, midpoint at top", () => {
    const start = pointOnArc(0, 50, 50, 42);
    const mid = pointOnArc(0.5, 50, 50, 42);
    const end = pointOnArc(1, 50, 50, 42);
    expect(start.x).toBeLessThan(50);
    expect(start.y).toBeGreaterThan(50);
    expect(mid.y).toBeLessThan(50); // above centre
    expect(Math.abs(mid.x - 50)).toBeLessThan(0.01);
    expect(end.x).toBeGreaterThan(50);
    expect(end.y).toBeGreaterThan(50);
  });

  it("pointer angle round-trips to fraction along the arc", () => {
    for (const f of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const p = pointOnArc(f, 0, 0, 42);
      expect(pointerToFraction(p.x, p.y)).toBeCloseTo(f, 4);
    }
  });

  it("snaps positions inside the bottom gap to the nearer tip", () => {
    // straight down = middle of the gap, closer to fraction 0 side boundary
    expect([0, 1]).toContain(pointerToFraction(0, 42));
    // just past the end tip (slightly clockwise into the gap) -> 1
    const nearEnd = pointOnArc(1, 0, 0, 42);
    expect(pointerToFraction(nearEnd.x + 2, nearEnd.y + 3)).toBe(1);
  });

  it("full horseshoe arc length is 270deg of the circle", () => {
    expect(arcLength(42)).toBeCloseTo((ARC_SWEEP_DEG / 360) * 2 * Math.PI * 42, 6);
  });
});
