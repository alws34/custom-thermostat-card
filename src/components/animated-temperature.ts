import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Animated numeric readout.
 *
 * Motion is **linear and continuous**. A single value (`shown`) is
 * interpolated toward the target at a constant rate (segment clamped to
 * 90–500 ms) and every animation frame repositions the digit wheels from
 * that value — there is no CSS transition and nothing snaps. If the target
 * moves again mid-flight (dragging the dial) the readout just keeps tracking
 * it, so the digits trail the finger.
 *
 *  - `odometer`: per-digit wheels; the last wheel rolls continuously, higher
 *    wheels only turn in the final tenth before they carry (mechanical look).
 *  - `reel`: the whole value counts as one unit.
 *
 * Under `prefers-reduced-motion` (or when `--atc-roll-duration` is `0ms`) the
 * value updates instantly.
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
    .glyphs {
      display: inline-flex;
      align-items: baseline;
    }
    /* CSS-odometer wheel: a hidden glyph gives the box a real text baseline,
       the digit strip is absolutely positioned over it and translated. */
    .wheel {
      position: relative;
      display: inline-block;
      overflow: hidden;
      height: 1em;
    }
    .wheel::after {
      content: "8";
      visibility: hidden;
    }
    .strip {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      text-align: center;
      will-change: transform;
    }
    .strip > span {
      display: block;
      height: 1em;
    }
    .sep {
      display: inline-block;
    }
    .reel {
      display: inline-block;
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
    // during a frame loop show the interpolated value; otherwise the real one
    const display = this.raf ? this.shown : this.value;
    const targetStr = this.fmt(this.value);
    const body =
      this.animation === "reel"
        ? html`<span class="reel">${this.fmt(display)}</span>`
        : this.wheels(display, targetStr);
    return html`
      <span class="glyphs" aria-hidden="true">${body}</span>
      <span class="suffix" aria-hidden="true">${this.suffix}</span>
      <span class="sr-only">${targetStr}${this.suffix}</span>
    `;
  }

  /**
   * Per-digit wheels positioned from the continuous `value`. Wheel `k`
   * (k = 0 is the least significant printed digit) sits at
   * `digit_k + carry`, where `carry` is only non-zero in the final unit
   * before every lower wheel simultaneously rolls over — so a settled
   * reading like `19.5` shows a solid `1`, not a `1` frozen mid-turn.
   */
  private wheels(value: number, layout: string) {
    const negative = value < 0 || layout.startsWith("-");
    const scaled = Math.abs(value) * Math.pow(10, this.precision);
    const chars = layout.replace("-", "").split("");
    let placesToRight = chars.filter((c) => c >= "0" && c <= "9").length - 1;

    const out: unknown[] = [];
    if (negative) out.push(html`<span class="sep">−</span>`);
    for (const ch of chars) {
      if (ch < "0" || ch > "9") {
        out.push(html`<span class="sep">${ch}</span>`);
        continue;
      }
      const k = placesToRight--;
      const pow = Math.pow(10, k);
      const digit = Math.floor(scaled / pow) % 10;
      const below = scaled % pow; // combined value of every lower wheel
      const carry = Math.max(0, below - (pow - 1)); // 0 until the last unit
      const offset = digit + carry;
      out.push(html`
        <span class="wheel"
          ><span class="strip" style="transform:translateY(${(-offset).toFixed(3)}em)"
            ><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span
            ><span>6</span><span>7</span><span>8</span><span>9</span><span>0</span></span
          ></span
        >
      `);
    }
    return out;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "atc-number": AtcNumber;
  }
}
