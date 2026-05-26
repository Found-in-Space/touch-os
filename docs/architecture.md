# Architecture

This document is the contributor-facing architecture contract for `touch-os`.

It replaces the old monolithic spec with a smaller set of docs:

- this file for architecture and public boundaries
- [features.md](./features.md) for shipped capability inventory
- [usage.md](./usage.md) for supported integration patterns
- `plan-*` docs for features that are intentionally not shipped yet

## Purpose

`touch-os` is a reusable virtual-device UI runtime.

It must remain:

- domain-neutral
- host-neutral at the core runtime layer
- suitable for games, XR, simulations, and 3D tools
- usable without assuming astronomy, cockpit, or any other product domain

## Public Package Structure

The published surface is intentionally small and explicit:

- `@found-in-space/touch-os`
  Headless root entrypoint for the core runtime, built-in components, containers, services, and generic host contract types.
- `@found-in-space/touch-os/core`
  Runtime contracts, geometry, normalized events, draw commands, and `createRuntime`.
- `@found-in-space/touch-os/components`
  Built-in generic components.
- `@found-in-space/touch-os/containers`
  Built-in composition primitives.
- `@found-in-space/touch-os/services`
  Service contracts and default implementations.
- `@found-in-space/touch-os/coordination`
  Generic ordered panel routing, fallthrough, lower-priority clearing, and pointer-scoped ownership helpers.
- `@found-in-space/touch-os/hosts`
  Generic host contract types only.
- `@found-in-space/touch-os/hosts/three`
  Three.js-specific host adapters and pointer interop helpers.
- `@found-in-space/touch-os/adapters/schema`
  Optional declarative schema adapter.

The root package stays headless by design. Host-specific runtime code belongs behind explicit host subpaths.

## Layer Model

`touch-os` is organized into five layers.

### 1. Core Runtime

The runtime owns:

- the mounted component tree
- layout and content bounds
- hover, press, drag, focus, scroll, and tick-driven interaction state
- render snapshots expressed as draw commands
- emitted runtime outputs
- stable service injection for components

The runtime does not own:

- application business state
- domain logic
- scene placement
- DOM or XR event objects
- world-space math

### 2. Components

Components are reusable UI units described through an explicit lifecycle:

- `mount`
- `update`
- `measure`
- `layout`
- `render`
- `hitTest`
- `handleEvent`
- `dispose`

Components receive:

- immutable props for the current pass
- runtime services
- runtime interaction snapshot
- container constraints

Components may keep only local ephemeral state. They must communicate outward through emitted outputs such as actions, change requests, and navigation requests.

### 3. Containers

Containers are ordinary components whose job is composition rather than domain behavior.

Current built-in containers cover:

- linear layout
- overlay and stack layout
- page navigation
- scrolling
- docked edge layout
- grouped sections
- full-surface shells with fixed header/footer regions and a scrollable body

Containers may opt into full-bounds pointer opacity when an otherwise sparse surface should absorb input across its visible shell.

`createColumn` and `createRow` are intrinsic stacks. They should not be treated as responsive page scaffolds. Full-surface application pages should start with `createSurfaceShell` so variable content is clipped, scrollable, and sized from current surface metrics.

### 4. Services

Components depend on stable runtime services instead of host objects.

Current service areas are:

- layout inspection
- page navigation
- scrolling
- focus management
- theme tokens
- timing and tick behavior
- surface metrics
- runtime-managed bitmap assets
- embedded surface publication and attachment

The default service implementations are in-memory, side-effect free, and test-friendly.

### 5. Hosts

Hosts adapt an environment to the runtime. They provide:

- a display surface
- surface metrics
- normalized input injection
- attach, update, and detach lifecycle

Hosts may additionally provide:

- world or camera placement
- ray or contact projection
- foreign-surface composition
- pointer claim and blocking policy

The core runtime only understands display-space coordinates and normalized input events.

## State Ownership

State is intentionally split across three places.

### Application State

Owned by the app, outside the runtime.

Examples:

- domain models
- selected entities
- persisted settings
- routing outside the device surface
- data fetching and persistence

### Runtime State

Owned by the runtime.

Examples:

- hovered and pressed targets
- pointer continuity and drag state
- focus and scroll offsets
- measured bounds
- navigation history inside a page container

### Component-Local Ephemeral State

Owned by one component instance only.

Examples:

- hover and pressed styling flags
- temporary cached measurements
- derived view-only state that does not belong to the application model

## Rendering And Media Model

All ordinary components render into one shared display surface.

That shared surface is expressed through draw commands rather than host-native view objects. The runtime currently supports:

- vector and text commands
- bitmap commands for runtime-managed raster assets
- embedded-surface commands for externally owned live surfaces

Embedded surfaces stay part of the normal layout and interaction model, but their visual content comes from a host-facing service rather than from the shared raster path alone.

## Host Boundaries

Architectural rules for host code:

- host adapters must not define component semantics
- core modules must not depend on `three`, WebXR APIs, DOM event objects, or scene graph concepts
- host adapters may translate native input into normalized runtime input
- host adapters may expose higher-level helper contracts when those helpers stay host-scoped

The current Three.js package follows this boundary by keeping panel placement, raycasting, pointer sources, and panel interop in `@found-in-space/touch-os/hosts/three`.

## Declarative Schema Layer

The schema adapter is optional.

It exists for:

- generated UIs
- serialized surfaces
- full-document replacement
- patch-style external updates

It does not replace direct code-authored trees, and it does not introduce global registration or hidden component discovery.

## API Rules

Public API changes should preserve these rules:

- named exports only
- explicit entrypoints and subpath exports
- no required deep imports from internal files
- side-effect free, tree-shakeable modules
- TypeScript-first contracts with strict typing
- ESM-only distribution with compiled JavaScript and `.d.ts` files
- browser-safe runtime code in published modules

## Current Non-Goals

These are intentionally not shipped in the current release line:

- a browser or DOM-backed host
- bounded movable scene panels
- presentation variants and runtime-binding helpers
- source-bound embedded-surface input sinks

Those areas are tracked in:

- [plan-browser-hosts.md](./plan-browser-hosts.md)
- [plan-movable-components.md](./plan-movable-components.md)
- [plan-presentation-variants.md](./plan-presentation-variants.md)
- [plan-embedded-surface-input.md](./plan-embedded-surface-input.md)
