import type { HassEntity, HomeAssistant } from "../ha/types";

export type HvacActivity = "heating" | "cooling" | "drying" | "fan" | "idle" | "off" | "unavailable";

export interface ModeOption {
  value: string;
  label: string;
  /** semantic activity used only for colour/iconography */
  activity: HvacActivity;
}

export type SecondaryKind = "preset" | "fan" | "swing" | "swing_horizontal" | "away";

export interface SecondaryControl {
  kind: SecondaryKind;
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
}

/**
 * Normalised, domain-agnostic view of a thermostat-like entity. Visual
 * components only ever see this shape; they never read hass attributes or
 * call services directly.
 */
export interface NormalizedThermostat {
  entityId: string;
  name: string;
  available: boolean;

  current: number | null;
  target: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  /** entity currently exposes a valid low/high pair */
  isRange: boolean;
  /** entity is *capable* of a range even if a single target is active now */
  supportsRange: boolean;

  min: number;
  max: number;
  step: number;
  /** decimal places to render */
  precision: number;
  unit: string;

  activity: HvacActivity;
  /** short contextual label, e.g. "Heating", "Idle" */
  activityLabel: string;
  /** contextual verb for the readout, e.g. "Heat to", "Set to" */
  targetLabel: string;

  modes: ModeOption[];
  currentMode: string;

  secondary: SecondaryControl[];
}

export interface ThermostatAdapter {
  readonly entity: HassEntity;
  normalize(): NormalizedThermostat;

  setTarget(value: number): Promise<void>;
  setRange(low: number, high: number): Promise<void>;
  setMode(mode: string): Promise<void>;
  setSecondary(kind: SecondaryKind, value: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

export function numOrNull(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function friendlyName(entity: HassEntity, override?: string): string {
  return override || (entity.attributes.friendly_name as string) || entity.entity_id;
}

/**
 * Step size: entity `target_temp_step` wins; otherwise HA's fallback of
 * 0.5°C / 1°F. Never hard-code whole degrees.
 */
export function resolveStep(entity: HassEntity, unit: string): number {
  const declared = numOrNull(entity.attributes.target_temp_step);
  if (declared && declared > 0) return declared;
  return unit === "°F" ? 1 : 0.5;
}

/** Decimal places to display: registry display_precision, else derived from step. */
export function resolvePrecision(hass: HomeAssistant, entity: HassEntity, step: number): number {
  const registry = hass.entities?.[entity.entity_id]?.display_precision;
  if (typeof registry === "number") return registry;
  return Number.isInteger(step) ? 0 : 1;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to the nearest step, anchored at min, then clamp. */
export function snapToStep(value: number, min: number, max: number, step: number): number {
  if (!(step > 0)) return clamp(value, min, max);
  const snapped = min + Math.round((value - min) / step) * step;
  // avoid 20.00000004 style drift
  const decimals = Number.isInteger(step) ? 0 : (step.toString().split(".")[1]?.length ?? 2);
  return clamp(Number(snapped.toFixed(decimals)), min, max);
}
