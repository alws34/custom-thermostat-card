import type { HassEntity, HomeAssistant } from "../src/ha/types";

export interface ServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
  target?: unknown;
}

export function makeHass(entity: HassEntity, calls: ServiceCall[] = []): HomeAssistant {
  return {
    states: { [entity.entity_id]: entity },
    entities: {},
    themes: { darkMode: false },
    language: "en",
    locale: { language: "en" },
    config: { unit_system: { temperature: "°C" } },
    localize: () => "",
    async callService(domain, service, data, target) {
      calls.push({ domain, service, data: data ?? {}, target });
    },
  } as HomeAssistant;
}

export function climateEntity(overrides: Partial<HassEntity> = {}): HassEntity {
  return {
    entity_id: "climate.living_room",
    state: "heat",
    last_changed: "",
    last_updated: "",
    context: { id: "1" },
    attributes: {
      friendly_name: "Living Room",
      current_temperature: 21.3,
      temperature: 22,
      min_temp: 7,
      max_temp: 35,
      target_temp_step: 0.5,
      hvac_modes: ["off", "heat", "cool", "heat_cool", "auto"],
      hvac_action: "heating",
      supported_features: 1 | 2 | 8 | 16, // temp + range + fan + preset
      fan_modes: ["auto", "low", "high"],
      fan_mode: "auto",
      preset_modes: ["none", "eco", "comfort"],
      preset_mode: "comfort",
      ...overrides.attributes,
    },
    ...overrides,
  };
}

export function waterHeaterEntity(overrides: Partial<HassEntity> = {}): HassEntity {
  return {
    entity_id: "water_heater.tank",
    state: "eco",
    last_changed: "",
    last_updated: "",
    context: { id: "1" },
    attributes: {
      friendly_name: "Water Heater",
      current_temperature: 48,
      temperature: 50,
      min_temp: 43,
      max_temp: 60,
      operation_list: ["off", "eco", "electric", "performance"],
      operation_mode: "eco",
      away_mode: "off",
      supported_features: 1 | 2 | 4, // temp + operation + away
      ...overrides.attributes,
    },
    ...overrides,
  };
}
