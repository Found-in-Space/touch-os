# Plan: `touch-os` 0.3.0 Runtime And XR Host Hardening

## Status

Proposed release contract for the next stable minor release.

The target version is `@found-in-space/touch-os@0.3.0`. The current
`0.3.0-dev.0` package must not be treated as a release dependency by consumers.

Implementation of the corresponding SkyKit integration begins only after this
package has passed the release gates below and `0.3.0` is available from the
registry as an ordinary stable release.

## Goal

Make `touch-os` a dependable, domain-neutral virtual-device runtime for games,
XR, simulations, and 3D applications, with particular confidence in the Three.js
and XR host path used by SkyKit.

This release should:

- fix the correctness and lifecycle defects found in the 0.3 development audit;
- remove avoidable per-frame work from stable panel surfaces;
- make clipping, output routing, timing, and resource ownership predictable;
- tidy the public API while a pre-1.0 minor release can still make deliberate
  contract corrections;
- replace shallow command-routing tests with extensive behavioral, package, and
  rendered-output coverage;
- publish a real stable version that downstream projects can pin exactly.

## Release Principles

### 1. Correctness Before New Subsystems

`0.3.0` is a hardening release. It does not need to ship the planned browser
host, new presentation orchestration, or other unrelated feature plans.

Work is in scope when it improves an already shipped contract, fixes an audited
defect, removes accidental API, or materially strengthens verification.

### 2. Keep The Runtime Domain-Neutral

No SkyKit-, astronomy-, ship-, star-, or WebXR-session-specific concepts belong
in core. Fixes motivated by SkyKit must be expressed as generic runtime, host,
pointer, surface, or output contracts.

### 3. Make Breaking Corrections Deliberately

`0.3.0` may correct pre-1.0 API semantics where the existing behavior is unsafe
or contradicts the documentation. Every such correction must:

- be named in the release notes;
- have a before/after migration example;
- be covered through the built package, not only through source imports;
- avoid compatibility aliases unless they provide a clear, time-bounded
  migration path.

Prefer additive changes and corrected semantics over renaming public symbols
without a concrete benefit.

### 4. One Behavior Across Host Modes

The same-runtime and child-runtime app-shell modes must expose the same app-level
behavior unless an option explicitly requests otherwise. Likewise, direct host,
driver, and session lifecycle paths must agree about cancellation and cleanup.

## Required Runtime Changes

### 1. Reliable Service Invalidation

Mutable services must be able to notify a runtime that their state changed,
including when the service was supplied through `RuntimeOptions.services`.

The 0.3 contract must provide both:

- observable invalidation from the built-in mutable services; and
- explicit runtime invalidation methods for custom services that cannot expose
  a subscription.

Recommended public shape:

```ts
type RuntimeInvalidationKind = "layout" | "render";

interface RuntimeInvalidationSource {
  subscribeInvalidation(
    listener: (kind: RuntimeInvalidationKind) => void
  ): () => void;
}

interface DisplayRuntime {
  invalidateLayout(): void;
  invalidateRender(): void;
}
```

The exact placement of the shared subscription type may change during API
review, but the following behavior is required:

- injected theme, surface, navigation, scroll, focus, and bitmap services can
  invalidate the runtime;
- built-in service factories expose observable changes;
- the runtime unsubscribes on disposal;
- paint-only theme changes invalidate rendering;
- typography, control height, padding, spacing, and other geometry-affecting
  theme changes invalidate layout;
- no-op updates do not invalidate anything;
- custom services have a documented way to request layout or render work.

`createTouchAppRuntime` must use the same mechanism rather than injecting a
callback-less theme service and relying on root replacement to mask changes.

### 2. No-Op Surface And Root Updates

Repeatedly supplying identical state must be cheap.

Required behavior:

- `SurfaceService.update()` compares effective width, height, pixel density,
  orientation, and safe-area values before emitting;
- `DisplayRuntime.resize()` with identical effective metrics is a no-op;
- host updates with unchanged metrics do not force tree reconciliation,
  measurement, layout, render-command rebuilding, or texture upload;
