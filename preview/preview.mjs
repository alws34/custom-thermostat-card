// Standalone preview harness. Mocks just enough of Home Assistant to exercise
// the real card bundle: a fake `hass`, an `ha-card` shell, `hass-more-info`
// handling and an in-memory service bus that mutates entity state so the
// optimistic/authoritative reconciliation path runs for real.

// ---- ha-card shell -------------------------------------------------------
if (!customElements.get("ha-card")) {
  customElements.define(
    "ha-card",
    class extends HTMLElement {
      connectedCallback() {
        this.style.display = "block";
        this.style.background = "var(--ha-card-background, var(--card-background-color, #fff))";
        this.style.color = "var(--primary-text-color, #222)";
        this.style.borderRadius = "var(--ha-card-border-radius, 12px)";
        this.style.boxShadow = "var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,.12))";
      }
    },
  );
}
// minimal ha-form stub so the editor renders something inspectable
if (!customElements.get("ha-form")) {
  customElements.define(
    "ha-form",
    class extends HTMLElement {
      set schema(s) {
        this._s = s;
        this.render();
      }
      set data(d) {
        this._d = d;
        this.render();
      }
      render() {
        if (!this._s) return;
        this.innerHTML = `<pre style="white-space:pre-wrap;font-size:12px;opacity:.8">${JSON.stringify(
          this._d,
          null,
          2,
        )}</pre>`;
      }
    },
  );
}

// ---- entity fixtures ---------------------------------------------------
const base = (id, attrs, state) => ({
  entity_id: id,
  state,
  last_changed: "",
  last_updated: "",
  context: { id: "x" },
  attributes: attrs,
});

const FIXTURES = {
  C: {
    living: { current_temperature: 21.3, temperature: 22, min_temp: 7, max_temp: 35, target_temp_step: 0.5 },
    bedroom: {
      current_temperature: 20.5,
      target_temp_low: 19.5,
      target_temp_high: 23,
      min_temp: 7,
      max_temp: 35,
      target_temp_step: 0.5,
    },
    office: { current_temperature: 25.8, temperature: 23, min_temp: 16, max_temp: 30, target_temp_step: 1 },
    tank: { current_temperature: 48, temperature: 51, min_temp: 43, max_temp: 62 },
  },
  F: {
    living: { current_temperature: 70, temperature: 72, min_temp: 45, max_temp: 95, target_temp_step: 1 },
    bedroom: {
      current_temperature: 69,
      target_temp_low: 67,
      target_temp_high: 73,
      min_temp: 45,
      max_temp: 95,
      target_temp_step: 1,
    },
    office: { current_temperature: 78, temperature: 74, min_temp: 60, max_temp: 86, target_temp_step: 1 },
    tank: { current_temperature: 118, temperature: 124, min_temp: 110, max_temp: 140 },
  },
};

function freshEntities(scale = "C") {
  const f = FIXTURES[scale];
  return {
    "climate.living_room": base(
      "climate.living_room",
      {
        friendly_name: "Living Room",
        ...f.living,
        hvac_modes: ["off", "heat", "cool", "heat_cool", "auto"],
        hvac_action: "heating",
        supported_features: 1 | 2 | 8 | 16 | 32,
        fan_modes: ["auto", "low", "high"],
        fan_mode: "auto",
        preset_modes: ["none", "eco", "comfort", "boost"],
        preset_mode: "comfort",
        swing_modes: ["off", "vertical", "horizontal"],
        swing_mode: "off",
      },
      "heat",
    ),
    "climate.bedroom": base(
      "climate.bedroom",
      {
        friendly_name: "Bedroom",
        temperature: null,
        ...f.bedroom,
        hvac_modes: ["off", "heat", "cool", "heat_cool"],
        hvac_action: "idle",
        supported_features: 1 | 2,
      },
      "heat_cool",
    ),
    "climate.office": base(
      "climate.office",
      {
        friendly_name: "Office AC",
        ...f.office,
        hvac_modes: ["off", "cool", "dry", "fan_only"],
        hvac_action: "cooling",
        supported_features: 1 | 8,
        fan_modes: ["auto", "quiet", "turbo"],
        fan_mode: "auto",
      },
      "cool",
    ),
    "climate.garage": base(
      "climate.garage",
      { friendly_name: "Garage", supported_features: 1, hvac_modes: ["off", "heat"] },
      "unavailable",
    ),
    "water_heater.tank": base(
      "water_heater.tank",
      {
        friendly_name: "Hot Water",
        ...f.tank,
        operation_list: ["off", "eco", "electric", "performance"],
        operation_mode: "eco",
        away_mode: "off",
        supported_features: 1 | 2 | 4,
      },
      "eco",
    ),
  };
}

