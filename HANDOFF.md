# Thermostat Card — LLM Handoff

## Mission

Build a new, production-quality, HACS-compatible Home Assistant Lovelace thermostat card in:

`/Users/alon/Desktop/lovelace/thermostat-card`

The interaction is inspired by Apple Home's thermostat control, but the component must be generic, theme-driven, and faithful to Home Assistant entity capabilities and service semantics. It must support adaptive compact cards, a full horseshoe thermostat, an inline expansion, and a custom overlay.

Do not modify anything outside `/Users/alon/Desktop/lovelace/thermostat-card`.

## Workspace safety

- The target directory is currently not its own Git repository. It sits inside the Git repository rooted at `/Users/alon/Desktop/lovelace`.
- The parent repository has a pre-existing unusual/dirty state: files at its old root appear deleted and `numorphism/` is untracked. These changes belong to the user. Do not repair, stage, discard, move, or commit them.
- The user wants a new repository. Initialize Git only inside `/Users/alon/Desktop/lovelace/thermostat-card` when implementation begins, creating a nested repository that isolates this project.
- GitHub CLI (`gh`) is installed and authenticated. Do not create a remote repository until the user has approved the final repository name, owner, visibility, and description.
- Read `/Users/alon/Desktop/lovelace/numorphism` as a visual/testing reference only. Never edit it.
- No implementation has been started. Only this handoff and browser-based design mockups exist in the target directory.

## User collaboration preference

The user explicitly said to always use visual previews for meaningful design decisions. Continue the browser-based preview workflow rather than asking them to imagine visual changes from prose.

Existing brainstorming screens are under:

`/Users/alon/Desktop/lovelace/thermostat-card/.superpowers/brainstorm/78018-1788811633/content`

They capture the progression of decisions. The latest relevant screens include:

- `thumb-behavior.html`
- `number-motion.html`
- `dual-setpoint.html`
- `secondary-controls.html`
- `palette-behavior.html`
- `entity-scope.html`
- `default-behavior.html`
- `architecture-options.html`

The preview server is temporary and may no longer be running. If needed, restart the brainstorming visual companion with the same project directory so the existing screens remain available.

## Approved product decisions

### Component scope

- Ship one HACS frontend repository containing a custom Lovelace card and visual card editor.
- Support both `climate` and `water_heater` entities, matching the entity scope of Home Assistant's built-in thermostat card.
- Register a card-picker entry and support YAML configuration.
- Use a self-contained Lit web component. Do not compose, copy, subclass, or depend on Home Assistant's private thermostat frontend elements.
- Use only Home Assistant's normal card contract, `hass` state data, supported service APIs, standard events such as `hass-more-info`, and theme CSS variables.
- Bundle runtime dependencies into the distributed JavaScript. The installed card must have no external runtime dependency.

### Display modes

All of these are required user choices:

1. Adaptive compact card that opens the full control in a custom overlay.
2. Adaptive compact card that expands the full control inline.
3. Full thermostat card shown from the start.

Suggested configuration shape:

```yaml
type: custom:adaptive-thermostat-card  # provisional until naming is approved
entity: climate.living_room
display: compact        # compact | full
open_behavior: overlay  # overlay | inline; used by compact
```

A new/stub card still needs defaults. Use `display: compact` and `open_behavior: overlay` unless the user changes that before implementation. The visual editor must make all three outcomes immediately discoverable.

### Adaptive compact layout

- Participate correctly in Home Assistant Sections grid sizing through `getGridOptions()` and normal responsive/container behavior.
- Do not force full width.
- At narrow widths, render a small square/portrait tile.
- At wider compact widths, render a horizontal tile.
- Compact mode does not render a miniature horseshoe.
- Show entity name, current state/action, current temperature when supplied, target temperature, selected HVAC/operation mode, and temperature steppers without visual crowding.
- Use persistent `▲` and `▼` buttons—not plus/minus and not alternate triangle glyphs.
- Tapping the current mode opens an anchored popup/menu containing only the modes advertised by that entity. Examples include Off, Heat, Cool, Heat/Cool, Dry, Fan only, and Auto.
- Localize labels through Home Assistant when translations are available.
- `auto` means the device/integration's advertised automatic HVAC operation. It is not synonymous with `heat_cool`; `heat_cool` manages low and high targets.

### Full thermostat layout

- The main control is a horseshoe-shaped circular temperature dial.
- The central value is the target temperature, with a concise contextual label such as `Heat to` and current temperature/action as secondary information.
- A draggable head controls the target around the horseshoe.
- Keep the mode controls visually close to the horseshoe. The approved mockup uses about 7px between the dial's visible lower bound and the mode row. Do not base spacing on a larger invisible SVG box.
- Remove instructional copy such as `drag the illuminated thumb` from the steady-state card.
- The mode row and any popup must be capability-driven.
- The top overflow button opens Home Assistant's native more-info dialog using the standard `hass-more-info` event.

