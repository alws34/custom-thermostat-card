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
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
})) {
  try {
    globalThis[k] = v;
  } catch {
    /* read-only global (navigator); jsdom's is fine */
  }
}
w.requestAnimationFrame = globalThis.requestAnimationFrame;
w.cancelAnimationFrame = globalThis.cancelAnimationFrame;

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

// NOTE: mkEntity({attributes}) replaces the whole attributes object, so build
// range / water variants by merging onto a base entity instead.
const rangeEntity = () => {
  const e = mkEntity();
  e.state = "heat_cool";
  e.attributes = {
    ...e.attributes,
    temperature: null,
    target_temp_low: 19.5,
    target_temp_high: 23,
  };
  return e;
};
const waterEntity = () => {
  const e = mkEntity();
  e.entity_id = "water_heater.tank";
  e.state = "eco";
  e.attributes = {
    ...e.attributes,
    friendly_name: "Tank",
    current_temperature: 48,
    temperature: 51,
    min_temp: 43,
    max_temp: 62,
    operation_list: ["off", "eco", "electric"],
    operation_mode: "eco",
    supported_features: 1 | 2,
  };
  return e;
};

// reach into the rendered dial (full display only)
const dialRoot = (card) =>
  card.shadowRoot
    ?.querySelector("atc-full")
    ?.shadowRoot?.querySelector("atc-dial")?.shadowRoot ?? null;

async function mount(cfg, states, entityId = "climate.lr") {
  const el = document.createElement("custom-thermostat-card");
  el.setConfig({ type: "custom:custom-thermostat-card", entity: entityId, ...cfg });
  el.hass = hass(states);
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 60));
  return el;
}

for (const [name, cfg, states] of [
  ["compact", { display: "compact" }, { "climate.lr": mkEntity() }],
  ["compact/range", { display: "compact" }, { "climate.lr": rangeEntity() }],
  ["full/unavailable", { display: "full" }, { "climate.lr": mkEntity({ state: "unavailable" }) }],
]) {
  const el = await mount(cfg, states);
  const text = el.shadowRoot.textContent.replace(/\s+/g, " ").trim();
  assert(text.length > 0, `${name} renders ("${text.slice(0, 60)}")`);
}

// every dial style, against every card variation, must render
const STYLES = ["arc", "ticks", "gradient", "thermometer", "minimal"];
const VARIATIONS = [
  ["single", () => ({ "climate.lr": mkEntity() }), "climate.lr", {}],
  ["range", () => ({ "climate.lr": rangeEntity() }), "climate.lr", {}],
  ["water_heater", () => ({ "water_heater.tank": waterEntity() }), "water_heater.tank", {}],
  ["unavailable", () => ({ "climate.lr": mkEntity({ state: "unavailable" }) }), "climate.lr", {}],
  ["current-primary", () => ({ "climate.lr": mkEntity() }), "climate.lr", { show_current_as_primary: true }],
  ["thumb-never", () => ({ "climate.lr": mkEntity() }), "climate.lr", { thumb: "never" }],
  ["reel", () => ({ "climate.lr": mkEntity() }), "climate.lr", { number_animation: "reel" }],
];

const featureCheck = {
  arc: (r) => r.querySelector(".arc"),
  ticks: (r) => r.querySelectorAll(".tick").length > 12,
  gradient: (r) => /url\(#atc-thermal\)/.test(r.innerHTML) && /atc-thermal/.test(r.innerHTML),
  thermometer: (r) => r.querySelector(".bar-track") && r.querySelector(".thermo"),
  minimal: (r) => r.host.getAttribute("dial-style") === "minimal" && r.querySelector(".arc"),
};

for (const style of STYLES) {
  for (const [vname, mkStates, entityId, extra] of VARIATIONS) {
    const el = await mount({ display: "full", dial_style: style, ...extra }, mkStates(), entityId);
    const text = el.shadowRoot.textContent.replace(/\s+/g, " ").trim();
    const root = dialRoot(el);
    assert(!!root && text.length > 0, `${style}/${vname} renders`);
    if (root) assert(!!featureCheck[style](root), `${style}/${vname} draws its ${style} layer`);
    if (root && vname === "range") {
      const slots = root.querySelectorAll(".range-readout .slot");
      assert(slots.length === 2, `${style}/range shows both setpoint buttons`);
    }
  }
}

// linear/continuous readout: value change settles on the target, no NaN
{
  const el = await mount({ display: "full" }, { "climate.lr": mkEntity() });
  const num = dialRoot(el)?.querySelector("atc-number");
  assert(!!num, "atc-number present in dial");
  if (num) {
    num.value = 25;
    await new Promise((r) => setTimeout(r, 300));
    const shown = num.shadowRoot.querySelector(".sr-only").textContent;
    assert(/^25(\.0)?°/.test(shown), `atc-number reaches the target ("${shown}")`);
  }
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
