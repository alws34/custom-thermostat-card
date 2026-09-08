import { describe, expect, it } from "vitest";
import { makeAdapter } from "../src/model";
import { ClimateAdapter } from "../src/model/climate-adapter";
import { WaterHeaterAdapter } from "../src/model/water-heater-adapter";
import { climateEntity, makeHass, waterHeaterEntity, type ServiceCall } from "./helpers";

describe("climate adapter", () => {
  it("normalizes a single-target heating entity", () => {
    const e = climateEntity();
    const m = new ClimateAdapter(e, makeHass(e)).normalize();
    expect(m.name).toBe("Living Room");
    expect(m.available).toBe(true);
    expect(m.current).toBe(21.3);
    expect(m.target).toBe(22);
    expect(m.isRange).toBe(false);
    expect(m.supportsRange).toBe(true);
    expect(m.step).toBe(0.5);
    expect(m.precision).toBe(1);
    expect(m.activity).toBe("heating");
    expect(m.modes.map((x) => x.value)).toEqual(["off", "heat", "cool", "heat_cool", "auto"]);
    expect(m.currentMode).toBe("heat");
  });

  it("exposes a range only in heat_cool with both targets", () => {
    const e = climateEntity({
      state: "heat_cool",
      attributes: {
        ...climateEntity().attributes,
        temperature: null,
        target_temp_low: 19.5,
        target_temp_high: 23,
      },
    });
    const m = new ClimateAdapter(e, makeHass(e)).normalize();
    expect(m.isRange).toBe(true);
    expect(m.targetLow).toBe(19.5);
    expect(m.targetHigh).toBe(23);
    expect(m.target).toBeNull();
  });

  it("derives 1° step for Fahrenheit when none advertised", () => {
    const e = climateEntity({ attributes: { ...climateEntity().attributes, target_temp_step: undefined } });
    const hass = makeHass(e);
    hass.config.unit_system.temperature = "°F";
    const m = new ClimateAdapter(e, hass).normalize();
    expect(m.step).toBe(1);
    expect(m.precision).toBe(0);
  });

  it("marks unavailable entities non-interactive but keeps identity", () => {
    const e = climateEntity({ state: "unavailable" });
    const m = new ClimateAdapter(e, makeHass(e)).normalize();
    expect(m.available).toBe(false);
    expect(m.activity).toBe("unavailable");
    expect(m.name).toBe("Living Room");
  });

  it("builds capability-driven secondary controls only for supported features", () => {
    const e = climateEntity();
    const m = new ClimateAdapter(e, makeHass(e)).normalize();
    const kinds = m.secondary.map((s) => s.kind).sort();
    expect(kinds).toEqual(["fan", "preset"]);
    // swing not supported -> absent
    expect(m.secondary.find((s) => s.kind === "swing")).toBeUndefined();
  });

  it("sends the documented service payloads", async () => {
    const calls: ServiceCall[] = [];
    const e = climateEntity();
    const a = new ClimateAdapter(e, makeHass(e, calls));
    await a.setTarget(23);
    await a.setRange(24, 20); // deliberately crossed
    await a.setMode("cool");
    await a.setSecondary("fan", "high");
    expect(calls[0]).toMatchObject({ domain: "climate", service: "set_temperature", data: { temperature: 23 } });
    expect(calls[1].data).toEqual({ target_temp_low: 20, target_temp_high: 24 }); // un-crossed
    expect(calls[2]).toMatchObject({ service: "set_hvac_mode", data: { hvac_mode: "cool" } });
    expect(calls[3]).toMatchObject({ service: "set_fan_mode", data: { fan_mode: "high" } });
  });
});

describe("water heater adapter", () => {
  it("normalizes operation modes and away control", () => {
    const e = waterHeaterEntity();
    const m = new WaterHeaterAdapter(e, makeHass(e)).normalize();
    expect(m.current).toBe(48);
    expect(m.target).toBe(50);
    expect(m.activity).toBe("heating");
    expect(m.modes.map((x) => x.value)).toContain("performance");
    expect(m.secondary[0].kind).toBe("away");
  });

  it("uses water_heater services, not climate ones", async () => {
    const calls: ServiceCall[] = [];
    const e = waterHeaterEntity();
    const a = new WaterHeaterAdapter(e, makeHass(e, calls));
    await a.setTarget(55);
    await a.setMode("electric");
    await a.setSecondary("away", "on");
    expect(calls[0]).toMatchObject({ domain: "water_heater", service: "set_temperature" });
    expect(calls[1]).toMatchObject({ service: "set_operation_mode", data: { operation_mode: "electric" } });
    expect(calls[2]).toMatchObject({ service: "set_away_mode", data: { away_mode: true } });
  });

  it("off state reads as off activity", () => {
    const e = waterHeaterEntity({ state: "off" });
    const m = new WaterHeaterAdapter(e, makeHass(e)).normalize();
    expect(m.activity).toBe("off");
  });
});

describe("adapter factory", () => {
  it("picks the right adapter per domain and null for the rest", () => {
    const c = climateEntity();
    const w = waterHeaterEntity();
    expect(makeAdapter(makeHass(c), c.entity_id)).toBeInstanceOf(ClimateAdapter);
    expect(makeAdapter(makeHass(w), w.entity_id)).toBeInstanceOf(WaterHeaterAdapter);
    expect(makeAdapter(makeHass(c), "sensor.x")).toBeNull();
  });
});
