# Plan: Movable Components / Windows

## Goal

Add a generic concept of movable XR/UI windows without turning `touch-os` into a Quest-specific shell clone.

The immediate target is a Quest-like drag affordance for things such as:

- the rear-view mirror on a HUD surface
- other widgets mounted within a larger display surface
- eventually, top-level scene panels such as a TV constrained to a wall surface

## Recommendation

The right abstraction is **movable windows**, not arbitrary movable components.

That distinction matters:

- components already participate in normal layout
- arbitrary component movement fights container rules
- a window is a higher-level composition unit with:
  - a rect
  - optional chrome
  - a drag affordance
  - z-order
  - constraint rules
  - optional persistence

So the generic rule should be:

- any component can be wrapped in a window
- windows can move within a bounded support surface
- the support surface defines the legal motion region

That gives us a reusable feature without teaching every leaf widget how to drag itself around.

## Review Of The Idea

I think the overall direction is good, but it should be split into phases.

What I agree with:

- a small contextual drag handle is a good XR pattern
- movement should be constrained within a known surface extent
- the same conceptual model should work for HUD surfaces and wall surfaces
- Phase 1 should stay 2D and predictable

What I would not combine into Phase 1:

- moving a window farther away from the user
- changing a window from flat to curved placement
- mixing 2D repositioning and 3D re-anchoring behind one gesture

Those are valid later ideas, but they are not the same interaction.

## Comparison To Quest-Style Best Practice

There does not appear to be a public Meta document that precisely specifies the small system drag bar behavior seen in Horizon OS windows. So this section is partly based on observed Quest UI behavior and partly on general XR interaction best practice.

The Quest-like pattern is good because:

- chrome stays quiet until the user shows intent
- drag happens through an explicit affordance rather than the whole content area
- content interaction and movement interaction stay separate
- windows remain visually stable and predictable while moving

That is a better default than:

- making the whole window draggable
- always showing a heavy title bar
- combining move, resize, and depth changes in the same gesture

For `touch-os`, the best analogue is:

- show a compact drag bar only when a window is hovered, focused, or already being dragged
- let the drag bar claim the pointer until release
- keep movement constrained to a support surface in Phase 1

## Fit With Current `touch-os` Architecture

This fits the spec well if we split the work across the right layers.

What belongs in runtime / containers:

- window rects in a 2D coordinate space
- window z-order
- drag-bar hit targets
- pointer capture during drag
- clamping within a provided 2D constraint rect
- optional emitted actions / change requests for persistence

What belongs in hosts:

- mapping a support surface into local 2D coordinates
- converting rays / contacts into that coordinate space
- turning a constrained 2D window rect into world placement when the whole panel is moving on a wall or other scene surface

What belongs in app code:

- which widgets should be windows
- which windows are movable
- whether positions persist across sessions
- what the valid support surfaces are

This is consistent with the current spec and repo boundaries:

- embedded surfaces are still normal components
- hosts already own placement and hit conversion
- pointer visuals are already decoupled from pointer logic

## Core Concepts

### 1. Window

A window is a container with:

- a child node
- a current rect
- optional title / drag chrome
- drag policy
- optional persistence identity

### 2. Support Surface

A support surface is the thing that constrains movement.

Examples:

- the HUD display surface
- a wall plane
- later, a curved dashboard surface

In Phase 1, the support surface should always provide a finite 2D bounds rect.

### 3. Constraint Rect

The constraint rect is the legal 2D region in which a window rect must remain fully contained.

Examples:

- HUD: the current display surface width and height
- wall: the usable wall-plane bounds supplied by the app or scene system

### 4. Drag Affordance Policy

This should be a policy, not a hard-coded visual law.

Recommended modes:

- `always`
- `hover`
- `focus`
- `dragging`

Quest-like behavior is closest to `hover | dragging`, with the important caveat that exact near-pointer reveal may need a later proximity model beyond normal hit testing.

## Proposed Architecture

### Phase 1 Core Runtime Feature

Add a new container primitive, tentatively:

- `createWindowLayer(...)`
- `createWindow(...)`

`WindowLayer` owns:

- a list of windows
- explicit child rects
- z-order
- drag capture
- clamp rules within its own display-space bounds

`Window` owns:

- child composition
- frame / optional title
- drag bar rendering
- hit regions for drag bar versus content

This phase is purely **surface-local**.

That means:

- the window moves within a runtime surface
- the host is unchanged
- the window rect is just display-space layout inside the surface

This is the cleanest fit for the HUD mirror case.

### Phase 1 Host Behavior

No new host abstraction is required for the first shipping version of HUD-local movement.

The host still renders a single surface.

The runtime simply lays out one or more movable windows inside that surface.

### Phase 1 Demo Target

Use the desktop HUD mirror as the first movable window.

Why this is the right first target:

- it already exists as an embedded surface component
- it already lives inside a larger HUD surface
- motion is naturally constrained by the HUD bounds
- no new scene-surface math is required

Important note:

the current HUD mirror is placed by `DockLayout`. A movable mirror should instead live in a window layer above or alongside the static HUD layout, not inside a dock slot that assumes fixed placement.

### Phase 1 Interaction Rules

Recommended rules:

- the drag bar is the only move handle
- pressing the drag bar captures the pointer until release
- while dragging, embedded content does not receive forwarded input
- bringing a window into drag also raises it to the front
- the window rect is clamped so it never leaves the support surface
- aspect ratio of embedded content is preserved inside the window as it already is today

