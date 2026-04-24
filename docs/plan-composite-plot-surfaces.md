# Plan: Composite Plot Surfaces

## Goal

Define a clear, generic `touch-os` story for high-frequency externally rendered plot-like surfaces that should appear inside panels or scene-mounted displays without forcing the runtime to own their graphics pipeline.

This plan also defines:

- the tests that should prove the host contract works
- a neutral example-room addition that demonstrates the pattern as a wall-mounted picture

## Recommendation

`touch-os` should support this use case through **embedded surfaces in composite mode**.

That is the right fit when the content is:

- externally rendered
- host-owned
- continuously or frequently updated
- potentially GPU-backed
- not naturally part of the shared 2D UI raster pipeline

This should remain distinct from the existing shared-surface bitmap path.

The decision rule should stay explicit:

- `bitmap` = runtime-owned raster content that still belongs to the shared UI surface
- `embedded surface` = externally owned surface, viewport, stream, or secondary render target
- `composite embedded surface` = externally owned surface that the host presents alongside the shared UI surface rather than copying into it

For the example room, the recommended reference content should be a **GPU shader picture** rather than an unspecified generic chart.

That gives the plan a concrete target while staying fully domain-neutral.

## Why This Feature Exists

Some useful panel contents are not ordinary controls and are also not best represented as a bitmap baked into the shared UI surface.

Examples:

- dense point plots
- scientific or diagnostic charts
- live telemetry views
- spectrum or waveform panels
- shader-driven digital art or analytical fields
- camera-relative or world-relative utility views
- externally rendered map or radar surfaces

These surfaces often need capabilities such as:

- a dedicated render loop or independent redraw cadence
- host-owned GPU resources
- high point or pixel density
- explicit aspect-ratio preservation
- optional input forwarding into the content region
- reuse across multiple presentations

Those needs make them different from:

- normal controls
- runtime-generated bitmaps
- camera mirrors that are view-only and already covered by the existing examples

## Core Principles

### 1. Keep The Bitmap Boundary Explicit

The spec already distinguishes runtime-managed bitmap content from foreign embedded surfaces.

That distinction should remain sharp.

Use the bitmap path when the runtime still conceptually owns the image as part of the shared panel surface.

Use embedded surfaces when the visual content is truly external and should be treated as an opaque surface contract.

### 2. Composite Is A Host Contract

`composite` should not be treated as a visual styling option on a component.

It is a statement about responsibility:

- the runtime still decides layout, bounds, focus rules, and hit policy
- the host decides how the foreign surface is finally presented

This is why composite mode belongs at the host boundary rather than inside ordinary component drawing.

### 3. Source Identity And Presentation Identity Must Stay Separate

One live plot source may appear in more than one place.

Examples:

- a hand-held panel
- a wall-mounted picture
- a reduced-status preview

The same source should be reusable across those presentations without making one component instance the source of truth.

### 4. Example Content Must Stay Domain-Neutral

The reference example should demonstrate:

- a live externally rendered plot surface
- panel or frame layout around it
- host extraction and composition behavior

It should not encode any astronomy-specific assumptions.

It should also be specific enough that implementers do not need to guess what kind of surface the plan has in mind.

## Required Feature Set

### 1. Documented Decision Rule For Plot Surfaces

The docs should describe when a plot-like display should use:

- a normal control
- a shared-surface bitmap
- an embedded surface in `copy` mode
- an embedded surface in `composite` mode

The most important rule is:

- if the plot is externally rendered and host-owned, it should not be forced through the bitmap path just because it is "a graph"

### 2. Stable Composite Surface Extraction Contract

The Three host should continue to expose composite embedded surfaces as host-consumable outputs rather than drawing them into the shared panel canvas.

That contract must preserve enough information for host-side composition:

- component identity
- opaque handle
- destination rect
- mirroring hint
- composition mode

If additional metadata is needed later, it should be added deliberately rather than inferred from the handle.

