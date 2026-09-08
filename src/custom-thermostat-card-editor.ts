import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor } from "./ha/types";
import { DEFAULTS, normalizeConfig, type ThermostatCardConfig } from "./config";
import { makeAdapter } from "./model";

/**
 * Visual editor. Uses HA's own `ha-form`. Capability-aware once an entity is
 * chosen: irrelevant options are hidden with a short explanation, and unknown
 * config keys are preserved across round-trips.
 */
@customElement("custom-thermostat-card-editor")
export class CustomThermostatCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: ThermostatCardConfig;

  setConfig(raw: Record<string, unknown>): void {
    // keep unknown keys; only fill defaults
    this.config = normalizeConfig(raw);
  }

  static styles = css`
    .note {
      margin: 8px 4px 0;
      color: var(--secondary-text-color);
      font-size: 0.8rem;
    }
  `;

  private schema() {
    const isCompact = (this.config?.display ?? DEFAULTS.display) === "compact";
    const adapter =
      this.hass && this.config ? makeAdapter(this.hass, this.config.entity) : null;
    const model = adapter?.normalize() ?? null;
    const hasSecondary = !model || model.secondary.length > 0;

    return [
      { name: "entity", required: true, selector: { entity: { domain: ["climate", "water_heater"] } } },
      { name: "name", selector: { text: {} } },
      {
        name: "display",
        selector: { select: { mode: "box", options: opts(["compact", "full"]) } },
      },
      ...(isCompact
        ? [
            {
              name: "open_behavior",
              selector: { select: { mode: "box", options: opts(["overlay", "inline"]) } },
            },
          ]
        : [
            {
              name: "dial_style",
              selector: {
                select: {
                  mode: "dropdown",
                  options: opts(["arc", "ticks", "gradient", "thermometer", "minimal"]),
                },
              },
            },
          ]),
      {
        type: "grid",
        name: "",
        schema: [
          {
            name: "thumb",
            selector: { select: { options: opts(["interaction", "always", "never"]) } },
          },
          {
            name: "number_animation",
            selector: { select: { options: opts(["odometer", "reel"]) } },
          },
          { name: "appearance", selector: { select: { options: opts(["auto", "light", "dark"]) } } },
          { name: "theme", selector: { theme: {} } },
        ],
      },
      { name: "show_current_as_primary", selector: { boolean: {} } },
      ...(hasSecondary ? [{ name: "secondary_controls", selector: { boolean: {} } }] : []),
    ];
  }

  private computeLabel = (s: { name: string }): string => {
    const map: Record<string, string> = {
      entity: "Entity",
      name: "Name (optional)",
      display: "Display",
      open_behavior: "Compact open behavior",
      dial_style: "Dial style",
      thumb: "Dial thumb",
      number_animation: "Number animation",
      appearance: "Appearance",
      theme: "Theme (optional)",
      show_current_as_primary: "Show current temperature as the primary value",
      secondary_controls: 'Show "More controls" section',
    };
    return map[s.name] ?? s.name;
  };

  private onChange(ev: CustomEvent): void {
    ev.stopPropagation();
    const next = { ...this.config, ...ev.detail.value } as Record<string, unknown>;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: next } }));
  }

  render() {
    if (!this.hass || !this.config) return nothing;
    const model =
      makeAdapter(this.hass, this.config.entity)?.normalize() ?? null;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${this.schema()}
        .computeLabel=${this.computeLabel}
        @value-changed=${this.onChange}
      ></ha-form>
      ${model && model.secondary.length === 0
        ? html`<div class="note">
            This entity advertises no preset / fan / swing controls, so the “More controls” section is hidden.
          </div>`
        : nothing}
      ${(this.config.display ?? "compact") === "full"
        ? html`<div class="note">
            The dial style applies to the full display. The compact tile never draws a dial, so
            it and the open behavior only apply to the compact display.
          </div>`
        : nothing}
    `;
  }
}

function opts(values: string[]) {
  return values.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " "),
  }));
}

declare global {
  interface HTMLElementTagNameMap {
    "custom-thermostat-card-editor": CustomThermostatCardEditor;
  }
}
