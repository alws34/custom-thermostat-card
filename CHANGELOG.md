# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-09-09

### Fixed

- Temperature changes from the dial could be lost while HVAC mode changes
  still worked. The dial now tracks pointer moves on the capture target
  itself (falling back to `window`) so an ancestor calling
  `stopPropagation()` can't hide them, and a drag arms a debounced commit
  in addition to committing on pointer release — so the value lands even
  if the `pointerup` is swallowed (kiosk browsers, cancelled gestures).

## [0.1.1] - 2026-09-09

### Fixed

- Dial did not respond to drags inside a carousel/swipe card
  (`simple-swipe-card`, Swiper). The dial control now presents a
  `role="slider"` wrapper those libraries recognise, claims the pointer
  gesture on `pointerdown` (`stopPropagation` + pointer capture on the host),
  tracks moves on `window`, and sets `touch-action: none` on the dial surface.

## [0.1.0] - 2026-09-09

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
