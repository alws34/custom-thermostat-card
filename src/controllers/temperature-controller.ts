import { clamp, snapToStep, type NormalizedThermostat, type ThermostatAdapter } from "../model";

export type TargetSlot = "single" | "low" | "high";
export type StepDirection = 1 | -1;

const COMMIT_DEBOUNCE_MS = 450;
const RECONCILE_TIMEOUT_MS = 6000;

interface Pending {
  single: number | null;
  low: number | null;
  high: number | null;
  since: number;
}

/**
 * Owns interaction state for one thermostat: optimistic values, clamping,
 * debounced service calls and reconciliation with authoritative state.
 * Framework-agnostic; call `attach()` with a redraw callback.
 */
export class TemperatureController {
  private adapter: ThermostatAdapter | null = null;
  private model: NormalizedThermostat | null = null;
  private pending: Pending | null = null;
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private redraw: () => void = () => {};
  private lastError: string | null = null;

  selectedSlot: TargetSlot = "single";

  attach(redraw: () => void): void {
    this.redraw = redraw;
  }

  /** Feed the latest normalised state on every hass update. */
  sync(adapter: ThermostatAdapter, model: NormalizedThermostat): void {
    this.adapter = adapter;
    this.model = model;

    if (!model.available) {
      this.clearPending();
    } else if (this.pending) {
      const settled =
        eqAt(this.pending.single, model.target, model.precision) &&
        eqAt(this.pending.low, model.targetLow, model.precision) &&
        eqAt(this.pending.high, model.targetHigh, model.precision);
      const expired = Date.now() - this.pending.since > RECONCILE_TIMEOUT_MS;
      if (settled || expired) this.clearPending();
    }

    // keep a valid selection for the current mode
    if (model.isRange && this.selectedSlot === "single") this.selectedSlot = "low";
    if (!model.isRange && this.selectedSlot !== "single") this.selectedSlot = "single";
  }

  get error(): string | null {
    return this.lastError;
  }

  // ---- read -----------------------------------------------------------

  get displaySingle(): number | null {
    return this.pending?.single ?? this.model?.target ?? null;
  }
  get displayLow(): number | null {
    return this.pending?.low ?? this.model?.targetLow ?? null;
  }
  get displayHigh(): number | null {
    return this.pending?.high ?? this.model?.targetHigh ?? null;
  }

  /** value currently under keyboard/stepper control */
  get activeValue(): number | null {
    if (this.selectedSlot === "low") return this.displayLow;
    if (this.selectedSlot === "high") return this.displayHigh;
    return this.displaySingle;
  }

  get isOptimistic(): boolean {
    return this.pending != null;
  }

  // ---- write --------------------------------------------------------

  select(slot: TargetSlot): void {
    this.selectedSlot = slot;
    this.redraw();
  }

  /** Discrete nudge from ▲ / ▼ or arrow keys. Debounced commit. */
  nudge(direction: StepDirection, slot: TargetSlot = this.selectedSlot): void {
    const m = this.model;
    if (!m || !m.available) return;
    const base = this.valueFor(slot);
    if (base == null) return;
    const next = snapToStep(base + direction * m.step, m.min, m.max, m.step);
    this.setOptimistic(slot, next);
    this.scheduleCommit();
  }

  /** Live drag preview — no service call until commit(). */
  preview(value: number, slot: TargetSlot = this.selectedSlot): void {
    const m = this.model;
    if (!m || !m.available) return;
    this.setOptimistic(slot, snapToStep(value, m.min, m.max, m.step));
  }

  /** Pointer release / explicit flush. */
  commit(): void {
    if (this.commitTimer) {
      clearTimeout(this.commitTimer);
      this.commitTimer = null;
    }
    void this.flush();
  }

  /** Pointer cancel — drop the optimistic edit. */
  cancel(): void {
    if (this.commitTimer) {
      clearTimeout(this.commitTimer);
      this.commitTimer = null;
    }
    this.clearPending();
    this.redraw();
  }

  async setMode(mode: string): Promise<void> {
    if (!this.adapter) return;
    try {
      await this.adapter.setMode(mode);
      this.lastError = null;
    } catch (err) {
      this.lastError = String(err);
      this.redraw();
    }
  }

  async setSecondary(kind: Parameters<ThermostatAdapter["setSecondary"]>[0], value: string): Promise<void> {
    if (!this.adapter) return;
    try {
      await this.adapter.setSecondary(kind, value);
      this.lastError = null;
    } catch (err) {
      this.lastError = String(err);
      this.redraw();
    }
  }

  // ---- internals ---------------------------------------------------

  private valueFor(slot: TargetSlot): number | null {
    if (slot === "low") return this.displayLow;
    if (slot === "high") return this.displayHigh;
    return this.displaySingle;
  }

  private setOptimistic(slot: TargetSlot, value: number): void {
    const m = this.model!;
    const p: Pending = this.pending ?? {
      single: m.target,
      low: m.targetLow,
      high: m.targetHigh,
      since: Date.now(),
    };
    p.since = Date.now();
    if (slot === "single") {
      p.single = value;
    } else if (slot === "low") {
      p.low = value;
      if (p.high != null && p.low > p.high - m.step) p.high = clamp(p.low + m.step, m.min, m.max);
    } else {
      p.high = value;
      if (p.low != null && p.high < p.low + m.step) p.low = clamp(p.high - m.step, m.min, m.max);
    }
    this.pending = p;
    this.redraw();
  }

  private scheduleCommit(): void {
    if (this.commitTimer) clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => {
      this.commitTimer = null;
      void this.flush();
    }, COMMIT_DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    const m = this.model;
    const p = this.pending;
    if (!m || !p || !this.adapter) return;
    try {
      if (m.isRange && p.low != null && p.high != null) {
        await this.adapter.setRange(p.low, p.high);
      } else if (p.single != null) {
        await this.adapter.setTarget(p.single);
      }
      this.lastError = null;
      if (this.pending) this.pending.since = Date.now(); // start reconcile window
    } catch (err) {
      this.lastError = String(err);
      this.clearPending(); // roll back to authoritative
      this.redraw();
    }
  }

  private clearPending(): void {
    this.pending = null;
  }
}

function eqAt(a: number | null, b: number | null, precision: number): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) < Math.pow(10, -precision) / 2 + 1e-9;
}
