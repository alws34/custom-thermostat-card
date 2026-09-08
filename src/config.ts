export type DisplayMode = "compact" | "full";
export type OpenBehavior = "overlay" | "inline";
export type ThumbMode = "interaction" | "always" | "never";
export type NumberAnimation = "odometer" | "reel";
export type Appearance = "auto" | "light" | "dark";

export interface ThermostatCardConfig {
  type: string;
  entity: string;
  name?: string;
  display: DisplayMode;
  open_behavior: OpenBehavior;
  thumb: ThumbMode;
  number_animation: NumberAnimation;
  /** Show the current temperature as the prominent value instead of the target. */
  show_current_as_primary: boolean;
  /** Progressive "More controls" section (presets, fan, swing…). */
  secondary_controls: boolean;
  appearance: Appearance;
  /** Standard Home Assistant per-card theme override. */
  theme?: string;
}

export const DEFAULTS: Omit<ThermostatCardConfig, "type" | "entity" | "name" | "theme"> = {
  display: "compact",
  open_behavior: "overlay",
  thumb: "interaction",
  number_animation: "odometer",
  show_current_as_primary: false,
  secondary_controls: true,
  appearance: "auto",
};

const DISPLAY: DisplayMode[] = ["compact", "full"];
const OPEN: OpenBehavior[] = ["overlay", "inline"];
const THUMB: ThumbMode[] = ["interaction", "always", "never"];
const ANIM: NumberAnimation[] = ["odometer", "reel"];
const APPEARANCE: Appearance[] = ["auto", "light", "dark"];

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

const SUPPORTED_DOMAINS = ["climate", "water_heater"];

/**
 * Validate and normalise raw YAML/editor config. Throws a concise error for
 * required fields; every optional field falls back to a safe default and
 * unknown keys are preserved for editor round-trips.
 */
export function normalizeConfig(raw: Record<string, unknown>): ThermostatCardConfig {
  const entity = raw.entity;
  if (typeof entity !== "string" || !entity.includes(".")) {
    throw new Error("custom-thermostat-card: `entity` is required (a climate or water_heater entity id).");
  }
  const domain = entity.split(".")[0];
  if (!SUPPORTED_DOMAINS.includes(domain)) {
    throw new Error(
      `custom-thermostat-card: entity domain "${domain}" is not supported. Use a climate or water_heater entity.`,
    );
  }

  return {
    ...raw,
    type: typeof raw.type === "string" ? raw.type : "custom:custom-thermostat-card",
    entity,
    name: typeof raw.name === "string" ? raw.name : undefined,
    display: pick(raw.display, DISPLAY, DEFAULTS.display),
    open_behavior: pick(raw.open_behavior, OPEN, DEFAULTS.open_behavior),
    thumb: pick(raw.thumb, THUMB, DEFAULTS.thumb),
    number_animation: pick(raw.number_animation, ANIM, DEFAULTS.number_animation),
    show_current_as_primary:
      typeof raw.show_current_as_primary === "boolean"
        ? raw.show_current_as_primary
        : DEFAULTS.show_current_as_primary,
    secondary_controls:
      typeof raw.secondary_controls === "boolean" ? raw.secondary_controls : DEFAULTS.secondary_controls,
    appearance: pick(raw.appearance, APPEARANCE, DEFAULTS.appearance),
    theme: typeof raw.theme === "string" ? raw.theme : undefined,
  } as ThermostatCardConfig;
}

export function stubConfig(entity = "climate.example"): Record<string, unknown> {
  return { type: "custom:custom-thermostat-card", entity, ...DEFAULTS };
}
