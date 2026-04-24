# Plan: Embedded Surface Sources

## Goal

Define a public, reusable way to publish externally rendered or streamed content into embedded-surface components without forcing applications to mutate low-level service state directly.

## Recommendation

`touch-os` should add a source-oriented publication layer above the embedded-surface service.

That layer should make source identity, lifecycle, metadata, and frame publication explicit.

## Why This Feature Exists

Embedded surfaces are a core part of the `touch-os` model:

- live camera feeds
- monitor viewports
- remote streams
- externally rendered utility views

The component contract for embedded surfaces is already generic, but applications still need a clean way to publish live source data into that contract.

Without a public publication layer, applications end up:

- mutating low-level service state directly
- inventing ad hoc source registries
- tying publication logic to individual component instances

That is unnecessary glue for a generic feature.

## Core Principles

### 1. Source Identity Must Be Separate From Component Identity

An embedded surface component references a source. It should not be the source.

This distinction matters because:

- multiple components may present the same source
- one source may outlive one component instance
- one component may rebind to a different source over time

### 2. Publication Is Host-Or Integration-Layer Work

The runtime should not own external rendering pipelines.

Applications or host integrations should publish source frames and metadata through a clear public interface.

### 3. The Component Contract Stays Stable

Adding a source publication layer must not change the component-facing meaning of embedded surfaces.

The component should still own:

- shell chrome
- layout
- local hit regions
- forwarding policy

The publication layer should own:

- source lifecycle
- frame availability
- opaque handles
- source metadata

## Required Feature Set

### 1. Source Registry

The package should expose a source registry or equivalent publisher abstraction keyed by explicit source identifiers.

That registry must support:

- source creation or registration
- source updates
- source removal or unpublish

### 2. Opaque Handle Publication

The publication API must allow host integrations to publish opaque source handles without forcing one graphics implementation.

Examples of valid published handles may include:

- canvas-like images
- video-like frames
- texture references
- other host-defined source handles

The runtime should treat the handle as opaque.

### 3. Metadata Publication

The publication API must support source metadata updates, including:

- availability
- width and height
- aspect ratio
- refresh state
- latency
- last frame time
- optional source type hints

This metadata should be publishable independently from the opaque visual handle.

### 4. Shared Source Reuse

Multiple embedded-surface components should be able to reference the same published source identifier safely.

That allows:

- one live source appearing in more than one presentation
- a preview surface and a main surface sharing one source
- one source surviving component recreation

### 5. Explicit Lifecycle

The source publication layer must have predictable lifecycle semantics.

Required behaviors:

- publishing a source does not require a component instance to already exist
- unpublishing a source makes dependent surfaces unavailable cleanly
- replacing a source handle does not require rebinding component definitions

### 6. Optional Input Sink Routing

The publication layer should leave room for source-bound input routing.

If embedded-surface components forward viewport input, applications should have a clear path to associate those forwarded events with the relevant source identity.

This does not require a full input-routing system in the first phase, but the source model should not block that future addition.

## Suggested Public Shape

Illustrative API sketch:

```ts
interface EmbeddedSurfaceSourceUpdate {
  available?: boolean;
  handle?: unknown;
  width?: number;
  height?: number;
  aspectRatio?: number;
  latencyMs?: number;
  refreshState?: "idle" | "updating" | "stale";
  lastFrameTimestamp?: number;
  sourceType?: string;
}

interface EmbeddedSurfaceSourceRegistry {
  publish(sourceId: string, update: EmbeddedSurfaceSourceUpdate): void;
  unpublish(sourceId: string): void;
  get(sourceId: string): EmbeddedSurfaceSourceUpdate | undefined;
}
```

The concrete naming can vary, but the source-oriented publication model should be explicit and reusable.

## Non-Goals

This feature should not:

- require the runtime to own external renderers
- force one graphics backend
- make embedded surfaces component-instance-specific
- hide source lifecycle behind ad hoc service mutation

## Testing Requirements

This feature should include tests for:

- publishing before a component mounts
- multiple components referencing one source
- source replacement
- unpublish behavior
- metadata-only updates
- availability transitions

If source-bound input routing is added later, it should have its own dedicated tests.

## Phasing

### Phase 1

Ship a public source registry and publisher API for availability, handles, and metadata.

### Phase 2

Add conveniences for common publication cases such as:

- image-like sources
- canvas-like sources
- video-like sources

### Phase 3

Add optional source-bound input routing and diagnostics if real consumer needs justify it.
