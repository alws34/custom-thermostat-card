# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation.
  - Self-contained Lit web component (`custom:custom-thermostat-card`) plus visual editor.
  - `climate` and `water_heater` support through separate domain adapters.
  - Three display modes: compact → overlay, compact → inline, full horseshoe.
  - Adaptive compact tile (square ⇄ horizontal) with persistent ▲ / ▼ steppers.
  - Horseshoe dial with pointer / touch / keyboard control and configurable
    thumb (`interaction` | `always` | `never`).
  - Odometer and reel number animations, entity-driven precision and step,
    reduced-motion aware.
  - Dual-setpoint (heat/cool) UI with non-crossing low/high targets.
  - Progressive "More controls" section for preset / fan / swing / away.
  - Optimistic updates with debounced service calls and authoritative reconciliation.
  - Accessible overlay (focus trap, Escape / backdrop close, focus restore, scroll lock).
  - Theme-driven styling via `--atc-*` tokens and `part` attributes for card-mod.
  - `getCardSize()` / `getGridOptions()` for Sections grid sizing.
  - Vitest unit suite for config, adapters, controller and dial geometry.
  - Standalone browser preview harness (`npm run preview`).
