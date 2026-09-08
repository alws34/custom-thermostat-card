import { LitElement, css, html, svg, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  arcPath,
  pointOnArc,
  pointerToFraction,
  valueToFraction,
  fractionToValue,
} from "./dial-geometry";
import type { TargetSlot } from "../controllers/temperature-controller";
import "./animated-temperature";

const R = 42;
const CX = 50;
const CY = 50;

export interface DialChange {
  value: number;
  slot: TargetSlot;
}

/**
 * Horseshoe temperature dial. Emits intent events only:
 *  - `dial-preview`  {value, slot}  during drag / keyboard
 *  - `dial-commit`                  on pointer release
 *  - `dial-cancel`                  on pointer cancel
 *  - `slot-select`   {slot}         when a range endpoint is chosen
 */
@customElement("atc-dial")
export class AtcDial extends LitElement {
  @property({ type: Number }) min = 7;
  @property({ type: Number }) max = 35;
  @property({ type: Number }) step = 0.5;
  @property({ type: Number }) precision = 1;
  @property({ type: String }) unit = "°C";
  @property({ type: String }) locale = "en";
  @property({ type: String }) animation: "odometer" | "reel" = "odometer";
  @property({ type: String }) thumb: "interaction" | "always" | "never" = "interaction";
  @property({ type: String }) activityColor = "var(--atc-idle)";
  @property({ type: String }) targetLabel = "";
  @property({ type: String }) activityLabel = "";
  @property({ type: Number }) current: number | null = null;

  @property({ type: Boolean }) range = false;
  @property({ type: Number }) value: number | null = null;
  @property({ type: Number }) low: number | null = null;
  @property({ type: Number }) high: number | null = null;
  @property({ type: String }) selectedSlot: TargetSlot = "single";
  @property({ type: Boolean }) disabled = false;

  @state() private dragging = false;
  private activeSlot: TargetSlot = "single";
  private gestureRecognized = false;
  private startXY: [number, number] = [0, 0];

  static styles = css`
    :host {
      display: block;
      width: var(--atc-dial-size, 220px);
      height: var(--atc-dial-size, 220px);
      position: relative;
      touch-action: none;
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
    }
    .track {
      fill: none;
      stroke: var(--atc-track);
      stroke-width: var(--atc-track-width, 14);
      stroke-linecap: round;
    }
    .arc {
      fill: none;
      stroke: var(--atc-arc-color, currentColor);
      stroke-width: var(--atc-track-width, 14);
      stroke-linecap: round;
      /* deliberately no transition on the d attribute: the browser cannot
         interpolate an SVG arc when the large-arc / sweep flags flip mid-drag
         and renders wild shapes. The arc must track the finger exactly. */
    }
    .hit {
      fill: none;
      stroke: transparent;
      stroke-width: 22;
      cursor: grab;
    }
    :host([disabled]) .hit {
      cursor: default;
    }
    .center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      pointer-events: none;
      padding: 0 18%;
    }
    .label {
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--atc-text-secondary);
    }
    .readout {
      font-size: 2.9rem;
      font-weight: 500;
      letter-spacing: -0.04em;
      color: var(--atc-text);
      display: inline-flex;
      align-items: flex-start;
    }
    .readout .unit {
      font-size: 0.4em;
      font-weight: 600;
      color: var(--atc-text-secondary);
      margin-top: 0.55em;
      margin-left: 0.08em;
    }
    .sub {
      font-size: 0.75rem;
      color: var(--atc-text-secondary);
    }
    .range-readout {
      display: flex;
      gap: 0.9rem;
      align-items: baseline;
      pointer-events: auto;
    }
    /* HA-native treatment: opacity only, no background chip */
    .range-readout .slot {
      border: none;
      background: none;
      padding: 0;
      font: inherit;
      color: inherit;
      cursor: pointer;
      opacity: 0.5;
      transition: opacity 160ms ease;
    }
    .range-readout .slot.sel {
      opacity: 1;
    }
    .range-readout .slot:focus-visible {
      outline: none;
      opacity: 1;
      transform: scale(1.06);
    }
    .range-readout .slot small {
      display: block;
      font-size: 0.6rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .range-readout .slot .v {
      font-size: 1.6rem;
      font-weight: 500;
      letter-spacing: -0.03em;
    }
    .thumb {
      fill: var(--atc-surface);
      stroke: var(--atc-arc-color, currentColor);
      stroke-width: 3;
      pointer-events: none;
    }
    .thumb-touch {
      fill: color-mix(in srgb, var(--atc-arc-color, currentColor) 22%, transparent);
      stroke: var(--atc-arc-color, currentColor);
      stroke-width: 1.5;
      opacity: 0;
      transition: opacity 160ms ease;
      pointer-events: none;
    }
    :host([data-dragging]) .thumb-touch {
      opacity: 1;
    }
    :host(:focus-visible) {
      outline: none;
    }
    :host(:focus-visible) .track {
      stroke: var(--atc-focus);
    }
  `;