### 3. Explicit Aspect-Ratio Handling

Plot-like surfaces usually need a stable aspect ratio.

The contract should preserve:

- source aspect ratio metadata
- `preserveAspectRatio`
- centered contain behavior by default

This matters for:

- readable axes
- dense point distributions
- faithful geometry
- avoiding accidental stretch artifacts

### 4. Input Routing Rules

Some live plot surfaces are view-only.
Some need interaction.

The plan should keep both cases explicit.

Required supported modes:

- non-interactive wall display
- interactive panel display with forwarded viewport input
- split behavior where shell controls remain local but the viewport can accept forwarded events

### 5. Source Reuse Across Presentations

The architecture should allow the same external source to appear in more than one presentation.

This is especially useful for:

- a main wall picture and a smaller hand-held copy
- an active interactive panel and a passive monitor
- one live source reused across desktop and immersive presentations

This plan does not need to solve the full public source-registry story by itself, but it should remain compatible with [plan-embedded-surface-sources.md](./plan-embedded-surface-sources.md).

### 6. Example-Room Wall Picture

The example room should gain a second kind of embedded-surface example in addition to the mirror-style display:

- a wall-mounted picture frame or monitor
- non-interactive by default
- fixed aspect ratio
- backed by a live external plot surface

This should demonstrate that embedded surfaces are not limited to mirrors or camera feeds.

The picture should read like a neutral living-room art or display object rather than a debugging panel bolted onto the scene.

### 7. Recommended Reference Surface: GPU Shader Picture

The wall picture should not remain abstract in the plan.

The recommended reference content is:

- a continuously animated GPU fragment shader
- rendered into an external surface
- presented as a framed wall picture

Recommended first choice:

- a Julia-set or orbit-trap-style fractal shader

Why this is the strongest first example:

- it is fully GPU-rendered
- it has no asset dependencies
- it visibly benefits from continuous direct updates
- it is sensitive to aspect ratio and resolution
- it can later become interactive without changing its host contract
- it clearly demonstrates why preserving the foreign surface path matters

If the repo wants a less "fractal demo" aesthetic, acceptable alternatives are still shader-based, for example:

- a domain-warped contour field
- a reaction-diffusion style field
- a wave-interference or caustic-style field

The key requirement is not the exact look.

The key requirement is that the content is unmistakably:

- GPU-owned
- live
- high-frequency
- visually degraded if forced through the wrong composition path

## Proposed Example-Room Addition

### New Example Element

Add a wall-mounted picture surface to the living-room example.

Recommended characteristics:

- mounted on a wall that already has clean visual space
- framed like artwork or a flat display
- landscape aspect ratio
- subtle default chrome so the scene still feels like a room rather than a test harness

### Example Surface Behavior

The wall picture should be backed by a dedicated external shader surface.

Recommended first implementation:

- one secondary or offscreen GPU renderer
- one full-frame quad
- one animated fragment shader
- one published embedded-surface handle

Recommended shader uniforms or controls:

- `time`
- `resolution`
- `aspectRatio`
- one or more visual parameters such as zoom, center, palette phase, or warp strength

The first wall-picture presentation should remain non-interactive.

However, the same underlying source should be able to support a later interactive panel variant with capabilities such as:

- pan
- zoom
- parameter adjustments
- palette or mode switching

The surface should be:

- externally rendered
- continuously refreshed
- published through the embedded-surface service
- configured as non-interactive in the wall picture presentation

### Why This Example Matters

This example would prove that the composite embedded-surface story works for:

- neutral room displays
- scene-mounted picture-like panels
- non-mirror content
- live shader graphics that are not normal controls

That is a much closer representative for analytical or scientific panel content than the current rear-view mirror example alone.

It would also prove something the mirror example does not:

- the external surface can have its own native animation cadence
- the external surface can be fully GPU-native rather than image-copy-oriented
- the content can justify composite presentation on its own merits

## Testing Requirements