### Dial thumb

Support:

```yaml
thumb: interaction  # interaction | always | never
```

`interaction` is the approved default:

- No separate thumb is visible at rest; the colored arc ends with a normal rounded stroke cap.
- On pointer/touch interaction, a sufficiently large touch target appears directly beneath the user's finger at the live arc endpoint.
- It moves exactly with the endpoint while dragging.
- It fades after release/cancel.
- It must never float beside the arc, remain at a stale position, or use the oversized white-ring treatment shown in rejected previews.

`always` shows a small accent thumb centered precisely on the live arc endpoint. `never` relies only on the rounded stroke endpoint.

The visual target and interactive hit target may differ in size. Preserve a touch target of at least 44×44 CSS pixels without drawing a 44px circle.

### Number animation and precision

Support:

```yaml
number_animation: odometer  # odometer | reel
```

- `odometer` is the approved default. Only digits whose values change roll vertically.
- `reel` remains a supported option. The entire localized temperature value rolls as one unit.
- Increasing temperature through `▲` or clockwise drag rolls upward. Decreasing through `▼` or counter-clockwise drag rolls downward.
- Both animations must support whole and single-decimal values, including transitions such as `19.5 → 20.0`.
- Precision and step come from entity capability attributes/display precision. Do not hard-code whole degrees or `0.5`.
- Preserve the user's locale and the Home Assistant temperature unit.
- Under `prefers-reduced-motion: reduce`, update values without rolling. Never rely on motion alone to convey meaning.

### Temperature behavior

- Clamp values to entity `min_temp` and `max_temp`.
- Use the entity's advertised `target_temp_step`/precision where available and the current Home Assistant fallback behavior where it is absent.
- Update the visible value optimistically while dragging/stepping so the card feels direct.
- Debounce repeated stepper service calls and avoid flooding Home Assistant during a drag. Commit the final drag value reliably on pointer release/cancel.
- Reconcile optimistic state with the next authoritative entity update. Handle rejected, clamped, delayed, and unavailable updates without leaving stale UI.
- Prevent page scrolling only after the gesture is recognized as a dial drag; preserve normal dashboard scroll behavior elsewhere.

### Dual-setpoint entities

- Support Home Assistant entities that advertise a target temperature range.
- Only show this interface when the entity supplies valid low and high targets; ordinary thermostats retain the simpler single-target UI.
- Expanded Heat/Cool mode shows two colored values and two corresponding arc endpoints.
- One target is selected at a time. Selecting/dragging near an endpoint chooses that target.
- Compact Heat/Cool mode shows the low and high values; tapping one selects it, and the shared `▲`/`▼` controls adjust that selection.
- Prevent low and high values from crossing and mirror Home Assistant's current service payload semantics.
- Apply the chosen odometer/reel animation and entity precision to both targets.

### Progressive secondary controls

The approved choice is progressive disclosure:

- Keep target temperature and primary mode controls prominent.
- Put additional supported controls behind a collapsed `More controls` section.
- Render only capabilities actually supplied by the entity.
- Include relevant presets, fan mode, swing mode, and horizontal swing mode when supported.
- Use current official Home Assistant services and payload shapes. Do not infer capability from labels alone.
- The full native more-info dialog remains available from the overflow button even when the custom advanced section is disabled.

### Climate and water-heater adapters

Keep domain-specific semantics out of visual components. Define an adapter/controller contract that supplies normalized data and actions such as:

- name and availability
- current value and target value/range
- min, max, step, precision, and unit
- operating state/action
- supported primary modes and selected mode
- supported secondary controls
- set target/set range
- set mode/operation
- invoke supported secondary services

Implement separate climate and water-heater adapters against current official Home Assistant APIs. Verify water-heater operation modes and services from current primary sources before coding; do not assume they are identical to climate services.

## Theme and card-mod contract

The card must be generic. The user—not the component—controls the Home Assistant theme.

- Appearance always follows the active HA light/dark mode and theme.
- Support Home Assistant's normal `theme:` card override when the user wants a different theme for this card.
- Do not add a separate component-owned light/dark palette selector; Home Assistant remains the source of truth.
- Use HA CSS variables for surface, primary/secondary text, dividers, focus, state colors, border radius, typography, and shadows where available.
- Provide sensible fallbacks when a theme omits a variable.
- Do not require the Neumorphism theme or card-mod.
- The reference Neumorphism theme should look polished automatically in light and dark mode.
- HVAC action/mode colors remain semantic and theme-aware: heating, cooling, idle/off, and unavailable must be distinguishable.

