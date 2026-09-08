// Headless smoke test: does the real bundle define + render without throwing?
// jsdom lacks Constructable StyleSheets, so we shim just enough for Lit.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const w = dom.window;

class FakeSheet {
  replaceSync() {}
  replace() {
    return Promise.resolve();
  }
}
w.CSSStyleSheet = FakeSheet;
for (const proto of [w.Document.prototype, w.ShadowRoot.prototype]) {
  Object.defineProperty(proto, "adoptedStyleSheets", {
    configurable: true,
    get() {
      return this.__sheets || (this.__sheets = []);
    },
    set(v) {
      this.__sheets = v;
    },
  });
}

for (const [k, v] of Object.entries({
  window: w,
  document: w.document,
  HTMLElement: w.HTMLElement,
  customElements: w.customElements,
  CSSStyleSheet: FakeSheet,
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
})) {
  try {
    globalThis[k] = v;
  } catch {
    /* read-only global (navigator); jsdom's is fine */
  }
}
w.requestAnimationFrame = globalThis.requestAnimationFrame;

const mkEntity = (over = {}) => ({
  entity_id: "climate.lr",
  state: "heat",
  last_changed: "",
  last_updated: "",
  context: { id: "1" },
  attributes: {
    friendly_name: "LR",
    current_temperature: 21.3,
    temperature: 22,
    min_temp: 7,
    max_temp: 35,
    target_temp_step: 0.5,
    hvac_modes: ["off", "heat", "cool", "heat_cool"],
    hvac_action: "heating",
    supported_features: 1 | 2 | 8 | 16,
    fan_modes: ["auto", "low"],
    fan_mode: "auto",
    preset_modes: ["eco"],
    preset_mode: "eco",
    ...over.attributes,
  },
  ...over,
});

const hass = (states) => ({
  states,
  entities: {},
  themes: { darkMode: false },
  language: "en",
  locale: { language: "en" },
  config: { unit_system: { temperature: "°C" } },
  localize: () => "",
  callService: async (d, s, data) => console.log("  service:", d, s, JSON.stringify(data)),
});

await import("../dist/custom-thermostat-card.js");
let failed = false;
const assert = (cond, msg) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`);
  if (!cond) failed = true;
};

assert(!!customElements.get("custom-thermostat-card"), "card element registered");
assert(!!customElements.get("custom-thermostat-card-editor"), "editor element registered");
assert(!!customElements.get("atc-dial"), "atc-dial registered");
assert(Array.isArray(w.customCards) && w.customCards.length === 1, "card-picker entry pushed");

for (const [name, cfg, states] of [
  ["full/heat", { display: "full" }, { "climate.lr": mkEntity() }],
  ["compact", { display: "compact" }, { "climate.lr": mkEntity() }],
  [
    "full/range",
    { display: "full" },
    {
      "climate.lr": mkEntity({
        state: "heat_cool",
        attributes: { temperature: null, target_temp_low: 19.5, target_temp_high: 23 },
      }),
    },
  ],
  ["unavailable", { display: "full" }, { "climate.lr": mkEntity({ state: "unavailable" }) }],
]) {
  const el = document.createElement("custom-thermostat-card");
  el.setConfig({ type: "custom:custom-thermostat-card", entity: "climate.lr", ...cfg });
  el.hass = hass(states);
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 60));
  const text = el.shadowRoot.textContent.replace(/\s+/g, " ").trim();
  assert(text.length > 0, `${name} renders ("${text.slice(0, 70)}")`);
}

// setConfig error path
try {
  document.createElement("custom-thermostat-card").setConfig({ entity: "light.x" });
  assert(false, "rejects unsupported domain");
} catch {
  assert(true, "rejects unsupported domain");
}

console.log(failed ? "\nSMOKE FAILED" : "\nsmoke ok");
process.exit(failed ? 1 : 0);