### Phase 1 State Rules

Recommended default:

- live window rect is runtime-managed session state
- optional app persistence happens through explicit actions or change requests

That matches the current project rule that runtime state lives inside the runtime, while app state persistence stays outside.

## Phase 1.5: Movable Top-Level Panels On Flat Support Surfaces

After HUD-local windows work, add a host-side abstraction for moving an entire panel across a bounded flat support surface.

Examples:

- TV constrained within a wall
- utility panel constrained within a dashboard plane

This is conceptually similar to Phase 1, but the seam is different:

- the panel rect lives in support-surface coordinates
- the host converts that rect into world placement

Recommended host-side concept:

```ts
interface FlatSupportSurface {
  bounds: Rect;
  projectRay(origin: Vector3Like, direction: Vector3Like): { x: number; y: number } | undefined;
  resolvePanelPlacement(rect: Rect): ThreeStaticTransform;
}
```

This should live in `hosts/*`, not in core runtime.

For wall constraints, the app can supply the usable wall bounds directly. If scene understanding is available, it can derive those bounds from a plane model. Meta's MR Utility Kit exposes 2D plane bounds as min/max vectors, which is a good fit for this concept.

## Phase 2: Depth Movement For Head-Locked Or Pose-Anchored Windows

This should be treated as a separate feature, not an extension of the same drag gesture.

Why:

- 2D translation on a support surface is predictable
- depth changes alter scale, vergence, and comfort
- users can lose track of a window much more easily in 3D than in 2D

If we add this later, it should be an explicit reposition mode with a separate affordance.

Possible later concepts:

- a second handle for re-anchoring in depth
- snapping to preferred distances
- preserving angular size instead of preserving physical size

I would not attach this to the same small drag bar used for simple 2D moves.

## Phase 3: Rounded / Curved Support Surfaces

This is feasible, but only after flat-surface motion is stable.

The right generic model here is not "curved HUD magic." It is "support surfaces expose raycast and nearest-point queries."

That lines up with Meta's general `ISurface` pattern, which exposes both:

- `Raycast(...)`
- `ClosestSurfacePoint(...)`

Once a host support surface can provide those queries, curved placement becomes a host problem instead of a special case in core runtime.

But for Phase 1 and 1.5, I recommend:

- flat surfaces only
- rectangular bounds only
- no curved clamping yet

## Why This Sequencing Is Better

This sequencing keeps each step coherent:

1. Surface-local movable windows
2. Whole-panel motion on flat support surfaces
3. Explicit depth re-anchoring
4. Curved support surfaces

That is much lower risk than trying to ship:

- movable HUD widgets
- movable wall panels
- depth changes
- curved supports

all at once under a single "movable components" umbrella.

## Suggested Public API Direction

I would aim for something in this shape:

```ts
interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WindowProps {
  child: DisplayNode<unknown>;
  rect?: WindowRect;
  movable?: boolean;
  dragHandle?: "none" | "top" | "bottom";
  handleVisibility?: "always" | "hover" | "focus" | "dragging";
  persistenceKey?: string;
}

interface WindowLayerProps {
  windows: readonly DisplayNode<WindowProps>[];
  constraintPadding?: number;
}
```

The exact API can change, but the important thing is that:

- the core runtime deals in 2D rects
- hosts deal in support-surface projection and world placement

## Validation Criteria

Phase 1 should be considered successful when:

- the rear-view mirror can be moved around the HUD surface in desktop mode
- it cannot be dragged outside the HUD bounds
- the drag handle appears contextually and feels intentional
- dragging does not break mirror rendering
- dragging does not forward input into the embedded surface content
- normal controls outside the drag handle still work

Phase 1.5 should be considered successful when:

- a wall-mounted panel can move within the wall bounds
- it preserves orientation to the wall
- it cannot drift off the wall or beyond the bounded region

## Open Questions

- Should hover-only reveal be enough, or do we later need a true "pointer proximity" reveal zone?
- Should window positions persist automatically, or only when the app opts in?
- Do we want overlap and z-order immediately, or only a single movable window in the first implementation?
- Should a wall-constrained panel be implemented as a host-level movable panel first, or should we introduce a generic support-surface abstraction before any scene-panel move work?

## Sources

Project sources:

- `spec.md` sections on embedded surfaces, host patterns, and pointer presentation
- `examples/three-living-room/src/panel-ui.ts`
- `src/components/embedded-surface.ts`
- `src/hosts/three.ts`

External references:

- Meta `ISurface` reference:
  https://developers.meta.com/horizon/reference/unity/v69/interface_oculus_interaction_surfaces_i_surface/
- Meta MR Utility Kit `PlaneBoundsData` reference:
  https://developers.meta.com/horizon/reference/mruk/v69/struct_meta_x_r_m_r_utility_kit_data_plane_bounds_data
- Meta Passthrough Camera API overview:
  https://developers.meta.com/horizon/documentation/unity/unity-pca-overview/

The Meta references are most useful here for:

- support-surface thinking
- bounded plane extents
- keeping live viewports performant and comfortable

They do not, at least publicly, define the exact Horizon OS drag-bar window pattern, so the Quest-style affordance recommendation above is an informed product inference rather than a quoted platform requirement.
