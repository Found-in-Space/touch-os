# Plan: Browser Hosts

## Goal

Provide a first-class browser hosting story for `touch-os` so the same component trees can run in browser-based products without requiring a 3D scene host or a separate DOM-authored UI implementation.

## Recommendation

The canonical browser story should be a **canvas-backed browser host**.

That should be the default because it preserves the core `touch-os` model:

- one shared display surface
- one component contract
- one layout system
- one normalized event model

A DOM-backed host may still be valuable, but it should be treated as an optional secondary adapter for cases that explicitly need browser-native semantics. It should not become the primary authoring model for `touch-os`.

## Why This Feature Exists

Many applications need to run virtual-device UI in ordinary browser contexts:

- desktop web pages
- fullscreen web viewers
- browser-based simulators
- browser tooling and diagnostics
- non-immersive versions of immersive products

Without a browser host, adopters are pushed toward one of two undesirable outcomes:

- duplicate the UI in HTML/CSS/DOM for browser use
- route browser use through a scene-specific host even when no scene host is otherwise needed

Neither outcome fits the project goal of authoring reusable virtual-device UI once.

## Core Principles

### 1. One Authoring Model

Browser use should consume the same `touch-os` component trees and runtime contracts used elsewhere.

The browser host must adapt the environment to the runtime. The runtime must not become browser- or DOM-specific.

### 2. Browser Events Stop At The Host Boundary

Components must never receive raw DOM events.

The browser host is responsible for translating native browser input into normalized runtime events.

### 3. Browser Rendering Should Stay Surface-Oriented

The primary browser host should render a `touch-os` surface, not reconstruct the UI as independent DOM controls.

That preserves portability across:

- browser canvas
- texture-backed scene panels
- XR-attached utility surfaces
- other future hosts

## Required Feature Set

### 1. Canonical Canvas-Backed Browser Host

The package should ship a browser host that:

- attaches to a browser element or supplied canvas
- renders a runtime snapshot into a 2D canvas-backed surface
- supports transparent backgrounds
- tracks width, height, pixel density, and safe-area-like insets
- updates runtime surface metrics when the host surface changes size

This host should work for:

- inline embedded canvases
- fullscreen browser views
- overlay-style browser surfaces
- reusable browser tooling surfaces

### 2. Explicit Resize Ownership

The browser host should support both:

- automatic surface sizing from an attached element
- explicit sizing provided by the application

Applications must be able to choose whether the host:

- owns measurement and resize observation
- follows externally supplied metrics

### 3. Normalized Pointer And Scroll Input

The browser host must translate browser-native input into runtime input consistently.

Required minimum input support:

- pointer enter, move, leave
- pointer down and up
- cancel on lost interaction state
- wheel or scroll gestures
- multi-pointer identity where the browser platform provides it

Important behavioral requirements:

- pointer capture rules must preserve runtime drag and press continuity
- browser blur or host detachment must clear active interaction safely
- browser hover must not leak raw DOM event semantics into components
- touch and pointer defaults must be controlled so the surface can remain interactive without accidental browser gestures

### 4. Render Scheduling

The browser host should not redraw blindly on every animation frame by default.

It must support a scheduling model driven by runtime invalidation and host updates.

The host should be able to redraw when:

- layout becomes dirty
- render becomes dirty
- surface metrics change
- input causes visible interaction changes
- the application explicitly ticks the runtime

An always-redraw mode may exist for diagnostics or continuous animation, but it should not be the default requirement for ordinary browser use.

### 5. Browser-Safe Text And Raster Rendering

The browser host must correctly render the runtime draw model in normal browsers, including:

- vector shapes
- text
- bitmap-backed components
- embedded-surface composition where supported

If some embedded-surface composition strategies are not available in the browser host, the host must document the limitation explicitly rather than silently changing component semantics.

### 6. Optional DOM-Backed Host

If a DOM-backed host is added, it must be positioned as an optional adapter.

Its role should be:

- provide browser-native semantics where that is an explicit product requirement
- map the same runtime and component model into DOM output as faithfully as practical

Its role should not be:

- replace the primary `touch-os` authoring model
- introduce DOM-only component contracts
- require separate DOM-oriented component implementations

## Proposed Package Shape

Recommended public shape:

- `@foundinspace/touch-os/hosts/browser`
- optional `@foundinspace/touch-os/hosts/dom`

Recommended primary factory:

```ts
interface BrowserCanvasHostOptions {
  runtime: DisplayRuntime;
  container?: HTMLElement;
  canvas?: HTMLCanvasElement;
  autoResize?: boolean;
  metrics?: Partial<SurfaceMetrics>;
}

interface BrowserCanvasHost {
  attach(): void;
  update(metrics?: Partial<SurfaceMetrics>): void;
  detach(): void;
  render(): void;
}
```

The exact names may change, but the canonical browser story should remain obvious from the public surface.

## Non-Goals

This feature should not:

- turn `touch-os` into a DOM-first UI framework
- require CSS layout to define component layout behavior
- expose browser event objects to components
- force browser products to rebuild `touch-os` surfaces as HTML widgets

## Testing Requirements

The browser host should have dedicated tests for:

- resize-driven surface metric updates
- pointer event translation
- scroll event translation
- pointer capture and cancel behavior
- detach/blur cleanup
- redraw scheduling
- transparent background behavior

If a DOM-backed host exists, it should be tested separately from the canonical canvas-backed host.

## Phasing

### Phase 1

Ship a canvas-backed browser host with:

- attach and detach
- auto or explicit resize
- pointer and scroll translation
- transparent rendering
- runtime-driven redraw

### Phase 2

Add browser-specific refinement such as:

- improved accessibility hooks
- richer scheduling options
- stronger embedded-surface composition support

### Phase 3

Evaluate whether an optional DOM-backed host is justified by concrete product requirements.
