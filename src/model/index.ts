import type { HomeAssistant } from "../ha/types";
import type { ThermostatAdapter } from "./adapter";
import { ClimateAdapter } from "./climate-adapter";
import { WaterHeaterAdapter } from "./water-heater-adapter";

export * from "./adapter";
export { ClimateAdapter } from "./climate-adapter";
export { WaterHeaterAdapter } from "./water-heater-adapter";

/** Build the domain adapter for an entity, or null if it is missing/unsupported. */
export function makeAdapter(
  hass: HomeAssistant,
  entityId: string,
  nameOverride?: string,
): ThermostatAdapter | null {
  const entity = hass.states[entityId];
  if (!entity) return null;
  const domain = entityId.split(".")[0];
  if (domain === "climate") return new ClimateAdapter(entity, hass, nameOverride);
  if (domain === "water_heater") return new WaterHeaterAdapter(entity, hass, nameOverride);
  return null;
}