Card-mod support is required. Give stable styling hooks to at least:

- host/card shell
- header and status
- compact layout
- readout and individual number columns
- dial, track, active arc, and interaction thumb
- mode control/menu
- stepper buttons
- progressive advanced-controls section
- overlay/backdrop/panel

Prefer a documented combination of CSS custom properties and `part` attributes. Keep internal class names stable enough for documented card-mod examples. Render a real `ha-card` shell so normal card-mod usage remains familiar. Add card-mod examples to the README and test that injected styles reach the intended elements.

## Overlay and inline behavior

- Compact and full presentations share one full-control component and one state/controller; do not duplicate service logic.
- Inline expansion changes only this card's content/height and offers an obvious collapse action.
- Overlay uses a self-contained accessible modal layer; do not require browser_mod or Home Assistant private dialog components.
- Overlay must trap focus, support Escape/backdrop close, restore focus to the triggering compact card, lock only the necessary scroll surface, and clean up listeners on disconnect.
- The overlay must fit phone safe areas, tablet, and desktop; it must not overflow small screens.
- Only one overlay instance should be active per card. Closing it must not discard a temperature update already committed by the user.

## Accessibility and input requirements

- Full mouse, touch, stylus, and keyboard operation.
- Arrow keys adjust the selected target by the entity step when focus is on the dial/readout control.
- Home/End may move to min/max only if that matches the final accessibility design and includes confirmation against accidental changes.
- Use correct button semantics, labels, roles, and `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-valuetext` for slider-like controls.
- Maintain visible focus in arbitrary HA themes.
- Keep interactive targets at least 44×44 CSS pixels.
- Announce committed changes without announcing every drag pixel.
- Respect RTL layout without reversing the temperature increase/decrease semantics.
- Support reduced motion and sufficient contrast.
- Unavailable entities remain legible, non-interactive, and still allow native more-info access.

## Proposed architecture

The user approved the self-contained Lit approach.

Suggested module boundaries (names may be adjusted, responsibilities should remain separated):

```text
src/
  thermostat-card.ts             # registration and card lifecycle
  thermostat-card-editor.ts      # visual editor
  config.ts                      # config types, defaults, validation, migration
  model/
    thermostat-adapter.ts        # normalized domain contract
    climate-adapter.ts
    water-heater-adapter.ts
  controllers/
    temperature-controller.ts    # optimistic values, clamping, debounce, services
    overlay-controller.ts
  components/
    compact-thermostat.ts
    full-thermostat.ts
    horseshoe-dial.ts
    animated-temperature.ts
    mode-menu.ts
    advanced-controls.ts
    thermostat-overlay.ts
  styles/
    tokens.ts
    card-styles.ts
```

Important boundaries:

- Adapters understand Home Assistant entity/service semantics.
- Controllers own interaction state and service orchestration.
- Visual components render normalized state and emit intent events.
- Compact/full/overlay views never call HA services directly.
- Theme/card-mod hooks live in documented styling layers rather than scattered literals.

## Configuration and editor

The final naming still needs confirmation. Avoid a generic custom-element collision if possible. A reasonable candidate is `custom:adaptive-thermostat-card`, while the repository may remain `thermostat-card`.

Expected user-facing settings:

- entity
- optional name
- display: compact/full
- compact open behavior: overlay/inline
- thumb: interaction/always/never
- number animation: odometer/reel
- current-vs-target emphasis if parity with `show_current_as_primary` is desired
- progressive secondary controls enabled/disabled
- optional standard theme override

The editor should be capability-aware once an entity is selected and hide or disable irrelevant settings with a short explanation. Preserve unknown config keys during editor round trips when possible.

## HACS and repository deliverables

Before implementing packaging, verify the current HACS plugin/frontend repository requirements from official HACS documentation because these rules can change.

Expected deliverables include:

- nested Git repository scoped to this directory
- TypeScript + Lit source
- reproducible build producing one browser-loadable JavaScript asset
- `hacs.json` with the correct category/filename fields
- `package.json` scripts for build, typecheck, lint, unit tests, and formatting
- `.gitignore`
- license selected with the user if not already specified
- comprehensive README with HACS custom-repository install, resource registration, UI/YAML configuration, all options, card-mod examples, and screenshots
- example dashboard/entities
- changelog/release process
- GitHub Actions for build/test and current HACS validation
- tagged release artifact in the format HACS expects

Do not create the GitHub repository or publish a release without explicit approval for the remote name and visibility.

