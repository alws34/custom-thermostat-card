import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Animated numeric readout.
 *
 * Motion is **linear and continuous**. The value is tracked in "display
 * units" — `value` rounded to `precision` — and a single interpolant
 * (`shownScaled`) moves toward that target at a constant rate (segment
 * clamped to 90–500 ms). Every animation frame repositions the digit wheels
 * from the interpolant; there is no CSS transition and nothing snaps. If the
 * target moves again mid-flight (dragging the dial) the readout keeps
 * tracking it, so the digits trail the finger.
 *
 *  - `odometer`: per-digit wheels; the last wheel rolls continuously, higher
 *    wheels only in the final unit before they carry (mechanical look).
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

  /** interpolant, in display units × 10^precision (integer at rest) */
  private shownScaled = 0;
  private started = false;
  private raf = 0;
  private prevTs = 0;
  /** scaled units per ms — constant within a segment, so motion is linear */
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
    /* CSS odometer wheel. A hidden in-flow glyph gives the box a real text
       baseline and its width; the digit strip is absolutely positioned over
       it. clip-path (not overflow) hides the off-wheel digits — overflow
       would move the inline-block baseline to its bottom edge. */
    .wheel {
      position: relative;
      display: inline-block;
      height: 1em;
      clip-path: inset(0);
    }
    .wheel::after {
      content: "0";
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

  private get pow(): number {
    return Math.pow(10, this.precision);
  }

  /** target in scaled integer units */
  private targetScaled(): number {
    return Math.round((Number.isFinite(this.value) ? this.value : 0) * this.pow);
  }

  firstUpdated(): void {
    this.shownScaled = this.targetScaled();
    this.started = true;
  }

  willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("value") && this.started && this.shownScaled !== this.targetScaled()) {
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
      this.shownScaled = this.targetScaled();
      this.requestUpdate();
      return;
    }
    this.setSegment();
    if (!this.raf) {
      this.prevTs = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  /** Pick a constant speed for the current shownScaled → target segment. */
  private setSegment(): void {
    const target = this.targetScaled();
    const distDisplay = Math.abs(target - this.shownScaled) / this.pow;
    const dur = Math.min(500, Math.max(90, distDisplay * 130));
    this.speed = dur > 0 ? Math.abs(target - this.shownScaled) / dur : this.pow;
    this.segTarget = target;
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

    const target = this.targetScaled();
    if (target !== this.segTarget) this.setSegment(); // target moved (drag)

    const diff = target - this.shownScaled;
    const move = this.speed * dt;
    if (move === 0 || Math.abs(diff) <= move) {
      this.shownScaled = target;
      this.raf = 0;
      this.requestUpdate();
      return;
    }
    this.shownScaled += Math.sign(diff) * move;
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
    const scaled = this.raf ? this.shownScaled : this.targetScaled();
    const targetStr = this.fmt(this.value);
    const body =
      this.animation === "reel"
        ? html`<span class="reel">${this.raf ? this.fmt(scaled / this.pow) : targetStr}</span>`
        : this.wheels(scaled, targetStr);
    return html`
      <span class="glyphs" aria-hidden="true">${body}</span>
      <span class="suffix" aria-hidden="true">${this.suffix}</span>
      <span class="sr-only">${targetStr}${this.suffix}</span>
    `;
  }

  /**
   * Per-digit wheels positioned from the scaled interpolant. Wheel `k`
   * (k = 0 is the least significant printed digit) sits at `digit_k + carry`,
   * where `carry` is only non-zero in the final unit before every lower
   * wheel simultaneously rolls over — so a settled `19.5` shows a solid `1`.
   */
  private wheels(scaled: number, layout: string) {
    const negative = scaled < 0 || layout.startsWith("-");
    const abs = Math.abs(scaled);
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
      const digit = Math.floor(abs / pow) % 10;
      const below = abs % pow; // combined value of every lower wheel
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
