import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ModeOption } from "../model";
import { activityColor } from "../styles/tokens";

/**
 * Capability-driven HVAC / operation mode selector.
 *  - `variant="row"`   : a segmented row (used in the full card)
 *  - `variant="button"`: a compact "Heat ⌄" button opening an anchored menu
 * Emits `mode-select` {value}.
 */
@customElement("atc-mode-select")
export class AtcModeSelect extends LitElement {
  @property({ type: Array }) modes: ModeOption[] = [];
  @property({ type: String }) current = "";
  @property({ type: String }) variant: "row" | "button" = "row";
  @property({ type: Boolean }) disabled = false;

  @state() private open = false;

  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      gap: 6px;
      justify-content: center;
      flex-wrap: wrap;
    }
    button {
      font: inherit;
      color: var(--atc-text-secondary);
      background: var(--atc-track);
      border: none;
      border-radius: 12px;
      padding: 8px 12px;
      min-height: 36px;
      cursor: pointer;
    }
    button:hover {
      color: var(--atc-text);
    }
    button.active {
      color: var(--atc-surface);
      background: var(--mode-color, var(--atc-idle));
    }
    button:focus-visible {
      outline: 2px solid var(--atc-focus);
      outline-offset: 2px;
    }
    .anchor {
      position: relative;
      display: inline-block;
    }
    .trigger {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .menu {
      position: absolute;
      z-index: 10;
      top: calc(100% + 4px);
      left: 0;
      min-width: 160px;
      background: var(--atc-surface);
      border: 1px solid var(--atc-divider);
      border-radius: 12px;
      box-shadow: var(--ha-card-box-shadow, 0 8px 24px rgba(0, 0, 0, 0.2));
      padding: 4px;
      display: flex;
      flex-direction: column;
    }
    .menu button {
      background: transparent;
      text-align: left;
      border-radius: 8px;
      color: var(--atc-text);
    }
    .menu button.active {
      color: var(--mode-color, var(--atc-primary));
      background: var(--atc-track);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 8px;
      background: var(--mode-color, var(--atc-idle));
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("pointerdown", this.onDocPointer, true);
    document.addEventListener("keydown", this.onDocKey, true);
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("pointerdown", this.onDocPointer, true);
    document.removeEventListener("keydown", this.onDocKey, true);
  }

  private onDocPointer = (ev: Event) => {
    if (this.open && !ev.composedPath().includes(this)) this.open = false;
  };
  private onDocKey = (ev: KeyboardEvent) => {
    if (this.open && ev.key === "Escape") {
      this.open = false;
      (this.renderRoot.querySelector(".trigger") as HTMLElement)?.focus();
    }
  };

  private select(value: string) {
    this.open = false;
    if (value !== this.current) {
      this.dispatchEvent(new CustomEvent("mode-select", { detail: { value } }));
    }
  }

  render() {
    if (this.modes.length === 0) return nothing;
    return this.variant === "button" ? this.renderButton() : this.renderRow();
  }

  private renderRow() {
    return html`
      <div class="row" part="mode-row" role="group">
        ${this.modes.map(
          (m) => html`
            <button
              part="mode-option"
              class=${m.value === this.current ? "active" : ""}
              style=${`--mode-color:${activityColor(m.activity)}`}
              aria-pressed=${m.value === this.current}
              ?disabled=${this.disabled}
              @click=${() => this.select(m.value)}
            >
              ${m.label}
            </button>
          `,
        )}
      </div>
    `;
  }

  private renderButton() {
    const active = this.modes.find((m) => m.value === this.current);
    return html`
      <span class="anchor" part="mode-menu">
        <button
          class="trigger"
          aria-haspopup="menu"
          aria-expanded=${this.open}
          ?disabled=${this.disabled}
          @click=${() => (this.open = !this.open)}
        >
          <span class="dot" style=${`--mode-color:${activityColor(active?.activity ?? "idle")}`}></span>
          ${active?.label ?? this.current}
          <span aria-hidden="true">⌄</span>
        </button>
        ${this.open
          ? html`
              <div class="menu" role="menu">
                ${this.modes.map(
                  (m) => html`
                    <button
                      role="menuitemradio"
                      aria-checked=${m.value === this.current}
                      class=${m.value === this.current ? "active" : ""}
                      style=${`--mode-color:${activityColor(m.activity)}`}
                      @click=${() => this.select(m.value)}
                    >
                      <span class="dot" style=${`--mode-color:${activityColor(m.activity)}`}></span>
                      ${m.label}
                    </button>
                  `,
                )}
              </div>
            `
          : nothing}
      </span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "atc-mode-select": AtcModeSelect;
  }
}
