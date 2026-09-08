# Progress — first implementation

Date: 2026-09-08 (overnight session)

## What's done

Full first cut of the card, building and passing tests. Not committed (per your
request), staged on a fresh nested git repo at `thermostat-card/` on `main`.

### Live preview

- Artifact: https://claude.ai/code/artifact/3caffb9b-14bf-465f-8f94-c90370aeb324
- Local: `npm run preview` → http://localhost:4173
- `preview/standalone.html` — single self-contained file, open anywhere.

Preview controls: theme (HA light/dark, Neumorphism light/dark), reduced-motion,
RTL, "reset entities". Service calls mutate fixture state after ~380 ms so the
optimistic → authoritative reconciliation runs for real. `?theme=t-neu-dark` etc.
deep-links.

### Architecture (as in the handoff)

```
src/
  adaptive-thermostat-card.ts         card lifecycle, display-mode routing, grid options
  adaptive-thermostat-card-editor.ts  ha-form based, capability-aware
  config.ts                           types, defaults, validation, unknown-key preservation
  model/
    adapter.ts                        NormalizedThermostat contract + shared helpers
    climate-adapter.ts / water-heater-adapter.ts
    index.ts                          makeAdapter() factory
  controllers/temperature-controller.ts  optimistic values, clamp, debounce, reconcile
  components/
    dial-geometry.ts       pure horseshoe math (unit-tested)
    horseshoe-dial.ts      pointer/touch/keyboard dial, thumb modes, range arcs
    animated-temperature.ts  odometer + reel, reduced-motion aware
    compact-thermostat.ts  adaptive tile, container queries, ▲/▼ steppers
    full-thermostat.ts     dial + mode row + advanced controls
    mode-menu.ts           segmented row / anchored menu
    advanced-controls.ts   progressive preset/fan/swing/away
    thermostat-overlay.ts  portal modal, focus trap, scroll lock
  styles/tokens.ts         --atc-* tokens from HA theme vars
```

### Tests (`npm test`, 28 passing)

config validation/defaults, climate + water-heater normalization and service
payloads, range-crossing prevention, controller debounce/optimistic/reconcile/
rollback, dial geometry round-trips and gap-snapping.

Also `npm run typecheck`, `npm run lint`, `node scripts/smoke.mjs` (headless
bundle render check) all green.

### Packaging

`hacs.json`, `package.json` scripts, `.gitignore`, MIT `LICENSE`, `README.md`
(install / options table / card-mod / a11y / release), `CHANGELOG.md`,
`examples/dashboard.yaml`, GitHub Actions (`ci`, `validate` = hacs/action,
`release` = build + attach asset on tag).

## Verified visually (headless Chrome screenshots)

HA-light and Neumorphism-dark, all 12 preview cells: compact narrow/wide,
compact inline, dual-setpoint compact, full heat/cool/range/water-heater/
unavailable, thumb always/never, editor. Renders correctly in both.

## Known gaps / next choices for you

1. **API verification not yet done against live HA docs.** `swing_horizontal_mode`
   (HA 2025.x), water_heater services and feature bitmasks are coded from
   memory — worth confirming before release. Handoff step 3.
2. **HACS packaging rules** likewise coded from current knowledge, not
   re-verified against HACS docs. Handoff step 3.
3. **Naming** still provisional: element `adaptive-thermostat-card`
   (`custom:adaptive-thermostat-card`), repo `thermostat-card`. Not locked with
   you yet. No GitHub remote created.
4. **Real HA preview** (Docker, dummy entities) from
   `numorphism/preview/README.md` — not built yet; the standalone harness
   covers the visual matrix without a HA instance.
5. Odometer 9→0 rolls backwards nine slots (marked `ponytail:` in
   `animated-temperature.ts`) — fine for °C/°F steps, revisit if it bugs.
6. Range arc is a single heat→cool gradient band between the two setpoints;
   the brainstorm mock showed two detached stubs. Easy to switch back.
7. `thermostat-overlay` portals to `<body>` and returns home on close; tested
   headless only — needs a real dashboard smoke test for focus restore.
8. card-mod `::part()` piercing documented but not tested against real card-mod.

## Running it in your HA now

`npm run build` → copy `dist/adaptive-thermostat-card.js` to `config/www/`,
add the resource, add a `type: custom:adaptive-thermostat-card` card.