The tests should stay fully generic and should not depend on any downstream plotting or rendering library.

Use mocked external handles and neutral "live plot" terminology.

For example-room and example-surface tests, use neutral "shader picture" terminology.

### 1. Runtime-Level Embedded Surface Contract

Add or extend tests to verify that an embedded surface configured as a plot surface:

- attaches with the expected config
- preserves `compositionMode`
- preserves `preserveAspectRatio`
- preserves interactivity flags
- emits a `surface` draw command with the correct metadata

This belongs in the existing embedded-surface test area.

### 2. Three Host Composite Extraction Test

Add a host test that mounts an embedded surface with:

- `compositionMode: "composite"`
- a mock external handle
- source dimensions representing a shader picture surface

The test should verify that:

- the surface appears in `getCompositeSurfaces()`
- the command still carries the opaque handle
- the shared panel canvas does not draw the surface directly

This is the most important generic test for the composite contract.

### 2a. External Render Handle Test

Add a host test that uses a custom render handle rather than only an image-like handle.

That test should verify that:

- the opaque handle survives publication
- the host carries it through the surface command unchanged
- composite mode does not accidentally collapse it into shared-canvas raster drawing

This matters because the target example is explicitly GPU-backed rather than just an image copy.

### 3. Copy-Mode Regression Test

Add or keep a matching test that verifies `copy` mode still draws the same class of surface into the shared canvas.

This matters because the distinction between `copy` and `composite` is architectural, not cosmetic.

The tests should make that difference obvious.

### 4. Aspect-Ratio Test

Add a test that verifies a plot surface with source dimensions such as `1024x512` is letterboxed or pillarboxed correctly when `preserveAspectRatio` is enabled.

This should validate the destination rect used by the embedded-surface viewport rather than any domain-specific pixel content.

### 5. Input Policy Tests

Add tests for both of these cases:

- non-interactive wall picture does not claim or forward viewport input
- interactive panel plot forwards viewport input when configured to do so

This keeps the plan usable for both passive displays and active tools.

### 6. Shared-Source Reuse Test

Once the source-oriented publication work lands, add a test showing that one external plot source can back more than one embedded-surface presentation safely.

A good generic form is:

- one wall picture
- one panel preview

Both should remain correctly bound without duplicating source ownership semantics.

### 7. Example-Room Smoke Test

Add a lightweight example-level test that verifies the living-room scene can publish and present the wall picture surface without breaking existing room composition.

This does not need to validate the visual appearance of a real shader picture.

It only needs to prove that:

- the new surface is mounted
- the source can be published
- the example host can expose or draw it according to the configured composition mode

### 8. Independent Animation Cadence Test

Add a small example-level or host-level test that verifies the external shader picture can advance frames without requiring a semantic layout change in the surrounding `touch-os` runtime.

This should prove that:

- the shared UI surface can remain stable
- the external surface can still update
- the example does not accidentally depend on whole-runtime redraw churn just to animate the picture

## Non-Goals

This plan should not:

- move plotting logic into `touch-os`
- make the runtime responsible for external render loops
- collapse the bitmap and embedded-surface stories into one vague abstraction
- assume every graph or chart should use embedded surfaces
- introduce domain-specific example content

## Phasing

### Phase 1

Document the decision rule and land the generic host tests for composite plot surfaces.

This phase should establish:

- clear terminology
- a stable test target
- confidence that composite mode is a real host contract

### Phase 2

Add the wall-picture example-room surface using a shader-backed living picture source.

This phase should demonstrate:

- non-mirror embedded-surface usage
- scene-mounted picture-style presentation
- aspect-ratio-preserving external surface composition
- a clearly GPU-native live surface

### Phase 3

Integrate the source-oriented publication work so one live plot source can be reused across multiple presentations more cleanly.

This phase may also add:

- stronger diagnostics around source freshness
- conveniences for image-like and canvas-like plot sources
- richer host-side composition helpers where justified
