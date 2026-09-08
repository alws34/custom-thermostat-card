import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { SecondaryControl } from "../model";

/**
 * Progressive disclosure of capability-supplied secondary controls
 * (preset, fan, swing, horizontal swing, away). Renders nothing when the
 * entity supplies none. Emits `secondary-select` {kind, value}.
 */
@customElement("atc-advanced-controls")
export class AtcAdvancedControls extends LitElement {
  @property({ type: Array }) controls: SecondaryControl[] = [];
  @property({ type: Boolean }) disabled = false;
  @property({ type: String }) moreLabel = "More controls";

  @state() private open = false;

  static styles = css`
    :host {
      display: block;
    }
    .toggle {
      width: 100%;
      font: inherit;
      color: var(--atc-text-secondary);
      background: var(--atc-track);
      border: none;
      border-radius: 12px;
      padding: 8px 12px;
      min-height: 36px;
      cursor: pointer;
    }
    .toggle:focus-visible {
      outline: 2px solid var(--atc-focus);
      outline-offset: 2px;
    }
    .sheet {
      margin-top: 8px;
      border-radius: 12px;
      background: var(--atc-track);
      padding: 4px 12px;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 0;
      border-top: 1px solid var(--atc-divider);
      font-size: 0.85rem;
    }
    .row:first-child {
      border-top: none;
    }
    label {
      color: var(--atc-text);
    }
    select {
      font: inherit;
      color: var(--atc-text);
      background: var(--atc-surface);
      border: 1px solid var(--atc-divider);
      border-radius: 8px;
      padding: 6px 8px;
      max-width: 55%;
    }
    select:focus-visible {
      outline: 2px solid var(--atc-focus);
    }
  `;

  render() {
    if (this.controls.length === 0) return nothing;
    return html`
      <button
        class="toggle"
        part="advanced-toggle"
        aria-expanded=${this.open}
        @click=${() => (this.open = !this.open)}
      >
        ${this.moreLabel} <span aria-hidden="true">${this.open ? "⌃" : "⌄"}</span>
      </button>
      ${this.open
        ? html`
            <div class="sheet" part="advanced-sheet">
              ${this.controls.map((c) => this.renderRow(c))}
            </div>
          `
        : nothing}
    `;
  }

  private renderRow(c: SecondaryControl) {
    const id = `atc-sec-${c.kind}`;
    return html`
      <div class="row" part="advanced-row">
        <label for=${id}>${c.label}</label>
        <select
          id=${id}
          ?disabled=${this.disabled}
          @change=${(e: Event) =>
            this.dispatchEvent(
              new CustomEvent("secondary-select", {
                detail: { kind: c.kind, value: (e.target as HTMLSelectElement).value },
              }),
            )}
        >
          ${c.options.map(
            (o) => html`<option value=${o.value} ?selected=${o.value === c.value}>${o.label}</option>`,
          )}
        </select>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "atc-advanced-controls": AtcAdvancedControls;
  }
}
