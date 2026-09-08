import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { NormalizedThermostat } from "../model";
import type { ThermostatCardConfig } from "../config";
import type { TemperatureController } from "../controllers/temperature-controller";
import { activityColor } from "../styles/tokens";
import "./animated-temperature";
import "./mode-menu";

/**
 * Adaptive compact tile. Square/portrait at narrow container widths,
 * horizontal at wider widths. Never renders a miniature horseshoe.
 * Persistent ▲ / ▼ steppers. Tapping the body opens the full control.
 */
@customElement("atc-compact")
export class AtcCompact extends LitElement {
  @property({ attribute: false }) model!: NormalizedThermostat;
  @property({ attribute: false }) config!: ThermostatCardConfig;
  @property({ attribute: false }) controller!: TemperatureController;
  @property({ type: String }) locale = "en";

  static styles = css`
    :host {
      display: block;
      container-type: inline-size;
      color: var(--atc-text);
    }
    .tile {
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-areas:
        "id      steppers"
        "readout steppers";
      gap: 10px 12px;
      align-items: start;
      min-height: 96px;
      cursor: pointer;
    }
    .id {
      grid-area: id;
      min-width: 0;
    }
    .name {
      font-weight: 600;
      font-size: 0.95rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .status {
      font-size: 0.75rem;
      color: var(--atc-text-secondary);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--activity, var(--atc-idle));
      flex: none;
    }
    .mode {
      margin-top: 6px;
    }
    .readout {
      grid-area: readout;
      align-self: end;
      display: flex;
      flex-direction: column;
    }
    .readout .big {
      font-size: 2rem;
      font-weight: 550;
      letter-spacing: -0.03em;
    }
    .readout .cap {
      font-size: 0.7rem;
      color: var(--atc-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .range {
      display: flex;
      gap: 8px;
    }
    .range button {
      border: 1px solid transparent;
      background: transparent;
      color: var(--atc-text-secondary);
      border-radius: 10px;
      padding: 4px 8px;
      cursor: pointer;
      font: inherit;
    }
    .range button.sel {
      color: var(--atc-text);
      border-color: var(--activity, var(--atc-idle));
      background: var(--atc-track);
    }
    .range button small {
      display: block;
      font-size: 0.6rem;
      text-transform: uppercase;
    }
    .range button .v {
      font-size: 1.2rem;
      font-weight: 550;
    }
    .steppers {
      grid-area: steppers;
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-self: center;
    }
    .step {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      border: none;
      background: var(--atc-track);
      color: var(--atc-text);
      font-size: 1rem;
      cursor: pointer;
      display: grid;
      place-items: center;
    }
    .step:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .step:focus-visible {
      outline: 2px solid var(--atc-focus);
      outline-offset: 2px;
    }
    .step.up {
      color: var(--activity, var(--atc-text));
    }

    @container (min-width: 250px) {
      .tile {
        grid-template-columns: 1fr auto auto;
        grid-template-areas: "id readout steppers";
        align-items: center;
        min-height: 0;
      }
      .readout {
        align-self: center;
        text-align: right;
      }
      .steppers {
        flex-direction: row;
      }
    }
  `;

  private open() {
    this.dispatchEvent(new CustomEvent("open-control", { bubbles: true, composed: true }));
  }
  private stop(e: Event) {
    e.stopPropagation();
  }

  render() {
    const m = this.model;
    const c = this.controller;
    const color = activityColor(m.activity);
    return html`
      <div
        class="tile"
        part="compact"
        style=${`--activity:${color}`}
        role="button"
        tabindex="0"
        aria-label=${`Open ${m.name} thermostat`}
        @click=${() => this.open()}
        @keydown=${(e: KeyboardEvent) =>
          (e.key === "Enter" || e.key === " ") && (e.preventDefault(), this.open())}
      >
        <div class="id">
          <div class="name">${m.name}</div>
          <div class="status" part="status">
            <span class="dot"></span>${m.activityLabel}${m.current != null
              ? html` · ${this.fmt(m.current)}°`
              : nothing}
          </div>
          ${m.modes.length
            ? html`<div class="mode" @click=${this.stop} @keydown=${this.stop}>
                <atc-mode-select
                  variant="button"
                  .modes=${m.modes}
                  .current=${m.currentMode}
                  .disabled=${!m.available}
                  @mode-select=${(e: CustomEvent<{ value: string }>) =>
                    void c.setMode(e.detail.value)}
                ></atc-mode-select>
              </div>`
            : nothing}
        </div>

        ${m.isRange ? this.renderRange() : this.renderSingle()}

        <div class="steppers" @click=${this.stop} part="steppers">
          <button
            class="step up"
            aria-label="Increase temperature"
            ?disabled=${!m.available}
            @click=${() => c.nudge(1)}
          >
            ▲
          </button>
          <button
            class="step"
            aria-label="Decrease temperature"
            ?disabled=${!m.available}
            @click=${() => c.nudge(-1)}
          >
            ▼
          </button>
        </div>
      </div>
    `;
  }

  private renderSingle() {
    const c = this.controller;
    return html`
      <div class="readout" part="readout">
        <span class="big"
          ><atc-number
            .value=${c.displaySingle ?? 0}
            .precision=${this.model.precision}
            .locale=${this.locale}
            .animation=${this.config.number_animation}
          ></atc-number
        ></span>
        <span class="cap">${this.model.targetLabel}</span>
      </div>
    `;
  }

  private renderRange() {
    const c = this.controller;
    return html`
      <div class="readout range" part="readout" @click=${this.stop}>
        <button
          class=${c.selectedSlot === "low" ? "sel" : ""}
          style="--activity:var(--atc-heat)"
          @click=${() => c.select("low")}
        >
          <small style="color:var(--atc-heat)">Heat</small>
          <span class="v"
            ><atc-number
              .value=${c.displayLow ?? 0}
              .precision=${this.model.precision}
              .locale=${this.locale}
              .animation=${this.config.number_animation}
            ></atc-number
          ></span>
        </button>
        <button
          class=${c.selectedSlot === "high" ? "sel" : ""}
          style="--activity:var(--atc-cool)"
          @click=${() => c.select("high")}
        >
          <small style="color:var(--atc-cool)">Cool</small>
          <span class="v"
            ><atc-number
              .value=${c.displayHigh ?? 0}
              .precision=${this.model.precision}
              .locale=${this.locale}
              .animation=${this.config.number_animation}
            ></atc-number
          ></span>
        </button>
      </div>
    `;
  }

  private fmt(n: number) {
    return n.toLocaleString(this.locale, {
      minimumFractionDigits: this.model.precision,
      maximumFractionDigits: this.model.precision,
      useGrouping: false,
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "atc-compact": AtcCompact;
  }
}
