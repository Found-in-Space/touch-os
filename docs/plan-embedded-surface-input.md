# Plan: Embedded Surface Input Sinks

## Goal

Add an optional source-bound input model for embedded surfaces without breaking the current presentation-scoped forwarding path.

## Recommendation

Keep the current attachment-scoped forwarding behavior as the default.

Add source-level input sinks as an explicit opt-in layer keyed by `sourceId`, so applications that own a live surface can receive forwarded input at the source boundary when that is the right integration seam.

## Why This Feature Exists

The current embedded-surface model already works well for:

- view-only mirrors
- shell-owned dismiss or framing controls
- forwarding input into one mounted presentation

But some integrations need a stronger source-level boundary:

- one published source may appear in more than one presentation
- the source owner may want input independent of one component instance
- a streamed or remote surface may already have its own input consumer
- one presentation may be interactive while another is mirror-only

Without a source-bound seam, applications have to infer source intent by reading per-component forwarded event logs and rebuilding their own routing policy above that.

## Core Principles

### 1. Presentation-Scoped Forwarding Remains The Default

Today's component-scoped forwarding is still the right default for simple mirrors, camera panels, and shell-plus-viewport widgets.

This feature should extend that model, not replace it.

### 2. Source Identity And Presentation Identity Stay Separate

An embedded surface component is a presentation of a source, not the source itself.

The API should preserve:

- one source used by multiple components
- component rebinding from one source to another
- source publication before any component mounts

### 3. Source-Level Input Must Be Explicit

Routing input into a source sink should be opt-in and obvious from the public contract.

The runtime should not silently infer that a source wants forwarded input just because a source is available.

### 4. Runtime Ownership Still Stops At The Host Boundary

The runtime and host still own:

- hit testing
- pointer continuity
- normalized event generation
- claim and blocking rules

Source sinks should consume already-normalized events rather than host-native events.

### 5. Unpublish And Detach Must Stay Safe

Source-level sinks must fail predictably when:

- a source is unpublished
- a component is detached
- the presentation becomes non-interactive
- a pointer is cancelled or forcibly cleared

## Required Feature Set

### 1. Source Sink Registration

Applications should be able to register an input sink for a published `sourceId`.

Recommended behavior:

- registration is explicit and reversible
- multiple source sinks are not merged implicitly
- missing sinks are handled as "no source consumer"

### 2. Explicit Forwarding Mode

The embedded-surface contract should make the forwarding target explicit.

A likely additive shape is:

```ts
type ForwardedInputTarget =
  | "presentation"
  | "source"
  | "both";
```

The current attachment-scoped behavior maps to `"presentation"`.

### 3. Multi-Presentation Semantics

When more than one presentation references one source, the service must define:

- whether all interactive presentations may forward to the same source sink
- how the source sink knows which presentation produced an event
- how mirror-only or disabled presentations are excluded

At minimum, forwarded source events should include:

- `componentId`
- `sourceId`
- normalized runtime event payload

### 4. Diagnostics And Inspection

The current service is testable because attachment state is inspectable.

Source-level forwarding should preserve that quality with:

- source-level inspection
- explicit sink registration state
- predictable behavior in tests without a live renderer

### 5. Compatibility With Composite Surfaces

This feature must work for both:

- copied surfaces inside the shared raster path
- host-composited surfaces presented alongside the shared raster

The forwarding model should not depend on one composition strategy only.

## Suggested Public Shape

Illustrative additive contracts:

```ts
interface EmbeddedSurfaceSourceInputEvent {
  sourceId: string;
  componentId: string;
  event: DisplayEvent;
}

interface EmbeddedSurfaceInputSink {
  handleEvent(event: EmbeddedSurfaceSourceInputEvent): void;
}

interface EmbeddedSurfaceService {
  registerInputSink(sourceId: string, sink: EmbeddedSurfaceInputSink): () => void;
}
```

One likely component-side addition is:

```ts
interface EmbeddedSurfaceProps {
  acceptsForwardedInput?: boolean;
  forwardedInputTarget?: "presentation" | "source" | "both";
}
```

The exact names can change, but the public contract should stay explicit about:

- whether input forwarding is enabled
- where forwarded input goes
- how the source learns which presentation produced the event

## Non-Goals

This feature should not:

- move raw host events into the embedded surface API
- make source sinks mandatory for ordinary embedded surfaces
- collapse multiple presentations into one shared runtime state bucket
- redefine pointer claim or blocking rules outside the existing runtime and host boundaries

## Testing Requirements

This feature should include tests for:

- forwarding to a registered source sink
- preserving current attachment-scoped forwarding behavior
- routing metadata when multiple presentations share one source
- disabling forwarding cleanly when a component becomes non-interactive
- safe cleanup on source unpublish, component dispose, and cancel

## Phasing

### Phase 1

Ship explicit source sink registration plus a source-forwarding mode.

### Phase 2

Add richer metadata and multi-presentation coordination rules.

### Phase 3

Evaluate whether source-level gesture helpers or source-owned interaction policies are justified by real adopters.
