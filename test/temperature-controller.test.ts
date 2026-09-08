import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemperatureController } from "../src/controllers/temperature-controller";
import { ClimateAdapter } from "../src/model/climate-adapter";
import { climateEntity, makeHass, type ServiceCall } from "./helpers";

function setup(entityOverrides = {}) {
  const calls: ServiceCall[] = [];
  const entity = climateEntity(entityOverrides);
  const hass = makeHass(entity, calls);
  const adapter = new ClimateAdapter(entity, hass);
  const ctrl = new TemperatureController();
  ctrl.attach(() => {});
  ctrl.sync(adapter, adapter.normalize());
  return { ctrl, adapter, calls, entity, hass };
}

describe("temperature controller", () => {
  beforeEach(() => vi.useRealTimers());

  it("nudges optimistically by the entity step and clamps to min/max", () => {
    const { ctrl } = setup();
    ctrl.nudge(1);
    expect(ctrl.displaySingle).toBe(22.5);
    ctrl.nudge(-1);
    ctrl.nudge(-1);
    expect(ctrl.displaySingle).toBe(21.5);
  });

  it("does not exceed max_temp", () => {
    const { ctrl } = setup({ attributes: { ...climateEntity().attributes, temperature: 34.5 } });
    ctrl.nudge(1);
    ctrl.nudge(1);
    expect(ctrl.displaySingle).toBe(35);
  });

  it("debounces stepper service calls and commits the final value", async () => {
    vi.useFakeTimers();
    const { ctrl, calls } = setup();
    ctrl.nudge(1);
    ctrl.nudge(1);
    ctrl.nudge(1);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(1);
    expect(calls[0].data).toEqual({ temperature: 23.5 });
  });

  it("drag preview tracks the raw value and only snaps on commit", () => {
    const { ctrl, calls } = setup();
    ctrl.preview(28.3);
    ctrl.preview(29.1);
    expect(calls).toHaveLength(0);
    expect(ctrl.displaySingle).toBe(29.1); // raw during the drag — no step snap
    ctrl.commit();
    expect(calls).toHaveLength(1);
    expect(calls[0].data).toEqual({ temperature: 29 }); // snapped to the 0.5 step now
    expect(ctrl.displaySingle).toBe(29);
  });

  it("cancel drops the optimistic edit back to authoritative", () => {
    const { ctrl } = setup();
    ctrl.preview(30);
    expect(ctrl.isOptimistic).toBe(true);
    ctrl.cancel();
    expect(ctrl.isOptimistic).toBe(false);
    expect(ctrl.displaySingle).toBe(22);
  });

  it("reconciles optimistic state once the authoritative value catches up", () => {
    const { ctrl, adapter, entity } = setup();
    ctrl.preview(24);
    ctrl.commit();
    expect(ctrl.isOptimistic).toBe(true);
    entity.attributes.temperature = 24; // HA confirms
    ctrl.sync(adapter, adapter.normalize());
    expect(ctrl.isOptimistic).toBe(false);
    expect(ctrl.displaySingle).toBe(24);
  });

  it("clears optimistic state when the entity goes unavailable", () => {
    const { ctrl, adapter, entity } = setup();
    ctrl.preview(24);
    entity.state = "unavailable";
    ctrl.sync(adapter, adapter.normalize());
    expect(ctrl.isOptimistic).toBe(false);
  });

  it("prevents low/high from crossing in range mode", () => {
    const { ctrl } = setup({
      state: "heat_cool",
      attributes: {
        ...climateEntity().attributes,
        temperature: null,
        target_temp_low: 19,
        target_temp_high: 20,
      },
    });
    ctrl.select("low");
    ctrl.nudge(1); // 19 -> 19.5, still below high 20
    ctrl.nudge(1); // 20 -> would meet high, high gets pushed
    expect(ctrl.displayLow!).toBeLessThan(ctrl.displayHigh!);
  });

  it("rolls back on a rejected service call", async () => {
    const { ctrl, adapter } = setup();
    vi.spyOn(adapter, "setTarget").mockRejectedValueOnce(new Error("nope"));
    ctrl.preview(24);
    ctrl.commit();
    await Promise.resolve();
    await Promise.resolve();
    expect(ctrl.isOptimistic).toBe(false);
    expect(ctrl.error).toMatch(/nope/);
  });
});
