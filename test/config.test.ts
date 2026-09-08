import { describe, expect, it } from "vitest";
import { DEFAULTS, normalizeConfig } from "../src/config";

describe("config", () => {
  it("requires a supported entity", () => {
    expect(() => normalizeConfig({} as never)).toThrow(/entity/);
    expect(() => normalizeConfig({ entity: "light.x" })).toThrow(/not supported/);
    expect(() => normalizeConfig({ entity: "noDot" })).toThrow(/entity/);
  });

  it("fills defaults for optional fields", () => {
    const c = normalizeConfig({ entity: "climate.lr" });
    expect(c).toMatchObject(DEFAULTS);
    expect(c.entity).toBe("climate.lr");
    expect(c.type).toBe("custom:custom-thermostat-card");
  });

  it("keeps valid overrides and rejects bad enum values", () => {
    const c = normalizeConfig({
      entity: "water_heater.tank",
      display: "full",
      thumb: "always",
      number_animation: "banana",
      open_behavior: "inline",
    });
    expect(c.display).toBe("full");
    expect(c.thumb).toBe("always");
    expect(c.number_animation).toBe("odometer"); // fallback
    expect(c.open_behavior).toBe("inline");
  });

  it("dial_style defaults to arc, keeps valid values, rejects unknown", () => {
    expect(normalizeConfig({ entity: "climate.lr" }).dial_style).toBe("arc");
    for (const style of ["arc", "ticks", "gradient", "thermometer", "minimal"]) {
      expect(normalizeConfig({ entity: "climate.lr", dial_style: style }).dial_style).toBe(style);
    }
    expect(normalizeConfig({ entity: "climate.lr", dial_style: "horseshoe" }).dial_style).toBe("arc");
  });

  it("preserves unknown keys for editor round-trips", () => {
    const c = normalizeConfig({ entity: "climate.lr", grid_options: { columns: 6 } }) as unknown as Record<
      string,
      unknown
    >;
    expect(c.grid_options).toEqual({ columns: 6 });
  });
});
