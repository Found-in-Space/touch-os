# Plan: Presentation Variants And Runtime Bindings

## Goal

Make it easy to present the same conceptual device through multiple presentation variants without forcing those variants to share one layout tree, one runtime instance, or one host path.

## Recommendation

`touch-os` should treat presentation variants as a first-class concept.

That means:

- variant selection is explicit
- each variant may have its own root tree, theme, surface metrics, and host
- shared application state remains outside the runtime
- runtime-local interaction state remains local to each variant

The library should also provide a small binding layer so applications do not need to hand-roll repetitive runtime synchronization code for every presentation.

## Why This Feature Exists

The same conceptual device often needs different presentations in different contexts:

- compact versus expanded layouts
- immersive versus non-immersive layouts
- utility-only versus full-control layouts
- mirrored versus interactive views
- fixed-surface versus camera-relative presentations

Those variants often share:

- external application state
- action semantics
- common data sources

But they should not be forced to share:

- focus state
- scroll state
- active pointer capture
- layout caches
- local ephemeral component state

## Core Principles

### 1. Shared Meaning, Separate Runtime State

Presentation variants may represent the same conceptual device, but each active variant should own its own runtime-local state.

### 2. Variant Selection Is Explicit

The application must decide which variant is active or visible.

The runtime should not infer variant choice from hidden host state.

### 3. Presentation Differences Are Normal

It must be valid for two variants to differ in:

- layout structure
- component selection
- host type
- theme
- surface metrics
- visibility policy
- interaction priority

## Required Feature Set

### 1. Explicit Variant Definition

Applications should be able to define a set of named presentation variants, where each variant can supply:

- a root factory
- theme overrides
- surface metric defaults
- host configuration
- activation policy

The variant model should be neutral about whether the differences are visual, behavioral, or host-related.

### 2. Separate Runtime Instances

Variants must be able to use separate runtime instances by default.

This is important because variant-local state should not bleed across hidden or inactive presentations.

Required separation includes:

- hover state
- pressed state
- focus
- navigation history
- scroll offset
- local ephemeral component state

### 3. Shared External State Binding

Applications should be able to bind a runtime or set of runtimes to external application state through a small reusable helper.

That binding should support:

- creating a root from an external snapshot
- updating the root when relevant external state changes
- applying theme or surface changes from the same snapshot
- controlling when inactive variants are refreshed

### 4. Active, Inactive, And Mirror-Only Variants

The system should support at least three operational modes for a variant:

- active and interactive
- visible but not interactive
- inactive and detached or suspended

This matters because some applications need:

- one live interactive presentation
- one secondary preview
- one cached but currently inactive presentation

### 5. Safe Variant Switching

Switching or hiding a variant must safely clear or suspend runtime-local interaction state.

Required behaviors:

- active pointer capture must not leak into a hidden variant
- hidden variants must not continue claiming input
- focus may be preserved only if the application opts in explicitly
- suspended variants must not continue processing host events

### 6. Predictable Update Rules

The binding layer must make update rules explicit.

Applications should be able to choose whether a variant:

- refreshes on every external state change
- refreshes only when selected fields change
- refreshes only while active
- refreshes on demand

The library should not require applications to implement their own diffing and root replacement strategy for every use case.

## Proposed Public Shape

Recommended high-level concepts:

- `PresentationVariant`
- `PresentationBinding`
- `PresentationSet`

Illustrative API sketch:

```ts
interface PresentationVariant<TState> {
  key: string;
  createRoot(state: TState): DisplayNode;
  theme?: Partial<ThemeTokens> | ((state: TState) => Partial<ThemeTokens>);
  surface?: Partial<SurfaceMetrics> | ((state: TState) => Partial<SurfaceMetrics>);
}

interface PresentationBinding<TState> {
  runtime: DisplayRuntime;
  sync(state: TState): void;
  activate(): void;
  deactivate(): void;
  dispose(): void;
}
```

The exact public API can vary, but `touch-os` should ship an explicit, reusable answer to this problem rather than leaving every consumer to rebuild the same binding layer.

## Non-Goals

This feature should not:

- force all variants to share one runtime instance
- make one variant the source of truth for another variant's runtime state
- assume a specific host technology
- infer presentation choice from implicit environment state

## Testing Requirements

This feature should include tests for:

- switching between variants with separate runtime state
- keeping inactive variants from claiming input
- preserving shared external state while isolating runtime-local state
- visible-but-non-interactive variant behavior
- activation and deactivation cleanup
- selective versus always-refresh synchronization

## Phasing

### Phase 1

Ship a small runtime-binding helper for one runtime and one external state source.

### Phase 2

Extend the helper to support named presentation variants and activation policy.

### Phase 3

Add conveniences for multi-variant orchestration such as:

- grouped activation
- mirror-only variants
- lazy runtime creation
- explicit suspension and resume behavior