- child-runtime app hosting does not call `resize()` or `setRoot()` when the
  effective surface and root descriptor are unchanged;
- child surfaces are republished only when their rendered content or effective
  dimensions change.

Tests must count component `update`, `measure`, `layout`, render revision,
shared-surface revision, canvas draw, and texture update behavior across repeated
identical frames.

### 3. Explicit Frame Timing

Time-dependent components must work through the documented host update loop.

`HostFrame` and `ThreePanelHostFrame` should carry a monotonic millisecond
timestamp. In 0.3, the field is required for hosts that drive runtime behavior:

```ts
interface HostFrame {
  timestamp: number;
  viewport: Rect;
  events?: readonly InputEvent[];
}

interface ThreePanelHostFrame {
  timestamp: number;
  // existing scene, camera, placement, surface, and event fields
}
```

The Three host/driver path must advance the runtime exactly once per update
before rendering completes. The contract must document milliseconds and
monotonicity explicitly.

Required coverage includes:

- long-press firing once after its configured delay;
- repeat-button catch-up across uneven frame intervals;
- no repeat after release, cancel, hide, detach, or tracking loss;
- repeated updates with the same timestamp producing no duplicate action;
- direct runtimes remaining manually tickable when no host owns their clock.

### 4. Pointer Source And Cancellation Semantics

`ThreePointerSource.sample()` is a continuous per-frame snapshot, not an
edge-only event queue. A source owns the pointer ids that it reports.

The driver must track active pointer ids per source. If an id that was active in
the previous sample is absent in the next sample, the driver must synthesize a
cancel using the latest known metadata and the current frame timestamp.

Cancellation is also required when:

- placement or anchor pose becomes unavailable;
- a panel becomes hidden or disabled;
- a session clears a pointer;
- a host or driver detaches;
- a host, driver, session, or runtime is disposed.

Cancellation must clear runtime capture, hover, press, presenter, coordinator,
and host bookkeeping consistently. It must not depend on another future frame.

For edge-oriented integrations, callers should use `frame.events` or a separate
explicit event-source contract rather than relying on omission from a continuous
pointer source.

### 5. Cancellation Outputs Must Be Delivered

Lifecycle cleanup can emit meaningful application output, such as the stop half
of a hold action. Those outputs must not remain silently queued or be discarded.

Required behavior:

- `ThreePanelSession.hide()`, disabled `update()`, `clearPointer()`, and
  `dispose()` flush cancellation outputs through the configured output handler;
- raw driver detach queues cancellation outputs before releasing host resources;
- the raw-driver documentation tells callers to drain runtime outputs after a
  lifecycle operation;
- runtime disposal does not become the first operation that erases an
  undelivered stop action.

Tests must assert complete start/stop sequences at the output handler, not only
internal pointer state.

### 6. Correct Pointer Event Metadata

Pointer display events must preserve the current input identity and metadata.

Required behavior:

- hover, enter, move, scroll, down, up, leave, and cancel retain the incoming
  pointer id and pointer type;
- pressure and modifiers update from the current event rather than remaining
  frozen at pointer-down;
- multiple ray, controller, touch, mouse, and stylus pointers remain distinct;
- synthetic cancellation uses the last known metadata for that pointer.

## Required App And Output Changes

### 1. One Default App Output Path

The documented app-shell contract is authoritative:

- app code communicates outward through `ctx.actions.emit(...)`;
- hosts receive one scoped `app-event` by default;
- raw component outputs are visible only when forwarding is explicitly enabled.

Same-runtime and child-runtime hosting must therefore behave identically.

In particular, a same-runtime child action must not remain as a top-level raw
`action` while also causing an `app-event` when `forwardAppOutputs` is false.

`forwardAppOutputs: true` may expose both the app-level event and scoped raw
outputs, because that duplication is then explicitly requested. Documentation
must warn output routers not to execute both as the same application intent.

Coverage must include:

