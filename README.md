# touch-os

`touch-os` is a domain-neutral virtual-device UI runtime for screens that do not exist as native browser or mobile surfaces.

It is designed for things like:

- scene-mounted panels
- XR tablets and wrist slates
- cockpit and dashboard displays
- camera-locked HUD utilities
- reusable tool surfaces in 3D applications

The runtime stays headless and display-space-only. Hosts own environment-specific work such as scene placement, ray conversion, and native input translation.

## What Ships Today

- a strict TypeScript, ESM-only core runtime
- a small set of generic built-in components and containers
- runtime services for layout, navigation, focus, scroll, theme, timing, bitmap assets, and embedded surfaces
- standardized app manifest, lifecycle, context, and registry contracts
- a window manager for hosting registered apps in same-runtime or child-runtime surface-local windows
- a generic multi-panel coordination helper for ordered routing and pointer ownership
- a Three.js host package with scene, pose-anchored, tablet, and HUD panel helpers
- host-side pointer interop helpers for screen, ray, surface, and direct-contact input
- an optional schema adapter for code-generated or serialized surfaces

## Package Surface

| Entrypoint | Purpose |
| --- | --- |
| `@found-in-space/touch-os` | Headless root package. Re-exports core runtime, components, containers, services, apps, window manager, coordination, and generic host contract types. |
| `@found-in-space/touch-os/core` | Core runtime types, geometry helpers, events, draw commands, and `createRuntime`. |
| `@found-in-space/touch-os/components` | Built-in leaf components such as buttons, sliders, choice groups, graphs, and embedded surfaces. |
| `@found-in-space/touch-os/containers` | Built-in containers such as row, column, stack, overlay, scroll, page, section, and dock layout. |
| `@found-in-space/touch-os/services` | Runtime service contracts plus default in-memory implementations. |
| `@found-in-space/touch-os/coordination` | Generic ordered panel routing, fallthrough, and pointer ownership helpers. |
| `@found-in-space/touch-os/apps` | Standard app bundle, app context, registry, and lifecycle helpers. |
| `@found-in-space/touch-os/window-manager` | Same-runtime app window manager, window state contracts, and app-tree namespacing helpers. |
| `@found-in-space/touch-os/hosts` | Generic host contract types only. |
| `@found-in-space/touch-os/hosts/three` | Three.js host adapters, panel drivers, pointer sources, and panel interactor helpers. |
| `@found-in-space/touch-os/adapters/schema` | Optional declarative schema adapter. |

The root package intentionally stays headless. The Three.js adapter is an explicit subpath so consumers who only need the runtime do not pull `three` unintentionally.

## Installation

Core runtime only:

```sh
npm install @found-in-space/touch-os
```

Core runtime plus the Three.js host:

```sh
npm install @found-in-space/touch-os three
```

## Quick Start

```ts
import {
  createButton,
  createColumn,
  createRuntime
} from "@found-in-space/touch-os";

const root = createColumn("root", {
  gap: 12,
  children: [
    createButton("confirm", {
      label: "Confirm",
      actionId: "confirm.run"
    })
  ]
});

const runtime = createRuntime({
  root,
  surface: { width: 320, height: 180 }
});

const snapshot = runtime.render();

runtime.dispatchInput({
  type: "pointer-down",
  surfaceX: 24,
  surfaceY: 24,
  timestamp: 1
});

runtime.dispatchInput({
  type: "pointer-up",
  surfaceX: 24,
  surfaceY: 24,
  timestamp: 2
});

const outputs = runtime.takeOutputs();
```

`snapshot.commands` contains draw commands for your host renderer. `outputs` contains emitted runtime outputs such as actions, change requests, and navigation requests that your application can handle in its own state layer.

## Runtime Model

The normal integration loop is:

1. Build a tree of `DisplayNode`s from built-in factories or custom components.
2. Create a `DisplayRuntime` with surface metrics and optional service overrides.
3. Render draw commands into one shared surface.
4. Feed normalized input into the runtime.
5. Consume emitted outputs and update application state outside the runtime.
6. Replace the root or update services when external state changes.

`touch-os` does not own business state, routing outside the panel surface, scene placement, DOM events, or app-specific data fetching.

## Three.js Host Support

The current shipping host integration is `@found-in-space/touch-os/hosts/three`.

```ts
import * as THREE from "three";
import {
  createButton,
  createRuntime
} from "@found-in-space/touch-os";
import { createScenePanelHost } from "@found-in-space/touch-os/hosts/three";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();

const runtime = createRuntime({
  root: createButton("launch", {
    label: "Launch",
    actionId: "launch.run"
  }),
  surface: { width: 1024, height: 640 }
});

const host = createScenePanelHost({
  runtime,
  parent: scene,
  panelWidth: 1.2,
  panelHeight: 0.75,
  renderOnUpdate: true
});

host.attach();
host.update({ scene, camera });
```

