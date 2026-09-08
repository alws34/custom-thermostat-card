import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

/**
 * Animated numeric readout.
 *  - `odometer`: only digits whose value changed roll vertically.
 *  - `reel`: the whole localized value rolls as one unit.
 * Direction follows the value: increasing rolls up, decreasing rolls down.
 * Under `prefers-reduced-motion` the `--atc-roll-duration` token is 0, so
 * values update instantly and meaning never depends on motion.
 */
@customElement("atc-number")
export class AtcNumber extends LitElement {
  @property({ type: Number }) value = 0;
  @property({ type: Number }) precision = 1;
  @property({ type: String }) locale = "en";
  @property({ type: String }) suffix = "°";
  @property({ type: String }) animation: "odometer" | "reel" = "odometer";

  /** value currently rendered at the "settled" position */
  @state() private from = 0;
  /** "start" = tracks pinned to `from`, no transition; "end" = animating to `value` */
  @state() private phase: "start" | "end" = "end";

  static styles = css`
    :host {
      display: inline-flex;
      align-items: baseline;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .row {
      display: inline-flex;
      align-items: baseline;
    }
    .cell {
      position: relative;
      display: inline-block;
      height: 1em;
      overflow: hidden;
    }
    .cell.static {
      overflow: visible;
    }
    .track {
      display: flex;
      flex-direction: column;
      transition: transform var(--atc-roll-duration, 340ms) var(--atc-ease, ease);
      will-change: transform;
    }
    :host([data-phase="start"]) .track {
      transition: none;
    }
    .track > span {
      height: 1em;
      display: flex;
      align-items: center;
      justify-content: center;
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

  willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("value")) {
      const old = changed.get("value");
      if (typeof old === "number" && old !== this.value) {
        this.from = old;
        this.phase = "start";
        this.setAttribute("data-phase", "start");
        requestAnimationFrame(() => {
          this.phase = "end";
          this.setAttribute("data-phase", "end");
        });
      }
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
    const goingUp = this.value >= this.from;
    const target = this.fmt(this.value);
    const cells = this.animation === "reel" ? this.reelCells(goingUp) : this.odometerCells(goingUp);
    return html`
      <span class="row" aria-hidden="true">${cells}</span>
      <span class="suffix" aria-hidden="true">${this.suffix}</span>
      <span class="sr-only">${target}${this.suffix}</span>
    `;
  }

  /** Whole value as one rolling unit. */
  private reelCells(goingUp: boolean) {
    const from = this.fmt(this.from);
    const to = this.fmt(this.value);
    const order = goingUp ? [from, to] : [to, from];
    // at "start" show the `from` slot; at "end" show the `to` slot
    const showFromSlot = this.phase === "start";
    const offset = goingUp
      ? showFromSlot
        ? "0em"
        : "-1em"
      : showFromSlot
        ? "-1em"
        : "0em";
    return html`
      <span class="cell" style="min-width:${Math.max(from.length, to.length)}ch">
        <span class="track" style="transform: translateY(${offset})">
          <span>${order[0]}</span><span>${order[1]}</span>
        </span>
      </span>
    `;
  }

  /** Per-digit odometer: unchanged digits stay put, changed digits roll. */
  private odometerCells(goingUp: boolean) {
    const to = this.fmt(this.value);
    const from = this.fmt(this.from);
    const len = Math.max(to.length, from.length);
    const t = to.padStart(len, " ");
    const f = from.padStart(len, " ");
    const strip = goingUp ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
    const out = [];
    for (let i = 0; i < len; i++) {
      const ch = t[i];
      if (ch < "0" || ch > "9") {
        out.push(html`<span class="cell static">${ch === " " ? "" : ch}</span>`);
        continue;
      }
      const target = Number(ch);
      const start = f[i] >= "0" && f[i] <= "9" ? Number(f[i]) : target;
      const shown = this.phase === "start" ? start : target;
      const idx = strip.indexOf(shown);
      out.push(html`
        <span class="cell">
          <span class="track" style="transform: translateY(${-idx}em)">
            ${strip.map((k) => html`<span>${k}</span>`)}
          </span>
        </span>
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
