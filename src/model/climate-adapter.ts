import type { HassEntity, HomeAssistant } from "../ha/types";
import {
  clamp,
  friendlyName,
  numOrNull,
  resolvePrecision,
  resolveStep,
  type HvacActivity,
  type ModeOption,
  type NormalizedThermostat,
  type SecondaryControl,
  type SecondaryKind,
  type ThermostatAdapter,
} from "./adapter";

// climate ClimateEntityFeature bitmask (current Home Assistant)
const F = {
  TARGET_TEMPERATURE: 1,
  TARGET_TEMPERATURE_RANGE: 2,
  FAN_MODE: 8,
  PRESET_MODE: 16,
  SWING_MODE: 32,
  TURN_OFF: 128,
  TURN_ON: 256,
  SWING_HORIZONTAL_MODE: 512,
} as const;

const MODE_ACTIVITY: Record<string, HvacActivity> = {
  off: "off",
  heat: "heating",
  cool: "cooling",
  heat_cool: "idle",
  auto: "idle",
  dry: "drying",
  fan_only: "fan",
};

const ACTION_ACTIVITY: Record<string, HvacActivity> = {
  off: "off",
  idle: "idle",
  heating: "heating",
  cooling: "cooling",
  drying: "drying",
  fan: "fan",
  preheating: "heating",
  defrosting: "heating",
};

export class ClimateAdapter implements ThermostatAdapter {
  constructor(
    public readonly entity: HassEntity,
    private hass: HomeAssistant,
    private nameOverride?: string,
  ) {}

  private has(feature: number): boolean {
    const supported = numOrNull(this.entity.attributes.supported_features) ?? 0;
    return (supported & feature) === feature;
  }

  private localizeMode(mode: string): string {
    return (
      this.hass.localize(`component.climate.entity_component._.state.${mode}`) ||
      mode.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }

  private localizeAttrOption(attr: string, value: string): string {
    return (
      this.hass.localize(`component.climate.entity_component._.state_attributes.${attr}.state.${value}`) ||
      value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }

  normalize(): NormalizedThermostat {
    const a = this.entity.attributes;
    const unit = this.hass.config.unit_system.temperature || "°C";
    const step = resolveStep(this.entity, unit);
    const precision = resolvePrecision(this.hass, this.entity, step);

    const state = this.entity.state;
    const available = state !== "unavailable" && state !== "unknown";

    const min = numOrNull(a.min_temp) ?? (unit === "°F" ? 45 : 7);
    const max = numOrNull(a.max_temp) ?? (unit === "°F" ? 95 : 35);

    const targetLow = numOrNull(a.target_temp_low);
    const targetHigh = numOrNull(a.target_temp_high);
    const supportsRange = this.has(F.TARGET_TEMPERATURE_RANGE);
    const isRange = supportsRange && targetLow != null && targetHigh != null && state === "heat_cool";

    const action = typeof a.hvac_action === "string" ? a.hvac_action : null;
    const activity: HvacActivity = !available
      ? "unavailable"
      : action && ACTION_ACTIVITY[action]
        ? ACTION_ACTIVITY[action]
        : (MODE_ACTIVITY[state] ?? "idle");

    const activityLabel = !available
      ? this.hass.localize("state.default.unavailable") || "Unavailable"
      : action
        ? this.localizeAttrOption("hvac_action", action)
        : this.localizeMode(state);

    const modeList = (Array.isArray(a.hvac_modes) ? (a.hvac_modes as string[]) : []).filter(Boolean);
    const modes: ModeOption[] = modeList.map((value) => ({
      value,
      label: this.localizeMode(value),
      activity: MODE_ACTIVITY[value] ?? "idle",
    }));

    const targetLabel = isRange
      ? this.hass.localize("ui.card.climate.target_temperature_mode") || "Set range"
      : state === "cool"
        ? this.hass.localize("ui.card.climate.cool") || "Cool to"
        : state === "heat"
          ? this.hass.localize("ui.card.climate.heat") || "Heat to"
          : this.hass.localize("ui.card.climate.target_temperature") || "Set to";

    return {
      entityId: this.entity.entity_id,
      name: friendlyName(this.entity, this.nameOverride),
      available,
      current: numOrNull(a.current_temperature),
      target: isRange ? null : numOrNull(a.temperature),
      targetLow: isRange ? targetLow : null,
      targetHigh: isRange ? targetHigh : null,
      isRange,
      supportsRange,
      min,
      max,
      step,
      precision,
      unit,
      activity,
      activityLabel,
      targetLabel,
      currentLabel: this.hass.localize("ui.card.climate.currently") || "Current",
      modes,
      currentMode: state,
      secondary: this.secondary(),
    };
  }

  private secondary(): SecondaryControl[] {
    const a = this.entity.attributes;
    const out: SecondaryControl[] = [];
    const build = (
      kind: SecondaryKind,
      attr: string,
      listAttr: string,
      labelKey: string,
      fallbackLabel: string,
      feature: number,
    ) => {
      if (!this.has(feature)) return;
      const list = Array.isArray(a[listAttr]) ? (a[listAttr] as string[]) : [];
      if (list.length === 0) return;
      out.push({
        kind,
        label: this.hass.localize(labelKey) || fallbackLabel,
        value: typeof a[attr] === "string" ? (a[attr] as string) : null,
        options: list.map((value) => ({ value, label: this.localizeAttrOption(attr, value) })),
      });
    };

    build("preset", "preset_mode", "preset_modes", "ui.card.climate.preset_mode", "Preset", F.PRESET_MODE);
    build("fan", "fan_mode", "fan_modes", "ui.card.climate.fan_mode", "Fan", F.FAN_MODE);
    build("swing", "swing_mode", "swing_modes", "ui.card.climate.swing_mode", "Swing", F.SWING_MODE);
    build(
      "swing_horizontal",
      "swing_horizontal_mode",
      "swing_horizontal_modes",
      "ui.card.climate.swing_horizontal_mode",
      "Horizontal swing",
      F.SWING_HORIZONTAL_MODE,
    );
    return out;
  }

  // ---- actions -----------------------------------------------------------

  async setTarget(value: number): Promise<void> {
    await this.hass.callService(
      "climate",
      "set_temperature",
      { temperature: value },
      { entity_id: this.entity.entity_id },
    );
  }

  async setRange(low: number, high: number): Promise<void> {
    const a = this.entity.attributes;
    const min = numOrNull(a.min_temp) ?? low;
    const max = numOrNull(a.max_temp) ?? high;
    // never cross
    const lo = clamp(Math.min(low, high), min, max);
    const hi = clamp(Math.max(low, high), min, max);
    await this.hass.callService(
      "climate",
      "set_temperature",
      { target_temp_low: lo, target_temp_high: hi },
      { entity_id: this.entity.entity_id },
    );
  }

  async setMode(mode: string): Promise<void> {
    await this.hass.callService(
      "climate",
      "set_hvac_mode",
      { hvac_mode: mode },
      { entity_id: this.entity.entity_id },
    );
  }

  async setSecondary(kind: SecondaryKind, value: string): Promise<void> {
    const service: Record<SecondaryKind, [string, string] | null> = {
      preset: ["set_preset_mode", "preset_mode"],
      fan: ["set_fan_mode", "fan_mode"],
      swing: ["set_swing_mode", "swing_mode"],
      swing_horizontal: ["set_swing_horizontal_mode", "swing_horizontal_mode"],
      away: null,
    };
    const entry = service[kind];
    if (!entry) return;
    await this.hass.callService(
      "climate",
      entry[0],
      { [entry[1]]: value },
      { entity_id: this.entity.entity_id },
    );
  }
}
