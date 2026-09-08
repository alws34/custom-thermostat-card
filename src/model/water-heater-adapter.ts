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

// WaterHeaterEntityFeature bitmask (current Home Assistant)
const F = {
  TARGET_TEMPERATURE: 1,
  OPERATION_MODE: 2,
  AWAY_MODE: 4,
  ON_OFF: 8,
} as const;

export class WaterHeaterAdapter implements ThermostatAdapter {
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
      this.hass.localize(`component.water_heater.entity_component._.state.${mode}`) ||
      mode.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }

  normalize(): NormalizedThermostat {
    const a = this.entity.attributes;
    const unit = this.hass.config.unit_system.temperature || "°C";
    const step = resolveStep(this.entity, unit);
    const precision = resolvePrecision(this.hass, this.entity, step);

    const state = this.entity.state;
    const available = state !== "unavailable" && state !== "unknown";

    const min = numOrNull(a.min_temp) ?? (unit === "°F" ? 110 : 43);
    const max = numOrNull(a.max_temp) ?? (unit === "°F" ? 140 : 60);

    const targetLow = numOrNull(a.target_temp_low);
    const targetHigh = numOrNull(a.target_temp_high);
    const isRange = targetLow != null && targetHigh != null;

    const isOff = state === "off";
    const away = a.away_mode === "on" || a.away_mode === true;
    const activity: HvacActivity = !available ? "unavailable" : isOff ? "off" : away ? "idle" : "heating";
    const activityLabel = !available
      ? this.hass.localize("state.default.unavailable") || "Unavailable"
      : this.localizeMode(state);

    const operationList = (Array.isArray(a.operation_list) ? (a.operation_list as string[]) : []).filter(
      Boolean,
    );
    const modes: ModeOption[] = operationList.map((value) => ({
      value,
      label: this.localizeMode(value),
      activity: value === "off" ? "off" : "heating",
    }));

    return {
      entityId: this.entity.entity_id,
      name: friendlyName(this.entity, this.nameOverride),
      available,
      current: numOrNull(a.current_temperature),
      target: isRange ? null : numOrNull(a.temperature),
      targetLow: isRange ? targetLow : null,
      targetHigh: isRange ? targetHigh : null,
      isRange,
      supportsRange: isRange,
      min,
      max,
      step,
      precision,
      unit,
      activity,
      activityLabel,
      targetLabel: this.hass.localize("ui.card.water_heater.target_temperature") || "Set to",
      modes,
      currentMode: typeof a.operation_mode === "string" ? (a.operation_mode as string) : state,
      secondary: this.secondary(away),
    };
  }

  private secondary(away: boolean): SecondaryControl[] {
    if (!this.has(F.AWAY_MODE)) return [];
    return [
      {
        kind: "away",
        label: this.hass.localize("ui.card.water_heater.away_mode") || "Away mode",
        value: away ? "on" : "off",
        options: [
          { value: "off", label: this.hass.localize("state.default.off") || "Off" },
          { value: "on", label: this.hass.localize("state.default.on") || "On" },
        ],
      },
    ];
  }

  // ---- actions ---------------------------------------------------------

  async setTarget(value: number): Promise<void> {
    await this.hass.callService(
      "water_heater",
      "set_temperature",
      { temperature: value },
      { entity_id: this.entity.entity_id },
    );
  }

  async setRange(low: number, high: number): Promise<void> {
    const a = this.entity.attributes;
    const min = numOrNull(a.min_temp) ?? low;
    const max = numOrNull(a.max_temp) ?? high;
    await this.hass.callService(
      "water_heater",
      "set_temperature",
      {
        target_temp_low: clamp(Math.min(low, high), min, max),
        target_temp_high: clamp(Math.max(low, high), min, max),
      },
      { entity_id: this.entity.entity_id },
    );
  }

  async setMode(mode: string): Promise<void> {
    await this.hass.callService(
      "water_heater",
      "set_operation_mode",
      { operation_mode: mode },
      { entity_id: this.entity.entity_id },
    );
  }

  async setSecondary(kind: SecondaryKind, value: string): Promise<void> {
    if (kind !== "away") return;
    await this.hass.callService(
      "water_heater",
      "set_away_mode",
      { away_mode: value === "on" },
      { entity_id: this.entity.entity_id },
    );
  }
}
