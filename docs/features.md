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
  - `window-state-change`
  - `app-event`
  - `window-manager-change`
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

## App Bundle Contracts

Shipped in `@found-in-space/touch-os/apps`:

- `defineTouchApp` for app modules with validated manifests
- `createTouchAppRegistry` for explicit app registration, lookup, and manifest listing
- `createTouchAppInstance` for building a narrow `TouchAppContext` and invoking lifecycle hooks
- manifest contracts for app id, name, version, icon, capabilities, and preferred window size
- context contracts for surface metrics, theme, actions, window requests, optional storage, and optional embedded-surface publication

This is standardized packaging and lifecycle support for trusted same-runtime apps. It is not a security sandbox for untrusted third-party code.

## Window Manager

Shipped in `@found-in-space/touch-os/window-manager`:

- `createWindowManager` for hosting registered apps inside panel windows
- `TouchWindowState` and `WindowManagerProps` contracts for app windows
- `initialWindows` seeding, with live window state owned by the mounted manager session
- built-in launcher and task switcher windows backed by the app registry and running windows, with front/back/none z-order policy
- `appHostMode: "same-runtime" | "child-runtime"` for choosing the app hosting model
- same-runtime app rendering through `createWindowLayer` and `createWindow`
- app root id namespacing before mounting, so multiple apps can reuse local component ids safely
- child-runtime app rendering through embedded surfaces, with one `DisplayRuntime` per app window
- draining forwarded embedded-surface input translated into child-runtime display-space input
- app state resolution by `getAppState`, instance id, window id, or app id
- app output handling that strips the namespace before invoking the app instance's `handleOutput`
- `app-event` outputs for events emitted through `ctx.actions.emit(...)`
- opt-in raw child-runtime app output forwarding for transparent host integrations
- `window-manager-change` outputs for title, close, resize, open-app, and window-state changes

Same-runtime mode is still the simplest path for first-party panels built from standard containers and custom components that use the conventional `child`/`children` structural props. Child-runtime mode isolates app focus, scroll, navigation, and local component ids while still running trusted app code in the same JavaScript environment.

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
- `createThreePanelSession`
- `createPanelInteractor`
- `createScreenPointerSource`
- `createXrRayPointerSource`
- `createDirectTouchPointerSource`

Current Three.js host coverage includes:

- scene-mounted panels
- explicit-pose attached panels
- tablet and HUD helpers
- reusable session orchestration for panel update, render, pointer routing, and output flushing
- screen, ray, surface, and direct-contact pointer transport
- pointer claim and blocking policies
- pluggable pointer presentation integration
- host-side composite embedded-surface placement resolution, including nested child-runtime snapshots

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