  private fractionFor(slot: TargetSlot): number {
    const v =
      slot === "low" ? this.low : slot === "high" ? this.high : this.value ?? this.min;
    return valueToFraction(v ?? this.min, this.min, this.max);
  }

  private center(): [number, number] {
    const svgEl = this.renderRoot.querySelector("svg");
    const r = (svgEl ?? this).getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  private nearestSlot(fraction: number): TargetSlot {
    if (!this.range) return "single";
    const dl = Math.abs(fraction - this.fractionFor("low"));
    const dh = Math.abs(fraction - this.fractionFor("high"));
    return dl <= dh ? "low" : "high";
  }

  private onPointerDown = (ev: PointerEvent) => {
    if (this.disabled) return;
    (ev.target as Element).setPointerCapture(ev.pointerId);
    this.startXY = [ev.clientX, ev.clientY];
    this.gestureRecognized = false;
    const [cx, cy] = this.center();
    const f = pointerToFraction(ev.clientX - cx, ev.clientY - cy);
    this.activeSlot = this.nearestSlot(f);
    if (this.range && this.activeSlot !== this.selectedSlot) {
      this.dispatchEvent(new CustomEvent("slot-select", { detail: { slot: this.activeSlot } }));
    }
    this.dragging = true;
    this.setAttribute("data-dragging", "");
  };

  private onPointerMove = (ev: PointerEvent) => {
    if (!this.dragging) return;
    if (!this.gestureRecognized) {
      const dx = ev.clientX - this.startXY[0];
      const dy = ev.clientY - this.startXY[1];
      if (Math.hypot(dx, dy) < 4) return; // not yet a drag — keep page scrollable
      this.gestureRecognized = true;
    }
    ev.preventDefault();
    const [cx, cy] = this.center();
    let f = pointerToFraction(ev.clientX - cx, ev.clientY - cy);

    // in range mode keep the dragged endpoint on its own side of the other
    if (this.range) {
      const span = this.max - this.min;
      const gap = span > 0 ? this.step / span : 0;
      if (this.activeSlot === "low") {
        f = Math.min(f, valueToFraction(this.high ?? this.max, this.min, this.max) - gap);
      } else if (this.activeSlot === "high") {
        f = Math.max(f, valueToFraction(this.low ?? this.min, this.min, this.max) + gap);
      }
      f = Math.min(1, Math.max(0, f));
    }

    const raw = fractionToValue(f, this.min, this.max);
    this.dispatchEvent(
      new CustomEvent<DialChange>("dial-preview", { detail: { value: raw, slot: this.activeSlot } }),
    );
  };

  private onPointerUp = () => {
    if (!this.dragging) return;
    this.dragging = false;
    this.removeAttribute("data-dragging");
    this.dispatchEvent(new CustomEvent("dial-commit"));
  };

  private onPointerCancel = () => {
    if (!this.dragging) return;
    this.dragging = false;
    this.removeAttribute("data-dragging");
    this.dispatchEvent(new CustomEvent("dial-cancel"));
  };

  private onKeyDown = (ev: KeyboardEvent) => {
    if (this.disabled) return;
    let dir = 0;
    if (ev.key === "ArrowUp" || ev.key === "ArrowRight") dir = 1;
    else if (ev.key === "ArrowDown" || ev.key === "ArrowLeft") dir = -1;
    else return;
    ev.preventDefault();
    const slot = this.range ? this.selectedSlot : "single";
    const base =
      slot === "low" ? this.low : slot === "high" ? this.high : this.value ?? this.min;
    const next = (base ?? this.min) + dir * this.step;
    this.dispatchEvent(new CustomEvent<DialChange>("dial-preview", { detail: { value: next, slot } }));
    this.dispatchEvent(new CustomEvent("dial-commit"));
  };

  render() {
    const trackPath = arcPath(0, 1, CX, CY, R);
    const active = this.range
      ? this.renderRangeArcs()
      : this.renderSingleArc();
    return html`
      <svg
        viewBox="0 0 100 100"
        role="slider"
        tabindex=${this.disabled ? -1 : 0}
        aria-valuemin=${this.min}
        aria-valuemax=${this.max}
        aria-valuenow=${this.ariaNow()}
        aria-valuetext=${this.ariaText()}
        aria-label=${this.targetLabel || "Target temperature"}
        aria-disabled=${this.disabled}
        style=${`color:${this.activityColor};--atc-arc-color:${this.activityColor}`}
        @pointerdown=${this.onPointerDown}
        @pointermove=${this.onPointerMove}
        @pointerup=${this.onPointerUp}
        @pointercancel=${this.onPointerCancel}
        @keydown=${this.onKeyDown}
      >
        <path class="track" part="dial-track" d=${trackPath} />
        ${active}
        <path class="hit" part="dial-hit" d=${trackPath} />
      </svg>
      <div class="center" part="dial-readout">${this.renderCenter()}</div>
    `;
  }

  private renderSingleArc() {
    const f = valueToFraction(this.value ?? this.min, this.min, this.max);
    const end = pointOnArc(f, CX, CY, R);
    return svg`
      <path class="arc" part="dial-arc" d=${arcPath(0, Math.max(f, 0.001), CX, CY, R)} />
      ${
        this.thumb === "always"
          ? svg`<circle class="thumb" part="dial-thumb" cx=${end.x} cy=${end.y} r="4.5" />`
          : nothing
      }
      ${
        this.thumb === "interaction"
          ? svg`<circle class="thumb-touch" part="dial-thumb" cx=${end.x} cy=${end.y} r="9" />`
          : nothing
      }
    `;
  }

  /**
   * Dual-setpoint arcs, matching Home Assistant's built-in
   * ha-control-circular-slider `dual` mode: the heat arc runs from the low
   * tip up to the low handle, the cool arc from the high handle up to the
   * high tip, and the comfort window between stays on the plain track.
   */
  private renderRangeArcs() {
    const fl = valueToFraction(this.low ?? this.min, this.min, this.max);
    const fh = valueToFraction(this.high ?? this.max, this.min, this.max);
    const pl = pointOnArc(fl, CX, CY, R);
    const ph = pointOnArc(fh, CX, CY, R);
    const heat = this.disabled ? "var(--atc-idle)" : "var(--atc-heat)";
    const cool = this.disabled ? "var(--atc-idle)" : "var(--atc-cool)";
    return svg`
      <path class="arc" part="dial-arc" style=${`stroke:${heat}`}
        d=${arcPath(0, Math.max(fl, 0.001), CX, CY, R)} />
      <path class="arc" part="dial-arc" style=${`stroke:${cool}`}
        d=${arcPath(Math.min(fh, 0.999), 1, CX, CY, R)} />
      <circle class="thumb" part="dial-thumb"
        style=${`stroke:${heat}`} cx=${pl.x} cy=${pl.y}
        r=${this.selectedSlot === "low" ? 6 : 4.5} />
      <circle class="thumb" part="dial-thumb"
        style=${`stroke:${cool}`} cx=${ph.x} cy=${ph.y}
        r=${this.selectedSlot === "high" ? 6 : 4.5} />
    `;
  }

  private renderCenter() {
    if (this.range) {
      return html`
        <span class="label">${this.targetLabel}</span>
        <div class="range-readout">
          <button
            type="button"
            class="slot ${this.selectedSlot === "low" ? "sel" : ""}"
            aria-pressed=${this.selectedSlot === "low"}
            @click=${() => this.dispatchEvent(new CustomEvent("slot-select", { detail: { slot: "low" } }))}
          >
            <small style="color:var(--atc-heat)">Heat</small>
            <span class="v"
              ><atc-number
                .value=${this.low ?? 0}
                .precision=${this.precision}
                .locale=${this.locale}
                .animation=${this.animation}
              ></atc-number
            ></span>
          </button>
          <button
            type="button"
            class="slot ${this.selectedSlot === "high" ? "sel" : ""}"
            aria-pressed=${this.selectedSlot === "high"}
            @click=${() => this.dispatchEvent(new CustomEvent("slot-select", { detail: { slot: "high" } }))}
          >
            <small style="color:var(--atc-cool)">Cool</small>
            <span class="v"
              ><atc-number
                .value=${this.high ?? 0}
                .precision=${this.precision}
                .locale=${this.locale}
                .animation=${this.animation}
              ></atc-number
            ></span>
          </button>
        </div>
        ${this.current != null
          ? html`<span class="sub">${this.fmtNum(this.current)}${this.unitShort()} ${this.nowLabel()}</span>`
          : nothing}
      `;
    }
    return html`
      <span class="label">${this.targetLabel}</span>
      <span class="readout"
        ><atc-number
          .value=${this.value ?? 0}
          .precision=${this.precision}
          .locale=${this.locale}
          .animation=${this.animation}
        ></atc-number
        >${this.unitLetter ? html`<span class="unit">${this.unitLetter}</span>` : nothing}</span
      >
      ${this.current != null
        ? html`<span class="sub">${this.activityLabel} · ${this.fmtNum(this.current)}${this.unitShort()}</span>`
        : this.activityLabel
          ? html`<span class="sub">${this.activityLabel}</span>`
          : nothing}
    `;
  }

  private nowLabel() {
    return "now";
  }
  /** "C" / "F" — the temperature scale, for an explicit on-card indicator */
  private get unitLetter(): string {
    return (this.unit || "").replace("°", "").trim();
  }
  private unitShort() {
    return `°${this.unitLetter}`;
  }
  private fmtNum(n: number) {
    return n.toLocaleString(this.locale, {
      minimumFractionDigits: this.precision,
      maximumFractionDigits: this.precision,
      useGrouping: false,
    });
  }
  private ariaNow(): number {
    if (this.range) return (this.selectedSlot === "high" ? this.high : this.low) ?? this.min;
    return this.value ?? this.min;
  }
  private ariaText(): string {
    return `${this.fmtNum(this.ariaNow())}${this.unit}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "atc-dial": AtcDial;
  }
}
