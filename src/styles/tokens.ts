import { css } from "lit";

/**
 * Local `--atc-*` design tokens, each resolved from a Home Assistant theme
 * variable with a sensible fallback. Card-mod users can override either the
 * HA variable or the `--atc-*` token directly.
 */
export const tokens = css`
  :host {
    /* surfaces & text */
    --atc-surface: var(--ha-card-background, var(--card-background-color, #fff));
    --atc-surface-raised: var(--ha-card-background, var(--card-background-color, #fff));
    --atc-text: var(--primary-text-color, #212121);
    --atc-text-secondary: var(--secondary-text-color, #727272);
    --atc-divider: var(--divider-color, rgba(127, 127, 127, 0.24));
    --atc-radius: var(--ha-card-border-radius, 12px);
    --atc-radius-inner: calc(var(--atc-radius) - 4px);
    --atc-focus: var(--primary-color, #03a9f4);

    /* semantic HVAC activity colours (theme-aware) */
    --atc-heat: var(--state-climate-heat-color, #ff8c42);
    --atc-cool: var(--state-climate-cool-color, #2b9af9);
    --atc-dry: var(--state-climate-dry-color, #efbd07);
    --atc-fan: var(--state-climate-fan_only-color, #8fd0e6);
    --atc-idle: var(--state-climate-idle-color, var(--secondary-text-color, #8a8a8a));
    --atc-off: var(--state-climate-off-color, var(--disabled-text-color, #9e9e9e));
    --atc-unavailable: var(--disabled-text-color, #bdbdbd);

    /* dial */
    --atc-track: var(--atc-divider);
    --atc-track-width: 14px;
    --atc-dial-size: 220px;

    /* motion */
    --atc-roll-duration: 340ms;
    --atc-ease: cubic-bezier(0.34, 0.9, 0.3, 1);
  }

  :host([data-appearance="dark"]) {
    --atc-track: rgba(255, 255, 255, 0.16);
  }
  :host([data-appearance="light"]) {
    --atc-track: rgba(0, 0, 0, 0.1);
  }

  @media (prefers-reduced-motion: reduce) {
    :host {
      --atc-roll-duration: 0ms;
    }
  }
`;

/** Map a normalized activity to its token colour. */
export function activityColor(activity: string): string {
  switch (activity) {
    case "heating":
      return "var(--atc-heat)";
    case "cooling":
      return "var(--atc-cool)";
    case "drying":
      return "var(--atc-dry)";
    case "fan":
      return "var(--atc-fan)";
    case "off":
      return "var(--atc-off)";
    case "unavailable":
      return "var(--atc-unavailable)";
    default:
      return "var(--atc-idle)";
  }
}
