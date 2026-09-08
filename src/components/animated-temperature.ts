import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Animated numeric readout.
 *
 * Motion is deliberately **linear and continuous**: on any value change the
 * displayed number moves toward the target at a constant rate (clamped to a
 * 90–500 ms window) and never snaps or overshoots. If the target moves again
 * mid-flight — e.g. while dragging the dial — the readout simply keeps
 * tracking it, so the digits trail the finger smoothly.
 *
 * `number_animation` (`odometer` | `reel`) is kept for config compatibility;
 * both now render the same continuous count. Under `prefers-reduced-motion`
 * (or when `--atc-roll-duration` is `0ms`) the value updates instantly.
 */
@customElement("atc-number")
export class AtcNumber extends LitElement {
  @property({ type: Number }) value = 0;
  @property({ type: Number }) precision = 1;
  @property({ type: String }) locale = "en";
  @property({ type: String }) suffix = "°";
  @property({ type: String }) animation: "odometer" | "reel" = "odometer";

  /** continuously interpolated value actually shown */
  private shown = 0;
  private started = false;
  private raf = 0;
  private prevTs = 0;
  /** units per ms — constant within a segment, so motion is linear */
  private speed = 0;
  private segTarget = Number.NaN;

  static styles = css`
    :host {
      display: inline-flex;
      align-items: baseline;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .suffix {
      margin-left: 0.02em;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `;

  firstUpdated(): void {
    this.shown = this.value;
    this.started = true;
  }

  willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("value") && this.started && this.shown !== this.value) {
      this.retarget();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private retarget(): void {
    if (this.reducedMotion()) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.shown = this.value;
      this.requestUpdate();
      return;
    }
    this.setSegment();
    if (!this.raf) {
      this.prevTs = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  /** Pick a constant speed for the current shown → value segment. */
  private setSegment(): void {
    const dist = Math.abs(this.value - this.shown);
    const dur = Math.min(500, Math.max(90, dist / 0.03));
    this.speed = dur > 0 ? dist / dur : 0.03;
    this.segTarget = this.value;
  }

  private frame = (ts?: number): void => {
    const now =
      typeof ts === "number"
        ? ts
        : typeof performance !== "undefined"
          ? performance.now()
          : Date.now();
    if (!this.prevTs) this.prevTs = now;
    const raw = now - this.prevTs;
    const dt = Number.isFinite(raw) && raw > 0 ? Math.min(50, raw) : 16;
    this.prevTs = now;

    if (this.value !== this.segTarget) this.setSegment(); // target moved (drag)

    const diff = this.value - this.shown;
    const move = this.speed * dt;
    if (move === 0 || Math.abs(diff) <= move) {
      this.shown = this.value;
      this.raf = 0;
      this.requestUpdate();
      return;
    }
    this.shown += Math.sign(diff) * move;
    this.requestUpdate();
    this.raf = requestAnimationFrame(this.frame);
  };

  private reducedMotion(): boolean {
    try {
      if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return true;
      }
    } catch {
      /* jsdom / no matchMedia */
    }
    try {
      const d = getComputedStyle(this).getPropertyValue("--atc-roll-duration").trim();
      return d === "0ms" || d === "0s" || d === "0";
    } catch {
      return false;
    }
  }

  private fmt(n: number): string {
    return n.toLocaleString(this.locale, {
      minimumFractionDigits: this.precision,
      maximumFractionDigits: this.precision,
      useGrouping: false,
    });
  }

  render() {
    // while a frame loop is live, show the interpolated value; otherwise the
    // real one (covers first paint, settled state and reduced motion)
    const shownStr = this.fmt(this.raf ? this.shown : this.value);
    const targetStr = this.fmt(this.value);
    return html`
      <span
        aria-hidden="true"
        style="min-width:${targetStr.length}ch; display:inline-block; text-align:inherit;"
        >${shownStr}</span
      >
      <span class="suffix" aria-hidden="true">${this.suffix}</span>
      <span class="sr-only">${targetStr}${this.suffix}</span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "atc-number": AtcNumber;
  }
}
