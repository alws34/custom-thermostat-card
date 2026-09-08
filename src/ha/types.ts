// Minimal Home Assistant frontend contract used by this card.
// We deliberately depend only on the public card interface, hass state data,
// supported service APIs and theme CSS variables.

export interface HassEntityAttributes {
  friendly_name?: string;
  [key: string]: unknown;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: HassEntityAttributes;
  last_changed: string;
  last_updated: string;
  context: { id: string; parent_id?: string | null; user_id?: string | null };
}

export interface HassServiceTarget {
  entity_id?: string | string[];
}

export interface HassEntityRegistryDisplayEntry {
  entity_id: string;
  display_precision?: number;
  [key: string]: unknown;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities?: Record<string, HassEntityRegistryDisplayEntry>;
  themes: {
    darkMode: boolean;
    [key: string]: unknown;
  };
  language: string;
  locale?: { language: string; number_format?: string; [key: string]: unknown };
  config: { unit_system: { temperature: string; [key: string]: unknown }; [key: string]: unknown };
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: HassServiceTarget,
  ): Promise<unknown>;
  formatEntityState?(entity: HassEntity, state?: string): string;
  formatEntityAttributeValue?(entity: HassEntity, attribute: string, value?: unknown): string;
  localize(key: string, ...args: unknown[]): string;
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  isPanel?: boolean;
  editMode?: boolean;
  setConfig(config: Record<string, unknown>): void;
  getCardSize(): number | Promise<number>;
}

export interface LovelaceCardEditor extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: Record<string, unknown>): void;
}

export interface LovelaceGridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
  max_columns?: number;
  max_rows?: number;
}
