import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { NormalizedThermostat, SecondaryKind } from "../model";
import type { ThermostatCardConfig } from "../config";
import type { TemperatureController } from "../controllers/temperature-controller";
import { activityColor } from "../styles/tokens";
import type { DialChange } from "./horseshoe-dial";
import "./horseshoe-dial";
import "./mode-menu";
import "./advanced-controls";

/** Full horseshoe presentation. Assembles dial + mode row + advanced controls. */
@customElement("atc-full")
export class AtcFull extends LitElement {
  @property({ attribute: false }) model!: NormalizedThermostat;
  @property({ attribute: false }) config!: ThermostatCardConfig;
  @property({ attribute: false }) controller!: TemperatureController;
  @property({ type: String }) locale = "en";
  @property({ type: Boolean }) showHeader = true;

  static styles = css`
    :host {
      display: block;
      color: var(--atc-text);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 32px;
    }
    .title {
      font-weight: 600;
      font-size: 0.95rem;
    }
    .status {
      font-size: 0.75rem;
      color: var(--atc-text-secondary);
    }
    .overflow {
      border: none;
      background: transparent;
      color: var(--atc-text-secondary);
      font-size: 1.1rem;
      line-height: 1;
      cursor: pointer;
      width: 36px;
      height: 36px;
      border-radius: 50%;
    }
    .overflow:hover {
      background: var(--atc-track);
    }
    .overflow:focus-visible {
      outline: 2px solid var(--atc-focus);
    }
    .dial-wrap {
      display: flex;
      justify-content: center;
      margin: 6px 0 0;
    }
    /* approved: ~7px between the dial's visible lower bound and the mode row */
    .modes {
      margin-top: 7px;
    }
    .advanced {
      margin-top: 12px;
    }
    .error {
      margin-top: 8px;
      font-size: 0.78rem;
      color: var(--error-color, #db4437);
      text-align: center;
    }
  `;

  private onPreview = (e: CustomEvent<DialChange>) => {
    this.controller.preview(e.detail.value, e.detail.slot);
  };
  private onCommit = () => this.controller.commit();
  private onCancel = () => this.controller.cancel();
  private onSlot = (e: CustomEvent<{ slot: "low" | "high" }>) => this.controller.select(e.detail.slot);
  private onMode = (e: CustomEvent<{ value: string }>) => void this.controller.setMode(e.detail.value);
  private onSecondary = (e: CustomEvent<{ kind: SecondaryKind; value: string }>) =>
    void this.controller.setSecondary(e.detail.kind, e.detail.value);

  private moreInfo() {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        detail: { entityId: this.model.entityId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    const m = this.model;
    const c = this.controller;
    const color = activityColor(m.activity);
    return html`
      ${this.showHeader
        ? html`
            <div class="head" part="header">
              <div>
                <div class="title">${m.name}</div>
                <div class="status" part="status">
                  ${m.activityLabel}${m.current != null
                    ? html` · ${this.fmt(m.current)}°${m.unit.replace("°", "").trim()} ${this.nowWord()}`
                    : nothing}
                </div>
              </div>
              <button class="overflow" part="overflow" aria-label="More information" @click=${() => this.moreInfo()}>
                •••
              </button>
            </div>
          `
        : nothing}

      <div class="dial-wrap">
        <atc-dial
          part="dial"
          .min=${m.min}
          .max=${m.max}
          .step=${m.step}
          .precision=${m.precision}
          .unit=${m.unit}
          .locale=${this.locale}
          .animation=${this.config.number_animation}
          .thumb=${this.config.thumb}
          .dialStyle=${this.config.dial_style}
          .activityColor=${color}
          .targetLabel=${m.targetLabel}
          .activityLabel=${m.activityLabel}
          .current=${m.current}
          .showCurrentAsPrimary=${this.config.show_current_as_primary}
          .currentLabel=${m.currentLabel}
          .range=${m.isRange}
          .value=${c.displaySingle ?? m.min}
          .low=${c.displayLow}
          .high=${c.displayHigh}
          .selectedSlot=${c.selectedSlot}
          .disabled=${!m.available}
          @dial-preview=${this.onPreview}
          @dial-commit=${this.onCommit}
          @dial-cancel=${this.onCancel}
          @slot-select=${this.onSlot}
        ></atc-dial>
      </div>

      ${m.modes.length
        ? html`
            <div class="modes" part="modes">
              <atc-mode-select
                variant="row"
                .modes=${m.modes}
                .current=${m.currentMode}
                .disabled=${!m.available}
                @mode-select=${this.onMode}
              ></atc-mode-select>
            </div>
          `
        : nothing}

      ${this.config.secondary_controls && m.secondary.length
        ? html`
            <div class="advanced">
              <atc-advanced-controls
                .controls=${m.secondary}
                .disabled=${!m.available}
                @secondary-select=${this.onSecondary}
              ></atc-advanced-controls>
            </div>
          `
        : nothing}
      ${c.error ? html`<div class="error" role="alert">${this.shortError(c.error)}</div>` : nothing}
    `;
  }

  private fmt(n: number) {
    return n.toLocaleString(this.locale, {
      minimumFractionDigits: this.model.precision,
      maximumFractionDigits: this.model.precision,
      useGrouping: false,
    });
  }
  private nowWord() {
    return "now";
  }
  private shortError(e: string) {
    return e.replace(/^Error:\s*/, "").slice(0, 140);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "atc-full": AtcFull;
  }
}