The Three package also ships:

- scene-mounted, pose-anchored, tablet, and HUD hosts
- panel drivers that combine a host with pointer sources
- a `PanelInteractor` for app-owned pointer systems
- pointer source helpers for screen, XR ray, and direct-touch input

See [docs/usage.md](./docs/usage.md) and [`examples/three-living-room`](./examples/three-living-room) for fuller integration patterns.

## Current Feature Set

Shipped now:

- explicit component lifecycle: `mount`, `update`, `measure`, `layout`, `render`, `hitTest`, `handleEvent`, `dispose`
- normalized input and emitted output model
- generic controls: button, hold button, repeat button, d-pad, toggle, slider, choice group, text label, value readout, action card, list item
- richer display components: bitmap plot, custom graph, embedded surface
- containers: row, column, stack, overlay, section, scroll container, page container, dock layout, surface shell, window, window layer
- services: layout, navigation, scroll, focus, theme, timing, surface metrics, bitmap assets, embedded surfaces
- embedded-surface composition through copy or host-composited surface commands
- movable surface-local windows with drag handles, focus/z-order, clamping, and window-state-change outputs
- app bundle contracts for manifests, lifecycle hooks, app context, registries, and instance wrappers
- same-runtime and child-runtime app windows through `createWindowManager`, with launcher/task-switcher support, app/window-manager events, and opt-in raw child-runtime output forwarding
- panel coordination for ordered multi-panel routing, fallthrough, lower-priority clearing, and pointer-scoped ownership
- Three panel sessions for reusable runtime/driver update, render, pointer routing, and output flushing
- optional schema authoring for text, button, toggle, slider, choice group, value readout, and action card documents

Planned but not shipped yet:

- browser and DOM-adjacent hosts in [docs/plan-browser-hosts.md](./docs/plan-browser-hosts.md)
- bounded movable scene panels in [docs/plan-movable-components.md](./docs/plan-movable-components.md)
- presentation variants and runtime bindings in [docs/plan-presentation-variants.md](./docs/plan-presentation-variants.md)
- source-bound embedded-surface input sinks in [docs/plan-embedded-surface-input.md](./docs/plan-embedded-surface-input.md)

## Documentation

- [docs/architecture.md](./docs/architecture.md): contributor-facing architectural contract and package boundaries
- [docs/features.md](./docs/features.md): shipped feature inventory and roadmap links
- [docs/usage.md](./docs/usage.md): integration patterns and code examples
- [docs/plan-browser-hosts.md](./docs/plan-browser-hosts.md): browser host roadmap
- [docs/plan-movable-components.md](./docs/plan-movable-components.md): shipped surface-local windows and host-side movable panel roadmap
- [docs/plan-panel-coordination.md](./docs/plan-panel-coordination.md): shipped panel coordination notes and future policy roadmap
- [docs/plan-presentation-variants.md](./docs/plan-presentation-variants.md): presentation-variant roadmap
- [docs/plan-embedded-surface-input.md](./docs/plan-embedded-surface-input.md): advanced embedded-surface input roadmap

## Development

- `npm test` runs the Vitest suite
- `npm run build` builds `dist/`
- `npm run typecheck` runs TypeScript without emitting
- `npm run example:build` builds the Three.js example app
- `npm run example:living-room` runs the Three.js example app

## CI, Pages, And Release Automation

The repo includes three GitHub Actions workflows:

- `.github/workflows/ci.yml`
  Runs a matrix of Node and Three.js versions, including the declared minimum supported Three.js version.
- `.github/workflows/deploy-github-pages.yml`
  Builds `examples/three-living-room` and deploys it to GitHub Pages from `main` or a manual dispatch.
- `.github/workflows/release.yml`
  Publishes to npm from pushed `v*` tags after running typecheck, tests, and build.

The Pages workflow expects Repository settings -> Pages -> Build and deployment -> Source to be set to GitHub Actions.

The release workflow is designed for npm trusted publishing via GitHub Actions OIDC rather than a long-lived npm token.

Release setup:

1. Configure the package's trusted publisher on npm for this repository and the `release.yml` workflow.
2. Optionally protect the `npm` GitHub environment with reviewer approval.
3. Push a version tag such as `v0.1.0` or `v0.2.0-dev.0`.

Dist-tag behavior:

- stable versions publish to npm `latest`
- prerelease versions publish to a tag derived from the prerelease label
- for example, `0.2.0-dev.0` publishes with npm tag `dev`

## Status

`touch-os` is aimed at reusable shared-surface UI, not at replacing the DOM or becoming a general-purpose web framework. The current release focuses on a stable headless runtime and a solid Three.js hosting story first, with browser hosts and higher-level orchestration features tracked as explicit follow-on plans.
