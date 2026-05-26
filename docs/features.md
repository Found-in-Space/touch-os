# Features

This document describes the current shipped feature set for `touch-os`.

It is intentionally scoped to what exists in the package today. Future work lives in the linked `plan-*` docs at the end.

## Core Runtime

Shipped in `@found-in-space/touch-os` and `@found-in-space/touch-os/core`:

- `createRuntime` for mounting a `DisplayNode` tree and producing render snapshots
- explicit component lifecycle support: mount, update, measure, layout, render, hit test, event handling, dispose
- normalized input model for pointer, scroll, focus, blur, and tick events
- emitted output model for:
  - `action`
  - `change-request`
  - `navigation-request`
- geometry helpers for points, sizes, rects, insets, clamping, intersection, and hit testing
- draw-command model for:
  - rectangles
  - circles
  - lines
  - text
  - bitmaps
  - embedded surfaces
- runtime introspection for:
  - current interaction snapshot
  - component bounds
  - dirty layout and render state
  - queued outputs

## Built-In Components

Shipped in `@found-in-space/touch-os/components`:

- `createButton`
  Generic action button.
- `createHoldButton`
  Emits start and stop actions for hold-style interaction.
- `createRepeatButton`
  Repeats from runtime tick timing rather than host timers.
- `createDPad`
  Discrete four-direction hold control.
- `createToggle`
  Controlled boolean change-request component.
- `createSlider`
  Controlled numeric change-request component with step snapping and optional display labels.
- `createChoiceGroup`
  Single-select or multi-select controlled choice component.
- `createTextLabel`
  Basic display text.
- `createValueReadout`
  Label plus value presentation.
- `createActionCard`
  Compact information-plus-action shell.
- `createListItem`
  Row-oriented informational item with optional interaction.
- `createBitmapPlot`
  Shared-surface bitmap-backed plot using the runtime bitmap service.
- `createCustomGraph`
  Vector-rendered interactive graph example component.
- `createEmbeddedSurface`
  Live surface component backed by the embedded-surface service.

## Built-In Containers

Shipped in `@found-in-space/touch-os/containers`:

- `createRow`
- `createColumn`
- `createStack`
- `createOverlay`
- `createSection`
- `createScrollContainer`
- `createPageContainer`
- `createDockLayout`
- `createSurfaceShell`
- `createWindow`
- `createWindowLayer`

These cover the core runtime composition patterns needed for panels, forms, HUD groupings, overlays, responsive page shells, paged settings-style UIs, and movable surface-local window layouts.

`createWindowLayer` manages fixed rect windows, z-order, focus-on-press, drag-handle movement, clamping to the layer bounds, optional close/minimize/maximize controls, and `window-state-change` outputs for app persistence.

## Runtime Services

Shipped in `@found-in-space/touch-os/services`:

- layout service
- navigation service
- scroll service
- focus service
- theme service
- timing service
- surface metrics service
- bitmap service
- embedded-surface service

Default in-memory implementations are exported for all of those services, including:

- `createMemoryLayoutService`
- `createMemoryNavigationService`
- `createMemoryScrollService`
- `createMemoryFocusService`
- `createThemeService`
- `createTimingService`
- `createSurfaceService`
- `createBitmapService`
- `createEmbeddedSurfaceService`

## Embedded Surfaces And Shared Raster Content

Current shipped media support includes two distinct paths.

### Shared-Surface Bitmap Path

For runtime-generated raster content that still belongs to the shared UI surface:

- allocate and update assets through the bitmap service
- render those assets through bitmap draw commands
- keep hit testing and outputs in the normal component model

### Embedded Surface Path

For externally owned live surfaces such as camera feeds or secondary render targets:

- bind a component to a published `sourceId`
- select copy or host-composited presentation
- preserve aspect ratio
- mirror horizontally when needed
- optionally forward runtime events into the attachment
- inspect source and attachment state for diagnostics and testing

The current implementation already supports multi-presentation publication by source id and host-side composite placement data for Three.js hosts.

## Host Support

### Generic Host Contracts

Shipped in `@found-in-space/touch-os/hosts` and re-exported as types from the root package:

- `HostFrame`
- `HostAdapter`

These let custom hosts drive the runtime without importing Three.js-specific code.

### Three.js Host Package

Shipped in `@found-in-space/touch-os/hosts/three`:

- `createScenePanelHost`
- `createPoseAnchoredPanelHost`
- `createHudHost`
- `createScenePanelDriver`
- `createPoseAnchoredPanelDriver`
- `createHudPanelDriver`
- `createPanelInteractor`
- `createScreenPointerSource`
- `createXrRayPointerSource`
- `createDirectTouchPointerSource`

Current Three.js host coverage includes:

- scene-mounted panels
- explicit-pose attached panels
- tablet and HUD helpers
- screen, ray, surface, and direct-contact pointer transport
- pointer claim and blocking policies
- pluggable pointer presentation integration
- host-side composite embedded-surface placement resolution

## Panel Coordination

Shipped in `@found-in-space/touch-os/coordination`:

- `routePointerSample` for stateless ordered routing across panels
- `createPanelCoordinator` for pointer-scoped ownership across multiple samples
- same-frame fallthrough when a higher-priority panel misses
- lower-priority pointer clearing after a panel claims or blocks a sample
- per-pointer ownership for simultaneous mouse, touch, controller, ray, and contact sources
- release and cancel cleanup through `phase` or normalized `type` fields

## Declarative Schema Adapter

Shipped in `@found-in-space/touch-os/adapters/schema`:

- `createSchemaAdapter`
- schema document, page, item, and registration contracts
- transactional updates through a controller API
- built-in schema kinds for:
  - text
  - button
  - toggle
  - slider
  - choice group
  - value readout
  - action card

The adapter stays optional and compiles schema documents to ordinary `DisplayNode` trees.

## Testing And Reference Fixtures

The repo currently includes:

- unit coverage for core runtime behavior, controls, containers, schema, embedded surfaces, and hosts
- reusable reference fixtures in `src/examples/reference-fixtures.ts`
- a fuller integration example in `examples/three-living-room`

The runtime and services are designed to stay testable without requiring a live 3D, WebGL, or XR environment.

## Not Shipped Yet

The following intentionally remain planned work rather than implicit promises:

- browser and DOM-adjacent hosts in [plan-browser-hosts.md](./plan-browser-hosts.md)
- bounded scene panels in [plan-movable-components.md](./plan-movable-components.md)
- presentation variants and runtime bindings in [plan-presentation-variants.md](./plan-presentation-variants.md)
- source-bound embedded-surface input sinks in [plan-embedded-surface-input.md](./plan-embedded-surface-input.md)
