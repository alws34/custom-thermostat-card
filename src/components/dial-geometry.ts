// Pure geometry for the horseshoe dial. No DOM. Fully unit-tested.
//
// The arc is a 270° "horseshoe" with a 90° gap centred at the bottom of the
// dial. Fraction 0 is the lower-left tip, fraction 1 the lower-right tip,
// sweeping clockwise over the top.

export const ARC_START_DEG = 135; // where fraction 0 sits (screen degrees, 90 = down)
export const ARC_SWEEP_DEG = 270;

export interface Point {
  x: number;
  y: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function valueToFraction(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp01((value - min) / (max - min));
}

export function fractionToValue(fraction: number, min: number, max: number): number {
  return min + clamp01(fraction) * (max - min);
}

/** Point on the arc for a fraction, given centre and radius. */
export function pointOnArc(fraction: number, cx: number, cy: number, r: number): Point {
  const deg = ARC_START_DEG + clamp01(fraction) * ARC_SWEEP_DEG;
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Pointer position (relative to the dial centre) → fraction along the arc.
 * Positions inside the bottom gap snap to whichever tip is closer.
 */
export function pointerToFraction(dx: number, dy: number): number {
  let a = (Math.atan2(dy, dx) * 180) / Math.PI; // [-180, 180]
  a = (a + 360) % 360; // [0, 360)
  let t = a - ARC_START_DEG;
  if (t < 0) t += 360; // [0, 360), 0 at fraction-0 tip
  if (t > ARC_SWEEP_DEG) {
    // inside the bottom gap: snap to the nearer tip
    return t > (ARC_SWEEP_DEG + 360) / 2 ? 0 : 1;
  }
  return clamp01(t / ARC_SWEEP_DEG);
}

/** SVG arc `d` path from fraction f0 to f1 along the horseshoe. */
export function arcPath(f0: number, f1: number, cx: number, cy: number, r: number): string {
  const p0 = pointOnArc(f0, cx, cy, r);
  const p1 = pointOnArc(f1, cx, cy, r);
  const largeArc = Math.abs(f1 - f0) * ARC_SWEEP_DEG > 180 ? 1 : 0;
  const sweep = f1 >= f0 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/** Total arc length of the full horseshoe (for stroke-dasharray tricks). */
export function arcLength(r: number): number {
  return (ARC_SWEEP_DEG / 360) * 2 * Math.PI * r;
}

/**
 * Vertical fraction for the thermometer style: `offsetY` is the pointer's
 * position from the top of the bar track, `height` the track height.
 * Top of the bar is fraction 1 (max), bottom is fraction 0 (min).
 */
export function barFraction(offsetY: number, height: number): number {
  if (height <= 0) return 0;
  return clamp01(1 - offsetY / height);
}