- one button press producing exactly one default app event;
- field changes producing one `app-change`;
- action buttons producing one `app-action`;
- same-runtime and child-runtime output parity;
- explicit raw forwarding with stable, scoped component ids;
- nested app shells and multiple app instances.

### 2. App Hosting Reconciliation

App hosting must not recreate work merely because a shell renders.

Required behavior:

- root synchronization compares descriptor identity or an explicit revision;
- child runtimes are resized only when their effective surface changes;
- child snapshots are published only when content or dimensions change;
- output routing is independent from whether a child needed a visual update.

## Required Coordination Changes

### 1. Ownership Begins On Successful Press

Panel ownership is retained only when a panel claims a `down` sample. Hover,
move, and scroll may be claimed or blocked for that routing step, but must not
create retained ownership.

An existing owner retains the pointer until up, cancel, explicit clear, disable,
or removal.

### 2. Clarify Routing Result Names

The current `ownerKey` field conflates the panel that handled one sample with a
panel that owns an active press. The 0.3 result should distinguish them:

```ts
interface PointerRoutingResult {
  panelKey: string | undefined;
  ownerKey: string | undefined;
  claimed: boolean;
  blocked: boolean;
}
```

`panelKey` identifies the panel selected for this routing step. `ownerKey`
identifies retained press ownership after the step.

The migration note must call out the corrected meaning of `ownerKey`.

Required tests include hover fallthrough, scroll routing, press ownership,
movement outside the owner, release, cancel, disable, removal, and independent
multi-pointer ownership.

## Required Rendering Changes

### 1. Empty Clips Stay Empty

The runtime must distinguish:

- no inherited clip;
- a non-empty clip rectangle; and
- an empty intersection.

A subtree under an empty intersection must neither emit draw commands nor
participate in hit testing. This can use an internal sentinel or explicit
intersection result; it must not overload `undefined` for two meanings.

Coverage must include multiple nested, partially overlapping, edge-touching,
and fully disjoint clips for both rendering and input.

### 2. Composite Surfaces Obey Clips

Three composite placements must carry the visible panel rectangle and matching
texture crop/UV information after all inherited and local clips are applied.

The built-in presenter must:

- crop geometry and UVs to the visible rectangle;
- preserve mirroring and aspect behavior;
- update nested-runtime and transformed clip coordinates correctly;
- hide fully clipped surfaces;
- dispose and remove presenters that are no longer represented by an active
  command rather than retaining an unbounded hidden cache.

The documented rule that every draw-command type obeys `clipRect` remains the
contract.

### 3. Predictable Three.js UI Material Defaults

The normal canvas panel and composite surface must use consistent UI-oriented
defaults.

Required defaults:

- transparent UI does not write depth;
- UI textures are not scene tone-mapped unless the caller explicitly opts in;
- color-space handling is consistent between the main canvas and composites;
- material options remain overrideable by the host application.

The host must expose a persistent texture-quality policy, at minimum for
anisotropy, that is reapplied whenever resize replaces the `CanvasTexture`.
Callers must not have to mutate one transient texture instance and lose the
configuration later.

### 4. Surface Metrics Are Stable And Explicit

If `ThreePanelHostOptions.surface` is omitted, the host must start from the
runtime's current surface metrics rather than silently resetting it to 320x240.

Any effective logical-metric change must update renderer transforms and source
dimensions even when the backing pixel width and height happen to remain the
same. The canvas itself need only be recreated when its backing dimensions
change.

Default orientation must be derived from the effective default width and height,
so an empty `createSurfaceService()` starts as landscape 320x240 rather than
square.

### 5. Typography Must Match The Public Theme

`ThemeTypography.fontFamily` must reach text draw commands and the Canvas
renderer. A public token must not be silently ignored.

Text overflow must not use Canvas `fillText(..., maxWidth)` in a way that
horizontally distorts glyphs. The 0.3 renderer should use explicit clipping or
ellipsis behavior and real text measurement. The chosen default and any new
`TextDrawCommand` fields must be documented and tested.

### 6. Bitmap Reallocation Advances Revision