## Preview and verification environment

The reference project documents an isolated Home Assistant Docker preview in:

`/Users/alon/Desktop/lovelace/numorphism/preview/README.md`

Reuse the pattern, not its files. Build a self-contained preview under this repository with dummy/test entities and no real devices. The reference was tested against Home Assistant 2026.9.1/frontend 20260826.6, but the receiving LLM must confirm the version actually selected for this project.

Visual verification matrix:

- HA default light/dark themes
- Neumorphism light/dark theme from the reference project
- compact narrow square and compact horizontal sizes
- full, inline-expanded, and overlay presentations
- climate single-target and target-range entities
- water heater
- heat, cool, heat/cool, auto, dry, fan-only, off/idle, and unavailable when advertised
- whole and one-decimal target steps
- odometer and reel animations in both directions
- thumb interaction/always/never
- progressive controls present/absent by capability
- card-mod examples
- phone, tablet, and desktop sizes
- keyboard and touch operation
- reduced motion and RTL

## Test strategy

Use test-driven implementation for domain logic and interaction behavior.

At minimum, automate:

- configuration validation/defaults/editor events
- capability detection for climate and water heater
- min/max clamping and entity-defined precision/step
- single-target and range service payloads
- range crossing prevention
- optimistic state reconciliation and unavailable transitions
- drag direction/angle/value mapping, including arc endpoints
- pointer cancellation and final service commit
- debounce behavior for steppers and drag
- odometer carry/borrow transitions with decimals
- reel direction
- reduced-motion behavior
- HVAC mode popup filtering
- progressive secondary controls filtering and service calls
- overlay focus, Escape, backdrop close, focus restore, and cleanup
- `getCardSize()`/`getGridOptions()` behavior
- theme variable fallbacks and stable `part` names
- card-mod smoke styling
- build artifact loading and custom-element registration

Do not claim pixel-perfect or accessibility completion from unit tests alone. Run the isolated HA preview and perform the visual/input matrix.

## Error behavior

- Invalid or unsupported entity: render an HA-style warning with the configured entity ID and keep the card editor usable.
- Missing target capability: render read-only current state rather than a broken dial.
- Unavailable/unknown values: do not display `NaN`, jump the dial, or call services.
- Service failure: roll back optimistic state to the next authoritative entity state and surface a concise HA-compatible error/toast where feasible.
- Entity capability changes at runtime: recompute adapters and controls without requiring a reload.
- Malformed config: throw a concise `setConfig` error for required fields and use safe defaults for optional fields.

## Non-goals for the initial release

- No Home Assistant backend integration or custom component.
- No cloud service, account, telemetry, polling loop, or analytics.
- No browser_mod dependency.
- No dependency on the user's Neumorphism theme or press-feedback module.
- No copying Apple artwork, proprietary assets, or exact trade dress. Use the interaction as inspiration and Home Assistant theming as the final visual authority.
- No unrelated changes to the parent Lovelace repository or the reference theme.

## Acceptance criteria

The first release is ready when:

1. It installs as a HACS custom frontend repository and loads one built asset without console errors.
2. A user can add/configure the card through both the visual editor and YAML.
3. Supported `climate` and `water_heater` entities render correctly.
4. Compact overlay, compact inline, and full presentations all work.
5. Compact cards adapt to HA grid width and use `▲`/`▼` steppers.
6. The full horseshoe supports accurate pointer/touch/keyboard target changes.
7. Interaction thumb behavior is correct for interaction/always/never.
8. Odometer is the default, reel is optional, and both support one-decimal entity precision.
9. Single and dual targets produce correct, clamped HA service calls.
10. Mode and secondary-control UI is strictly capability-driven.
11. The component follows arbitrary HA themes and exposes documented card-mod hooks.
12. Reduced motion, focus, labels, modal behavior, and minimum target sizes pass manual checks.
13. Automated tests and the isolated Home Assistant preview validation pass.
14. README/HACS/release artifacts are complete and reproducible.

## Recommended next steps for the receiving LLM

1. Read this handoff and inspect the latest preview HTML files.
2. Confirm the product/repository/custom-element name and GitHub visibility with the user; show naming options in the visual preview if the user wants a visual decision.
3. Verify current official Home Assistant climate/water-heater APIs and current HACS packaging rules.
4. Present the final architecture/configuration/error-handling/test design as a concise visual design review.
5. Obtain explicit user approval before implementation.
6. Write the implementation plan and execute it in small, verified slices.
7. Initialize Git only inside the target directory; never stage parent-repository changes.
8. Do not publish to GitHub until the user explicitly approves the remote details.
