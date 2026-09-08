import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Self-contained accessible modal layer. No browser_mod, no HA private
 * dialogs. Portals itself to <body> so it escapes card overflow clipping.
 * Traps focus, closes on Escape / backdrop, restores focus to the opener,
 * locks only body scroll, cleans up on disconnect.
 */
@customElement("atc-overlay")
export class AtcOverlay extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: String }) label = "Thermostat";

  private opener: HTMLElement | null = null;
  private homeParent: Node | null = null;
  private homeNext: Node | null = null;
  private scrollLocked = false;

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: none;
    }
    :host([open]) {
      display: block;
    }
    .backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(2px);
      animation: fade 160ms ease;
    }
    .panel {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(420px, calc(100vw - 32px));
      max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px);
      overflow: auto;
      box-sizing: border-box;
      background: var(--atc-surface, var(--card-background-color, #fff));
      color: var(--atc-text, var(--primary-text-color, #000));
      border-radius: var(--ha-card-border-radius, 16px);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
      padding: 16px;
      padding-bottom: max(16px, env(safe-area-inset-bottom));
      animation: pop 180ms ease;
    }
    .close {
      position: absolute;
      top: 8px;
      right: 8px;
      border: none;
      background: transparent;
      color: var(--atc-text-secondary, #888);
      font-size: 1.2rem;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      cursor: pointer;
    }
    .close:hover {
      background: var(--atc-track, rgba(127, 127, 127, 0.2));
    }
    .close:focus-visible {
      outline: 2px solid var(--atc-focus, #03a9f4);
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    @keyframes pop {
      from {
        opacity: 0;
        transform: translate(-50%, -46%) scale(0.97);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .backdrop,
      .panel {
        animation: none;
      }
    }
  `;

  updated(changed: Map<string, unknown>): void {
    if (!changed.has("open")) return;
    if (this.open) this.onOpen();
    else this.onClose();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.releaseScroll();
    document.removeEventListener("keydown", this.onKeydown, true);
  }

  private onOpen() {
    this.opener = (this.getRootNode() as ShadowRoot)?.host as HTMLElement | null;
    this.opener = (document.activeElement as HTMLElement) ?? this.opener;
    // portal to body
    if (this.parentNode !== document.body) {
      this.homeParent = this.parentNode;
      this.homeNext = this.nextSibling;
      document.body.appendChild(this);
    }
    document.addEventListener("keydown", this.onKeydown, true);
    this.lockScroll();
    requestAnimationFrame(() => this.focusFirst());
  }

  private onClose() {
    this.releaseScroll();
    document.removeEventListener("keydown", this.onKeydown, true);
    // return home so the owning card can dispose it
    if (this.homeParent) {
      this.homeParent.insertBefore(this, this.homeNext);
      this.homeParent = this.homeNext = null;
    }
    this.opener?.focus?.();
    this.opener = null;
  }

  private lockScroll() {
    if (this.scrollLocked) return;
    document.body.style.overflow = "hidden";
    this.scrollLocked = true;
  }
  private releaseScroll() {
    if (!this.scrollLocked) return;
    document.body.style.overflow = "";
    this.scrollLocked = false;
  }

  private close() {
    this.open = false;
    this.dispatchEvent(new CustomEvent("overlay-close", { bubbles: true, composed: true }));
  }

  private onKeydown = (ev: KeyboardEvent) => {
    if (!this.open) return;
    if (ev.key === "Escape") {
      ev.stopPropagation();
      this.close();
      return;
    }
    if (ev.key === "Tab") this.trap(ev);
  };

  private focusables(): HTMLElement[] {
    const panel = this.renderRoot.querySelector(".panel");
    if (!panel) return [];
    const sel =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const deep: HTMLElement[] = [];
    const walk = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        if (el.offsetParent !== null || el === document.activeElement) deep.push(el);
      });
      root.querySelectorAll("*").forEach((el) => {
        if ((el as HTMLElement).shadowRoot) walk((el as HTMLElement).shadowRoot!);
      });
    };
    walk(panel);
    return deep;
  }

  private focusFirst() {
    const f = this.focusables();
    (f[0] ?? (this.renderRoot.querySelector(".close") as HTMLElement))?.focus();
  }

  private trap(ev: KeyboardEvent) {
    const f = this.focusables();
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    const active = this.deepActive();
    if (ev.shiftKey && active === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  private deepActive(): Element | null {
    let a: Element | null = document.activeElement;
    while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <div class="backdrop" part="backdrop" @click=${() => this.close()}></div>
      <div class="panel" part="panel" role="dialog" aria-modal="true" aria-label=${this.label}>
        <button class="close" aria-label="Close" @click=${() => this.close()}>✕</button>
        <slot></slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "atc-overlay": AtcOverlay;
  }
}