Allocating an existing bitmap id without an explicit revision must advance from
the existing revision. Replacing a same-sized image must therefore change the
render signature and repaint.

## Host Lifecycle And Resource Ownership

The public host lifecycle must distinguish reversible detachment from final
disposal.

Recommended contract:

```ts
interface HostAdapter<TFrame> {
  attach(): void;
  update(frame: TFrame): void;
  detach(): void;
  dispose?(): void;
}
```

For Three hosts and drivers, `dispose()` should be required on the specialized
interface.

Semantics:

- `attach()` followed by `detach()` may be repeated;
- `detach()` clears interaction and removes scene attachment without destroying
  resources required for a later attach;
- `dispose()` is idempotent, cancels interaction, removes scene objects, and
  releases owned geometry, material, texture, and composite presenters;
- supplied resources are borrowed unless transfer of ownership is an explicit
  option;
- no update or attach succeeds silently after final disposal.

Lifecycle tests must cover attach/detach/reattach, detach while pressed, repeated
dispose, and ownership of caller-supplied resources.

## Public API Cleanup

Before freezing 0.3.0, audit every root and subpath export.

Required cleanup:

- retain named exports and ESM-only output;
- ensure every documented API is available from an explicit package entrypoint;
- remove the orphan `src/app-shell/app-shell.ts` re-export or make its role
  explicit without creating a duplicate public path;
- remove unused imports, locals, generic parameters, and dead schema-adapter
  invalidation plumbing;
- remove unused public Canvas contracts or make them part of the real renderer
  implementation;
- keep reference fixtures as source conformance fixtures but exclude accidental,
  unreachable example output from the published `dist` tree;
- test every export-map entry through Node's package resolution and TypeScript's
  declaration resolution;
- document all intentional 0.2-to-0.3 contract changes in one migration section.

Enable unused-local and unused-parameter diagnostics in the normal verification
path. Intentional unused parameters should use the conventional underscore form.

## Required Test Strategy

### 1. Core Behavioral Tests

Add deterministic unit tests for:

- component mount, update, reconciliation, layout, render, suspend, resume, and
  disposal;
- nested clipping and clipped hit testing;
- service invalidation and no-op updates;
- pointer identity, metadata, capture, drag, long-press, and cancellation;
- focus, navigation, scroll, paging, and emitted actions;
- same-runtime and child-runtime app output parity;
- bitmap and embedded-surface revisions;
- every reference fixture in `src/examples/reference-fixtures.ts`.

### 2. Three Host And XR-Style Tests

Use mocked poses and rays to cover:

- scene, pose-anchored, and HUD placement;
- continuous XR pointer sampling;
- source disappearance, pose loss, session-style disable, detach, and disposal;
- one and multiple ray pointers;
- panel coordination and fallthrough;
- frame-driven long-press and repeat;
- no-op frames and texture-update counts;
- clipped composite geometry and UVs;
- material, color-space, and texture-policy defaults.

These tests must not require a headset or live WebXR environment.

### 3. Canvas Renderer Tests

Recorder-based tests must accurately model save/restore state and assert actual
coordinates, transforms, clips, font strings, alignment, and source rectangles.
They should be described as command-rendering tests, not pixel parity tests.

Pixel behavior belongs in browser tests using a real Canvas implementation.

### 4. Browser Render Tests

Run Playwright in CI against the real living-room example and focused rendering
fixtures.

Required cases:

- ordinary text and control states;
- DPR 1 and DPR 2 rendering;
- nested clipping and scrolling;
- bitmap contain/cover/stretch behavior;
- embedded copy and Three composite surfaces;
- transparent panel edges and depth ordering;
- stable frame capture for animated surfaces;
- resize with unchanged backing dimensions but changed logical metrics.

Tests should wait for an explicit render-ready revision rather than arbitrary
sleep. Correctness assertions must not be mixed with a wall-clock performance
limit. Performance budgets, if retained, belong in a separate non-flaky check.

### 5. Package Conformance Tests