let scale = "C";
let entities = freshEntities(scale);
const cards = new Set();

// ---- fake service bus -----------------------------------------------
function applyService(domain, service, data = {}) {
  const id = Array.isArray(data.entity_id) ? data.entity_id[0] : data.entity_id;
  const e = entities[id];
  if (!e) return;
  // clone so the card sees a new reference
  const next = { ...e, attributes: { ...e.attributes } };
  if (service === "set_temperature") {
    if (data.temperature != null) next.attributes.temperature = data.temperature;
    if (data.target_temp_low != null) next.attributes.target_temp_low = data.target_temp_low;
    if (data.target_temp_high != null) next.attributes.target_temp_high = data.target_temp_high;
  } else if (service === "set_hvac_mode") {
    next.state = data.hvac_mode;
    next.attributes.hvac_action =
      data.hvac_mode === "off" ? "off" : data.hvac_mode === "cool" ? "cooling" : data.hvac_mode === "heat" ? "heating" : "idle";
  } else if (service === "set_operation_mode") {
    next.state = data.operation_mode;
    next.attributes.operation_mode = data.operation_mode;
  } else if (service === "set_fan_mode") next.attributes.fan_mode = data.fan_mode;
  else if (service === "set_preset_mode") next.attributes.preset_mode = data.preset_mode;
  else if (service === "set_swing_mode") next.attributes.swing_mode = data.swing_mode;
  else if (service === "set_swing_horizontal_mode")
    next.attributes.swing_horizontal_mode = data.swing_horizontal_mode;
  else if (service === "set_away_mode") next.attributes.away_mode = data.away_mode ? "on" : "off";
  entities = { ...entities, [id]: next };
  // simulate network latency before authoritative state lands
  setTimeout(pushHass, 380);
}

const LOCAL = {
  "ui.card.climate.heat": "Heat to",
  "ui.card.climate.cool": "Cool to",
  "ui.card.climate.target_temperature": "Set to",
  "ui.card.water_heater.target_temperature": "Set to",
};

function makeHass() {
  return {
    states: entities,
    entities: {},
    themes: { darkMode: document.getElementById("theme").value.endsWith("dark") },
    language: "en",
    locale: { language: "en" },
    config: { unit_system: { temperature: `°${scale}` } },
    localize: (k) => LOCAL[k] || "",
    callService: async (domain, service, data) => {
      applyService(domain, service, data);
      pushHass();
    },
  };
}

function pushHass() {
  const h = makeHass();
  cards.forEach((c) => (c.hass = h));
}

// ---- more-info toast ----------------------------------------------
const toast = document.getElementById("toast");
let toastTimer;
window.addEventListener("hass-more-info", (ev) => {
  toast.textContent = `more-info → ${ev.detail?.entityId ?? "?"}`;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
});

