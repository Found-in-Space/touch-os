# Plan: Panel Coordination

## Goal

Provide a reusable coordination layer for multiple interactive panel surfaces so applications can express priority, fallthrough, and pointer ownership without rebuilding the same routing logic around every set of panel drivers.

## Recommendation

`touch-os` should expose a small public coordination helper above individual panel interactors or drivers.

This helper should be generic and policy-driven rather than tied to one environment or layout pattern.

## Why This Feature Exists

Many applications need more than one interactive surface at once:

- a top-priority utility overlay
- one or more in-world panels
- one or more compact utility surfaces
- multiple surfaces sharing one pointer source

Without a public coordination layer, each application ends up re-implementing rules for:

- which panel gets first refusal on input
- when empty overlay space should fall through
- how pointer capture is retained after press
- how lower-priority panels are cleared

Those rules are generic enough to deserve a reusable answer.

## Core Principles

### 1. Coordination Sits Above Individual Panels

The coordinator should not replace panel interactors.

Each panel remains responsible for:

- hit testing
- runtime input injection
- local pointer state

The coordinator is responsible only for cross-panel routing and ownership.

### 2. Priority Must Be Explicit

Panel coordination must be driven by an explicit ordered list or equivalent policy.

The library should not infer panel priority from scene structure or attachment order.

### 3. Same-Frame Fallthrough Matters

If a higher-priority panel misses entirely and does not block, lower-priority panels should be able to receive the same pointer sample in that same routing step.

### 4. Successful Press Must Retain Ownership

Once a panel successfully captures a press, that panel should retain ownership of that pointer until:

- pointer up
- cancel
- forced pointer clear

This must remain true even if the pointer later moves outside the original hit target.

## Required Feature Set

### 1. Ordered Panel Routing

The coordinator must process a list of candidate panels in priority order.

For each pointer sample, the coordinator should determine:

- whether a panel claimed the sample
- whether a panel blocked lower-priority routing
- which panel now owns the pointer, if any

### 2. Miss Fallthrough

If a higher-priority panel:

- does not claim the sample
- and does not block routing

then lower-priority panels must be allowed to process the same sample.

This is especially important for sparse overlays or chrome-light utility layers.

### 3. Lower-Priority Clearing

When a panel does claim ownership, the coordinator must clear that pointer from lower-priority panels that should no longer act on it.

This avoids:

- stale hover state
- stale press state
- accidental competing ownership

### 4. Pointer-Scoped Ownership

Ownership must be tracked per pointer identifier, not globally.

This keeps the design compatible with:

- multi-pointer browser input
- multi-controller immersive input
- simultaneous direct-contact and ray input

### 5. Enable And Disable Support

Panels must be able to participate conditionally.

The coordinator should support panels that are:

- enabled and interactive
- visible but not interactive
- inactive

Disabled panels should have their owned pointer state cleared predictably.

### 6. Public Result Contract

The coordinator should return a public routing result that tells the application:

- whether the sample was claimed
- whether lower-priority interactions should be blocked
- which panel, if any, currently owns the pointer

That makes the coordinator useful both for standalone panel interaction and for interoperability with broader application input systems.

## Suggested Public Shape

Illustrative generic contract:

```ts
interface CoordinatedPanel<TSample, TFrame> {
  key: string;
  enabled: boolean;
  process(sample: TSample, frame: TFrame): {
    claimed: boolean;
    blocked: boolean;
  };
  clearPointer(pointerId: string): void;
}

interface PointerRoutingResult {
  ownerKey: string | undefined;
  blocked: boolean;
}
```

This helper does not need to know the details of any one host system as long as the panel contract remains narrow and explicit.

## Non-Goals

This feature should not:

- replace the lower-level panel interactor
- infer priorities from scene graphs or visual hierarchy
- own pointer visuals
- own application-wide input beyond panel coordination

## Testing Requirements

This feature should include tests for:

- same-frame fallthrough on top-layer miss
- ownership assignment on successful claim
- lower-priority clearing after claim
- enable and disable transitions
- multiple pointers interacting with different panels
- pointer release and cancel cleanup

## Phasing

### Phase 1

Ship a minimal ordered coordinator with:

- explicit panel order
- same-frame fallthrough
- pointer ownership
- lower-priority clearing

### Phase 2

Add optional policies such as:

- dynamic priority predicates
- grouped panel sets
- diagnostic tracing hooks

These should remain additive and should not complicate the narrow core contract.