Build and pack the package, install the tarball in a temporary ESM TypeScript
consumer, and verify:

- every declared export and declaration entrypoint resolves;
- no internal deep import is required by documented usage;
- `three` remains optional for non-Three entrypoints;
- root imports do not pull Three.js into core-only use;
- all documented usage snippets compile against the packed artifact.

### 6. Coverage Requirements

Add and configure the Vitest V8 coverage provider.

Minimum release thresholds:

- 90% lines, statements, and functions overall;
- 85% branches overall;
- 95% lines and 90% branches for core runtime, geometry/clipping, app output
  routing, panel coordination, and Three pointer lifecycle modules.

Coverage exclusions must be narrow and explained in configuration. Generated
declarations, build configuration, and intentionally browser-only example glue
may be excluded; public runtime modules may not.

## Documentation Requirements

Before release:

- update `README.md`, `docs/architecture.md`, `docs/features.md`,
  `docs/usage.md`, `docs/rendering.md`, and relevant shipped plan statuses;
- add a 0.2-to-0.3 migration section;
- document timing ownership, continuous pointer-source semantics, lifecycle,
  output forwarding, custom service invalidation, surface-metric precedence,
  texture quality, and composite clipping;
- ensure every supported usage example compiles as a conformance fixture;
- clearly distinguish shipped 0.3 behavior from later plans.

## Release Verification

The repository should expose one release verification command that CI and the
tag workflow both run. It must include at least:

```txt
strict typecheck including unused diagnostics
unit tests with coverage thresholds
package build
packed-package ESM and declaration smoke tests
living-room/example build
Playwright rendering tests
production dependency audit
```

The release workflow must not publish if browser rendering or package
conformance has been skipped.

The Node and supported Three.js version matrix remains required. Development
tooling must be updated so the release has no known high or critical audit issue
in the tools exercised by the repository; shipped runtime dependencies must
remain clean.

## Implementation Phases

### Phase 1: Contract And Regression Tests

- land failing tests for every confirmed defect;
- finalize the small 0.3 API corrections above;
- write the migration skeleton before changing behavior.

### Phase 2: Core Runtime And App Outputs

- fix service invalidation and no-op updates;
- fix clip semantics and pointer metadata;
- make app output behavior identical across host modes;
- correct coordinator ownership.

### Phase 3: Host Lifecycle And Three Rendering

- add frame timing and missing-pointer cancellation;
- make cleanup outputs observable;
- implement reversible detach and final disposal;
- fix metrics, material defaults, composite clipping, presenter cleanup, and
  persistent texture quality.

### Phase 4: Renderer And API Cleanup

- honor typography and correct text overflow;
- fix bitmap revisions and default orientation;
- remove dead code and accidental build output;
- freeze and test the export map.

### Phase 5: Verification And Stable Release

- enable coverage and browser CI;
- validate all conformance fixtures and documented usage;
- run the packed-consumer test;
- update release notes and version to `0.3.0`;
- run the full release command from a clean checkout;
- tag `v0.3.0` and confirm the registry package can be installed by exact
  version before beginning the SkyKit migration.

## Non-Goals

This release does not need to:

- add astronomy or SkyKit concepts;
- ship the planned canonical browser host;
- add new application frameworks or component families without an audited need;
- provide real-headset automation in this repository;
- preserve undocumented defects merely because existing tests encode them;
- require SkyKit source aliases or a sibling checkout to verify the package.

## Definition Of Done

`@found-in-space/touch-os@0.3.0` is ready only when:

- all required behavior above is implemented and documented;
- each audited defect has a regression test;
- coverage thresholds pass;
- real Canvas/Three rendering tests run in CI and release;
- same-runtime and child-runtime app outputs agree;
- tracking loss and lifecycle cleanup cannot leave a held action active;
- identical host frames do not repeat layout or rendering work;
- nested and composite clipping are correct for render and input;
- the packed artifact and every public entrypoint pass consumer tests;
- the stable package is published and installable by exact version;
- the follow-on SkyKit plan can depend only on public 0.3 APIs.