// ---- gallery ----------------------------------------------------
const SPECS = [
  { title: "Compact · overlay (narrow)", resize: true, w: 210, cfg: { entity: "climate.living_room", display: "compact", open_behavior: "overlay" } },
  { title: "Compact · overlay (wide)", cfg: { entity: "climate.living_room", display: "compact", open_behavior: "overlay" } },
  { title: "Compact · inline expand", cfg: { entity: "climate.office", display: "compact", open_behavior: "inline" } },
  { title: "Compact · dual setpoint", cfg: { entity: "climate.bedroom", display: "compact", open_behavior: "overlay" } },
  { title: "Arc · heat (default)", cfg: { entity: "climate.living_room", display: "full" } },
  { title: "Arc · heat/cool range", cfg: { entity: "climate.bedroom", display: "full" } },
  { title: "Ticks · single", cfg: { entity: "climate.living_room", display: "full", dial_style: "ticks" } },
  { title: "Ticks · range", cfg: { entity: "climate.bedroom", display: "full", dial_style: "ticks" } },
  { title: "Gradient · single", cfg: { entity: "climate.office", display: "full", dial_style: "gradient" } },
  { title: "Gradient · range", cfg: { entity: "climate.bedroom", display: "full", dial_style: "gradient" } },
  { title: "Thermometer · single", cfg: { entity: "climate.living_room", display: "full", dial_style: "thermometer" } },
  { title: "Thermometer · range", cfg: { entity: "climate.bedroom", display: "full", dial_style: "thermometer" } },
  { title: "Minimal · single", cfg: { entity: "climate.living_room", display: "full", dial_style: "minimal" } },
  { title: "Minimal · range", cfg: { entity: "climate.bedroom", display: "full", dial_style: "minimal" } },
  { title: "Gradient · current as primary", cfg: { entity: "climate.living_room", display: "full", dial_style: "gradient", show_current_as_primary: true } },
  { title: "Ticks · water heater", cfg: { entity: "water_heater.tank", display: "full", dial_style: "ticks" } },
  { title: "Thermometer · unavailable", cfg: { entity: "climate.garage", display: "full", dial_style: "thermometer" } },
  { title: "Compact · current as primary", cfg: { entity: "climate.office", display: "compact", show_current_as_primary: true } },
  { title: "Full · reel + thumb always", cfg: { entity: "climate.office", display: "full", number_animation: "reel", thumb: "always" } },
  { title: "Full · unavailable", cfg: { entity: "climate.garage", display: "full" } },
  { title: "Editor", editor: true, cfg: { entity: "climate.living_room", display: "compact" } },
];

const gallery = document.getElementById("gallery");

function build() {
  gallery.innerHTML = "";
  cards.clear();
  const theme = document.getElementById("theme").value;
  const h = makeHass();
  for (const spec of SPECS) {
    const cell = document.createElement("div");
    cell.className = "cell";
    const label = document.createElement("h2");
    label.textContent = spec.title;
    const surface = document.createElement("div");
    surface.className = `surface ${theme}` + (spec.resize ? " resizer" : "");
    if (spec.w) surface.style.width = spec.w + "px";

    const tag = spec.editor ? "custom-thermostat-card-editor" : "custom-thermostat-card";
    const el = document.createElement(tag);
    el.setConfig({ type: "custom:custom-thermostat-card", ...spec.cfg });
    el.hass = h;
    cards.add(el);
    surface.appendChild(el);
    cell.append(label, surface);
    gallery.appendChild(cell);
  }
}

document.getElementById("theme").addEventListener("change", build);
document.getElementById("unit").addEventListener("change", (e) => {
  scale = e.target.value;
  entities = freshEntities(scale);
  build();
});
document.getElementById("reduce").addEventListener("change", (e) =>
  document.body.classList.toggle("reduce", e.target.checked),
);
document.getElementById("rtl").addEventListener("change", (e) =>
  document.body.classList.toggle("rtl", e.target.checked),
);
document.getElementById("reset").addEventListener("click", () => {
  entities = freshEntities(scale);
  build();
});

// allow ?theme=t-neu-dark&unit=F&reduce=1&rtl=1 for screenshots / deep links
const params = new URLSearchParams(location.search);
if (params.get("theme")) document.getElementById("theme").value = params.get("theme");
if (params.get("unit")) {
  scale = params.get("unit");
  document.getElementById("unit").value = scale;
  entities = freshEntities(scale);
}
if (params.get("reduce")) {
  document.getElementById("reduce").checked = true;
  document.body.classList.add("reduce");
}
if (params.get("rtl")) {
  document.getElementById("rtl").checked = true;
  document.body.classList.add("rtl");
}

customElements.whenDefined("custom-thermostat-card").then(build);

// ?sim=drag — synthetic drag across every full dial, for headless QA screenshots
if (params.get("sim") === "drag") {
  setTimeout(() => {
    document.querySelectorAll("custom-thermostat-card").forEach((card) => {
      const dial = card.shadowRoot
        ?.querySelector("atc-full")
        ?.shadowRoot?.querySelector("atc-dial")
        ?.shadowRoot?.querySelector("svg");
      if (!dial) return;
      const r = dial.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const pt = (type, ang) =>
        dial.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            composed: true,
            pointerId: 1,
            clientX: cx + Math.cos(ang) * r.width * 0.42,
            clientY: cy + Math.sin(ang) * r.height * 0.42,
          }),
        );
      pt("pointerdown", (200 * Math.PI) / 180);
      for (let a = 200; a <= 320; a += 8) pt("pointermove", (a * Math.PI) / 180);
      pt("pointerup", (320 * Math.PI) / 180);
    });
  }, 400);
}
