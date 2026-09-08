import { LitElement, css, html, svg, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  arcPath,
  pointOnArc,
  pointerToFraction,
  barFraction,
  valueToFraction,
  fractionToValue,
} from "./dial-geometry";
import type { DialStyle } from "../config";
import type { TargetSlot } from "../controllers/temperature-controller";
import "./animated-temperature";

const R = 42;
const CX = 50;
const CY = 50;

// thermometer bar geometry (its own 40×200 viewBox)
const BAR = { x: 9, y: 6, w: 22, h: 188 };

export interface DialChange {
  value: number;
  slot: TargetSlot;
}

/**
 * Temperature dial. One element, five looks (`dialStyle`): `arc` (slim
 * horseshoe, default), `ticks`, `gradient`, `thermometer`, `minimal`. All
 * five share the pointer / keyboard / a11y layer and support single and
 * dual-setpoint (heat/cool) entities.
 *
 * Emits intent events only:
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
  /** reflected so CSS can key off `:host([dial-style="minimal"])` etc. */
  @property({ type: String, attribute: "dial-style", reflect: true }) dialStyle: DialStyle = "arc";
  @property({ type: String }) activityColor = "var(--atc-idle)";
  @property({ type: String }) targetLabel = "";
  @property({ type: String }) activityLabel = "";
  @property({ type: Number }) current: number | null = null;
  /** swap the readout so the current temperature is the big value */
  @property({ type: Boolean }) showCurrentAsPrimary = false;
  @property({ type: String }) currentLabel = "Current";

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
  private pointerId: number | null = null;
  private moveTarget: EventTarget | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    // pointerdown on the host, capture phase — so we claim the gesture before
    // an ancestor swipe/carousel (simple-swipe-card, Swiper) can start tracking
    this.addEventListener("pointerdown", this.onPointerDown);
    this.addEventListener("lostpointercapture", this.onLostCapture);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("pointerdown", this.onPointerDown);
    this.removeEventListener("lostpointercapture", this.onLostCapture);
    this.endDrag();
  }

  static styles = css`
    :host {
      display: block;
      width: var(--atc-dial-size, 220px);
      height: var(--atc-dial-size, 220px);
      position: relative;
      touch-action: none;
    }
    .dial-slider {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      /* keep the browser (and ancestor swipe carousels) from stealing the drag */
      touch-action: none;
      outline: none;
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
      overflow: visible;
      touch-action: none;
    }
    .track {
      fill: none;
      stroke: var(--atc-track);
      stroke-width: var(--atc-track-width, 8);
      stroke-linecap: round;
    }
    .arc {
      fill: none;
      stroke: var(--atc-arc-color, currentColor);
      stroke-width: var(--atc-track-width, 8);
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
      transition: opacity 160ms linear;
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
      stroke-width: 2;
      pointer-events: none;
    }
    /* only in the DOM while actively dragging (see renderSingleArc) */
    .thumb-touch {
      fill: color-mix(in srgb, var(--atc-arc-color, currentColor) 22%, transparent);
      stroke: var(--atc-arc-color, currentColor);
      stroke-width: 1.5;
      pointer-events: none;
    }
    .tick {
      transition: none;
    }
    .dial-slider:focus-visible {
      outline: 2px solid var(--atc-focus);
      outline-offset: 4px;
      border-radius: 14px;
    }

    /* ---- minimal: number is the control, gauge is a hairline ---- */
    :host([dial-style="minimal"]) {
      --atc-track-width: 3px;
    }
    :host([dial-style="minimal"]) .center {
      padding: 0 8%;
    }
    :host([dial-style="minimal"]) .readout {
      font-size: 3.6rem;
    }
    :host([dial-style="minimal"]) .thumb-touch {
      display: none;
    }

    /* ---- thermometer: capsule + readout, no circle ---- */
    .thermo {
      display: flex;
      align-items: stretch;
      gap: 16px;
      width: 100%;
      height: 100%;
    }
    .thermo-svg {
      width: 56px;
      height: 100%;
      flex: none;
    }
    .thermo-side {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      text-align: start;
      gap: 4px;
      min-width: 0;
      flex: 1;
    }
    .thermo-side .range-readout {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    @media (prefers-reduced-motion: reduce) {
      .range-readout .slot,
      .thumb-touch {
        transition: none;
      }
    }
  `;

  // ---- shared geometry helpers -------------------------------------
  private fractionFor(slot: TargetSlot): number {
    const v = slot === "low" ? this.low : slot === "high" ? this.high : this.value ?? this.min;
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

  /** Pointer position → fraction, dispatched by style (angle vs vertical). */
  private pointerFraction(ev: PointerEvent): number {
    if (this.dialStyle === "thermometer") {
      const bar = this.renderRoot.querySelector(".bar-track") as SVGRectElement | null;
      const r = (bar ?? this).getBoundingClientRect();
      return barFraction(ev.clientY - r.top, r.height);
    }
    const [cx, cy] = this.center();
    return pointerToFraction(ev.clientX - cx, ev.clientY - cy);
  }

  // ---- pointer ----------------------------------------------------
  private onPointerDown = (ev: PointerEvent) => {
    if (this.disabled || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    const path = ev.composedPath();
    const surface = this.renderRoot.querySelector(".dial-slider");
    if (!surface || !path.includes(surface)) return;
    if (path.some((n) => n instanceof HTMLButtonElement || n instanceof HTMLAnchorElement)) return;

    ev.stopPropagation();
    this.pointerId = ev.pointerId;
    let captured = false;
    try {
      this.setPointerCapture(ev.pointerId);
      captured = true;
    } catch {
      /* fall back to window listeners */
    }
    const target: EventTarget = captured ? this : window;
    target.addEventListener("pointermove", this.onPointerMove as EventListener, { passive: false });
    target.addEventListener("pointerup", this.onPointerUp as EventListener);
    target.addEventListener("pointercancel", this.onPointerCancel as EventListener);
    this.moveTarget = target;

    this.startXY = [ev.clientX, ev.clientY];
    this.gestureRecognized = false;
    const f = this.pointerFraction(ev);
    this.activeSlot = this.nearestSlot(f);
    if (this.range && this.activeSlot !== this.selectedSlot) {
      this.dispatchEvent(new CustomEvent("slot-select", { detail: { slot: this.activeSlot } }));
    }
    // `dragging` only becomes true once the gesture clears the 3px threshold
    // (see onPointerMove) so a tap never flashes the interaction thumb
  };

  private endDrag(): void {
    const target = this.moveTarget;
    if (target) {
      target.removeEventListener("pointermove", this.onPointerMove as EventListener);
      target.removeEventListener("pointerup", this.onPointerUp as EventListener);
      target.removeEventListener("pointercancel", this.onPointerCancel as EventListener);
      this.moveTarget = null;
    }
    if (this.pointerId != null) {
      try {
        this.releasePointerCapture(this.pointerId);
      } catch {
        /* already released */
      }
      this.pointerId = null;
    }
    this.gestureRecognized = false;
    this.dragging = false;
    this.removeAttribute("data-dragging");
  }

  private onLostCapture = () => {
    // browser yanked the capture (element moved, gesture interrupted) — treat
    // as a release so the drag state can never get stuck
    if (this.pointerId == null) return;
    const wasDragging = this.dragging;
    this.endDrag();
    if (wasDragging) this.dispatchEvent(new CustomEvent("dial-commit"));
  };

  private onPointerMove = (ev: PointerEvent) => {
    if (this.pointerId == null || ev.pointerId !== this.pointerId) return;
    if (!this.gestureRecognized) {
      const dx = ev.clientX - this.startXY[0];
      const dy = ev.clientY - this.startXY[1];
      if (Math.hypot(dx, dy) < 3) return; // let a tap through untouched
      this.gestureRecognized = true;
      this.dragging = true;
      this.setAttribute("data-dragging", "");
    }
    ev.preventDefault();
    ev.stopPropagation();
    let f = this.pointerFraction(ev);

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

  private onPointerUp = (ev: PointerEvent) => {
    if (this.pointerId != null && ev.pointerId !== this.pointerId) return;
    const wasDragging = this.dragging;
    this.endDrag();
    if (wasDragging) this.dispatchEvent(new CustomEvent("dial-commit"));
  };

  private onPointerCancel = (ev: PointerEvent) => {
    if (this.pointerId != null && ev.pointerId !== this.pointerId) return;
    const wasDragging = this.dragging;
    this.endDrag();
    if (wasDragging) this.dispatchEvent(new CustomEvent("dial-cancel"));
  };

  private onKeyDown = (ev: KeyboardEvent) => {
    if (this.disabled) return;
    let dir = 0;
    if (ev.key === "ArrowUp" || ev.key === "ArrowRight") dir = 1;
    else if (ev.key === "ArrowDown" || ev.key === "ArrowLeft") dir = -1;
    else return;
    ev.preventDefault();
    const slot = this.range ? this.selectedSlot : "single";
    const base = slot === "low" ? this.low : slot === "high" ? this.high : this.value ?? this.min;
    const next = (base ?? this.min) + dir * this.step;
    this.dispatchEvent(new CustomEvent<DialChange>("dial-preview", { detail: { value: next, slot } }));
    this.dispatchEvent(new CustomEvent("dial-commit"));
  };

  // ---- render ----------------------------------------------------
  render() {
    return html`
      <div
        class="dial-slider"
        role="slider"
        tabindex=${this.disabled ? -1 : 0}
        aria-valuemin=${this.min}
        aria-valuemax=${this.max}
        aria-valuenow=${this.ariaNow()}
        aria-valuetext=${this.ariaText()}
        aria-label=${this.targetLabel || "Target temperature"}
        aria-disabled=${this.disabled}
        @keydown=${this.onKeyDown}
      >
        ${this.dialStyle === "thermometer" ? this.renderThermometer() : this.renderRound()}
      </div>
    `;
  }

  private renderRound() {
    const trackPath = arcPath(0, 1, CX, CY, R);
    let layer;
    switch (this.dialStyle) {
      case "ticks":
        layer = this.renderTicks();
        break;
      case "gradient":
        layer = this.renderGradient();
        break;
      default:
        // arc + minimal share the arc renderer; minimal just restyles via CSS
        layer = this.range ? this.renderRangeArcs() : this.renderSingleArc();
    }
    const drawTrack = this.dialStyle === "arc" || this.dialStyle === "minimal";
    return html`
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        style=${`color:${this.activityColor};--atc-arc-color:${this.activityColor}`}
      >
        ${drawTrack ? svg`<path class="track" part="dial-track" d=${trackPath} />` : nothing}
        ${layer}
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
          ? svg`<circle class="thumb" part="dial-thumb" cx=${end.x} cy=${end.y} r="3.6" />`
          : nothing
      }
      ${
        this.thumb === "interaction" && this.dragging
          ? svg`<circle class="thumb-touch" part="dial-thumb" cx=${end.x} cy=${end.y} r="6.5" />`
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
        r=${this.selectedSlot === "low" ? 5 : 4} />
      <circle class="thumb" part="dial-thumb"
        style=${`stroke:${cool}`} cx=${ph.x} cy=${ph.y}
        r=${this.selectedSlot === "high" ? 5 : 4} />
    `;
  }

  /** Graduated ring of tick marks. Active span picks up the activity colour. */
  private renderTicks() {
    const N = 48;
    const dim = this.disabled;
    const heat = dim ? "var(--atc-idle)" : this.range ? "var(--atc-heat)" : "var(--atc-arc-color)";
    const cool = dim ? "var(--atc-idle)" : "var(--atc-cool)";
    const fl = this.range
      ? valueToFraction(this.low ?? this.min, this.min, this.max)
      : valueToFraction(this.value ?? this.min, this.min, this.max);
    const fh = this.range ? valueToFraction(this.high ?? this.max, this.min, this.max) : 1;
    const fCur =
      this.current != null ? valueToFraction(this.current, this.min, this.max) : null;

    const marks = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const a = pointOnArc(f, CX, CY, R - 1);
      const b = pointOnArc(f, CX, CY, R - 8);
      let color = "var(--atc-track)";
      let width = 2;
      if (this.range) {
        if (f <= fl + 1e-6) color = heat;
        else if (f >= fh - 1e-6) color = cool;
      } else if (f <= fl + 1e-6) {
        color = heat;
      }
      if (fCur != null && Math.abs(f - fCur) < 0.5 / N) {
        color = dim ? "var(--atc-idle)" : "var(--atc-text)";
        width = 3.4;
      }
      marks.push(
        svg`<line class="tick" part="dial-tick"
          x1=${a.x.toFixed(2)} y1=${a.y.toFixed(2)} x2=${b.x.toFixed(2)} y2=${b.y.toFixed(2)}
          stroke=${color} stroke-width=${width} stroke-linecap="round" />`,
      );
    }
    return svg`${marks}`;
  }

  /** Fixed cool→warm track, always visible, with bold setpoint knob(s). */
  private renderGradient() {
    const dim = this.disabled;
    const track = arcPath(0, 1, CX, CY, R);
    const fSet = valueToFraction(this.value ?? this.min, this.min, this.max);
    const fl = valueToFraction(this.low ?? this.min, this.min, this.max);
    const fh = valueToFraction(this.high ?? this.max, this.min, this.max);
    const fCur =
      this.current != null ? valueToFraction(this.current, this.min, this.max) : null;

    const knob = (f: number, sel: boolean, color: string) => {
      const p = pointOnArc(f, CX, CY, R);
      return svg`
        <circle class="thumb" part="dial-thumb" style=${`stroke:${color}`}
          cx=${p.x.toFixed(2)} cy=${p.y.toFixed(2)} r=${sel ? 7 : 6} />
        <circle part="dial-thumb" style=${`fill:${color}`}
          cx=${p.x.toFixed(2)} cy=${p.y.toFixed(2)} r="2.2" />
      `;
    };

    return svg`
      <defs>
        <linearGradient id="atc-thermal" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color=${dim ? "var(--atc-idle)" : "var(--atc-cool)"} />
          <stop offset="0.5" stop-color="var(--atc-track)" />
          <stop offset="1" stop-color=${dim ? "var(--atc-idle)" : "var(--atc-heat)"} />
        </linearGradient>
      </defs>
      <path part="dial-track" d=${track} fill="none" stroke="url(#atc-thermal)"
        stroke-width="var(--atc-track-width, 8)" stroke-linecap="round"
        opacity=${dim ? 0.4 : 0.6} />
      ${fCur != null ? this.currentNotch(fCur) : nothing}
      ${
        this.range
          ? svg`${knob(fl, this.selectedSlot === "low", dim ? "var(--atc-idle)" : "var(--atc-heat)")}
                ${knob(fh, this.selectedSlot === "high", dim ? "var(--atc-idle)" : "var(--atc-cool)")}`
          : knob(fSet, true, dim ? "var(--atc-idle)" : "var(--atc-arc-color)")
      }
    `;
  }

  private currentNotch(f: number) {
    const a = pointOnArc(f, CX, CY, R + 5.5);
    const b = pointOnArc(f, CX, CY, R - 5.5);
    return svg`<line part="dial-current"
      x1=${a.x.toFixed(2)} y1=${a.y.toFixed(2)} x2=${b.x.toFixed(2)} y2=${b.y.toFixed(2)}
      stroke="var(--atc-text-secondary)" stroke-width="2" stroke-linecap="round" opacity="0.85" />`;
  }

  /** Vertical capsule that fills to the setpoint. No circle. */
  private renderThermometer() {
    const dim = this.disabled;
    const y = (frac: number) => BAR.y + BAR.h * (1 - frac);
    const heat = dim ? "var(--atc-idle)" : "var(--atc-heat)";
    const fCur =
      this.current != null ? valueToFraction(this.current, this.min, this.max) : null;

    const cool = dim ? "var(--atc-idle)" : "var(--atc-cool)";
    let fill;
    if (this.range) {
      const fl = valueToFraction(this.low ?? this.min, this.min, this.max);
      const fh = valueToFraction(this.high ?? this.max, this.min, this.max);
      fill = svg`
        <defs>
          <linearGradient id="atc-bar" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stop-color=${heat} />
            <stop offset="1" stop-color=${cool} />
          </linearGradient>
        </defs>
        <rect x=${BAR.x} y=${y(fh).toFixed(1)} width=${BAR.w}
          height=${Math.max(0, BAR.h * (fh - fl)).toFixed(1)} fill="url(#atc-bar)" />`;
    } else {
      const f = valueToFraction(this.value ?? this.min, this.min, this.max);
      fill = svg`<rect x=${BAR.x} y=${y(f).toFixed(1)} width=${BAR.w}
        height=${Math.max(0, BAR.h * f).toFixed(1)}
        fill=${dim ? "var(--atc-idle)" : "var(--atc-arc-color)"} />`;
    }

    return html`
      <div class="thermo">
        <svg
          class="thermo-svg"
          viewBox="0 0 40 200"
          aria-hidden="true"
          style=${`color:${this.activityColor};--atc-arc-color:${this.activityColor}`}
        >
          <defs>
            <clipPath id="atc-cap">
              <rect x=${BAR.x} y=${BAR.y} width=${BAR.w} height=${BAR.h} rx=${BAR.w / 2} />
            </clipPath>
          </defs>
          <rect
            class="bar-track"
            x=${BAR.x}
            y=${BAR.y}
            width=${BAR.w}
            height=${BAR.h}
            rx=${BAR.w / 2}
            fill="var(--atc-track)"
          />
          <g clip-path="url(#atc-cap)">${fill}</g>
          ${
            fCur != null
              ? svg`<line x1=${BAR.x - 5} y1=${y(fCur).toFixed(1)} x2=${BAR.x + BAR.w + 5}
                  y2=${y(fCur).toFixed(1)} stroke="var(--atc-text)" stroke-width="2.5"
                  stroke-linecap="round" />`
              : nothing
          }
        </svg>
        <div class="thermo-side" part="dial-readout">${this.renderCenter()}</div>
      </div>
    `;
  }

  private get currentAsPrimary(): boolean {
    return this.showCurrentAsPrimary && this.current != null;
  }

  private bigNumber(value: number) {
    return html`<span class="readout"
      ><atc-number
        .value=${value}
        .precision=${this.precision}
        .locale=${this.locale}
        .animation=${this.animation}
      ></atc-number
      >${this.unitLetter ? html`<span class="unit">${this.unitLetter}</span>` : nothing}</span
    >`;
  }

  private slotButton(slot: "low" | "high", value: number | null, label: string, color: string) {
    return html`<button
      type="button"
      class="slot ${this.selectedSlot === slot ? "sel" : ""}"
      aria-pressed=${this.selectedSlot === slot}
      @click=${() => this.dispatchEvent(new CustomEvent("slot-select", { detail: { slot } }))}
    >
      <small style=${`color:${color}`}>${label}</small>
      <span class="v"
        ><atc-number
          .value=${value ?? 0}
          .precision=${this.precision}
          .locale=${this.locale}
          .animation=${this.animation}
        ></atc-number
      ></span>
    </button>`;
  }

  private renderCenter() {
    const rangeSelector = html`<div class="range-readout">
      ${this.slotButton("low", this.low, "Heat", "var(--atc-heat)")}
      ${this.slotButton("high", this.high, "Cool", "var(--atc-cool)")}
    </div>`;

    if (this.range) {
      if (this.currentAsPrimary) {
        return html`
          <span class="label">${this.currentLabel}</span>
          ${this.bigNumber(this.current as number)}
          ${rangeSelector}
          ${this.activityLabel ? html`<span class="sub">${this.activityLabel}</span>` : nothing}
        `;
      }
      return html`
        <span class="label">${this.targetLabel}</span>
        ${rangeSelector}
        ${this.current != null
          ? html`<span class="sub">${this.fmtNum(this.current)}${this.unitShort()} ${this.nowLabel()}</span>`
          : nothing}
      `;
    }

    if (this.currentAsPrimary) {
      return html`
        <span class="label">${this.currentLabel}</span>
        ${this.bigNumber(this.current as number)}
        <span class="sub">
          ${this.targetLabel} ${this.fmtNum(this.value ?? this.min)}${this.unitShort()}${this.activityLabel
            ? html` · ${this.activityLabel}`
            : nothing}
        </span>
      `;
    }

    return html`
      <span class="label">${this.targetLabel}</span>
      ${this.bigNumber(this.value ?? 0)}
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
