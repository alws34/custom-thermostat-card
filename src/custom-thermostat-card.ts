import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceGridOptions,
} from "./ha/types";
import { normalizeConfig, stubConfig, type ThermostatCardConfig } from "./config";
import { makeAdapter, type NormalizedThermostat, type ThermostatAdapter } from "./model";
import { TemperatureController } from "./controllers/temperature-controller";
import { tokens } from "./styles/tokens";
import "./components/compact-thermostat";
import "./components/full-thermostat";
import "./components/thermostat-overlay";

declare const __CARD_VERSION__: string;
const VERSION = typeof __CARD_VERSION__ === "string" ? __CARD_VERSION__ : "dev";

/* eslint-disable no-console */
console.info(
  `%c custom-thermostat-card %c v${VERSION} `,
  "background:#ff8c42;color:#fff;border-radius:3px 0 0 3px;padding:2px 4px",
  "background:#2b9af9;color:#fff;border-radius:0 3px 3px 0;padding:2px 4px",
);

@customElement("custom-thermostat-card")
export class CustomThermostatCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: ThermostatCardConfig;
  @state() private inlineOpen = false;
  @state() private overlayOpen = false;

  private controller = new TemperatureController();
  private adapter: ThermostatAdapter | null = null;
  private model: NormalizedThermostat | null = null;

  static styles = [
    tokens,
    css`
      ha-card {
        padding: 14px 16px 16px;
        overflow: visible;
      }
      .inline {
        margin-top: 12px;
        border-top: 1px solid var(--atc-divider);
        padding-top: 12px;
      }
      .collapse {
        display: block;
        margin: 8px auto 0;
        border: none;
        background: transparent;
        color: var(--atc-text-secondary);
        cursor: pointer;
        font: inherit;
      }
      .collapse:focus-visible {
        outline: 2px solid var(--atc-focus);
      }
      .warn {
        padding: 14px 16px;
        color: var(--primary-text-color);
      }
      .warn code {
        background: var(--atc-track);
        padding: 1px 5px;
        border-radius: 4px;
      }
    `,
  ];

  constructor() {
    super();
    this.controller.attach(() => this.requestUpdate());
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("custom-thermostat-card-editor");
  }

  static getStubConfig(hass: HomeAssistant): Record<string, unknown> {
    const entity =
      Object.keys(hass.states).find((e) => e.startsWith("climate.")) ??
      Object.keys(hass.states).find((e) => e.startsWith("water_heater.")) ??
      "climate.example";
    return stubConfig(entity);
  }

  setConfig(raw: Record<string, unknown>): void {
    this.config = normalizeConfig(raw);
    this.inlineOpen = false;
  }

  willUpdate(): void {
    if (!this.hass || !this.config) return;
    this.adapter = makeAdapter(this.hass, this.config.entity, this.config.name);
    this.model = this.adapter ? this.adapter.normalize() : null;
    if (this.adapter && this.model) this.controller.sync(this.adapter, this.model);
    this.applyAppearance();
  }

  private applyAppearance(): void {
    const mode =
      this.config?.appearance === "auto"
        ? this.hass?.themes?.darkMode
          ? "dark"
          : "light"
        : this.config?.appearance ?? "light";
    this.setAttribute("data-appearance", mode);
  }

  getCardSize(): number {
    if (!this.config) return 3;
    if (this.config.display === "full") return 6;
    return this.inlineOpen ? 6 : 2;
  }

  getGridOptions(): LovelaceGridOptions {
    if (this.config?.display === "full") {
      return { min_columns: 6, min_rows: 5, rows: 6 };
    }
    // adaptive compact: small square possible, grows horizontal
    return { min_columns: 2, min_rows: 2, rows: this.inlineOpen ? 8 : 2 };
  }

  private locale(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  render() {
    if (!this.config) return nothing;
    if (!this.hass) return nothing;

    if (!this.adapter || !this.model) {
      return html`
        <ha-card>
          <div class="warn">
            Entity <code>${this.config.entity}</code> is not available. Use a
            <code>climate</code> or <code>water_heater</code> entity.
          </div>
        </ha-card>
      `;
    }

    const m = this.model;
    const full = html`
      <atc-full
        exportparts="header,status,overflow,dial,modes,dial-track,dial-arc,dial-thumb,dial-readout,mode-row,mode-option,advanced-toggle,advanced-sheet"
        .model=${m}
        .config=${this.config}
        .controller=${this.controller}
        .locale=${this.locale()}
      ></atc-full>
    `;

    if (this.config.display === "full") {
      return html`<ha-card part="card">${full}</ha-card>`;
    }

    // compact
    return html`
      <ha-card part="card">
        <atc-compact
          exportparts="compact,status,readout,steppers,mode-menu"
          .model=${m}
          .config=${this.config}
          .controller=${this.controller}
          .locale=${this.locale()}
          @open-control=${this.openControl}
        ></atc-compact>

        ${this.inlineOpen
          ? html`
              <div class="inline" part="inline">
                ${full}
                <button class="collapse" @click=${() => (this.inlineOpen = false)}>
                  Collapse ⌃
                </button>
              </div>
            `
          : nothing}
      </ha-card>

      <atc-overlay
        .open=${this.overlayOpen}
        .label=${m.name}
        @overlay-close=${() => (this.overlayOpen = false)}
      >
        ${this.overlayOpen ? full : nothing}
      </atc-overlay>
    `;
  }

  private openControl = () => {
    if (!this.model?.available) {
      // still allow native more-info for unavailable entities
      this.dispatchEvent(
        new CustomEvent("hass-more-info", {
          detail: { entityId: this.config!.entity },
          bubbles: true,
          composed: true,
        }),
      );
      return;
    }
    if (this.config!.open_behavior === "inline") this.inlineOpen = true;
    else this.overlayOpen = true;
  };
}

// card-picker registration
(window as unknown as { customCards?: unknown[] }).customCards =
  (window as unknown as { customCards?: unknown[] }).customCards || [];
(window as unknown as { customCards: Record<string, unknown>[] }).customCards.push({
  type: "custom-thermostat-card",
  name: "Custom Thermostat Card",
  description: "Apple-Home-inspired thermostat with a horseshoe dial, compact tiles and an overlay. climate + water_heater.",
  preview: true,
  documentationURL: "https://github.com/alws34/custom-thermostat-card",
});

// editor is loaded lazily but registered here for the bundle
import "./custom-thermostat-card-editor";

declare global {
  interface HTMLElementTagNameMap {
    "custom-thermostat-card": CustomThermostatCard;
  }
}
