# Agent Instructions

## Read The Docs First

- Read [README.md](./README.md) and [docs/architecture.md](./docs/architecture.md) before making substantial architectural or API changes.
- Use [docs/features.md](./docs/features.md) to understand what is already shipped.
- Use [docs/usage.md](./docs/usage.md) to understand supported integration patterns.
- Treat `docs/plan-*.md` as the contract for not-yet-implemented work.
- If implementation pressure conflicts with the docs, prefer updating the docs deliberately rather than drifting silently.

## Project Purpose

- `touch-os` is a reusable virtual-device UI runtime.
- It must remain domain-neutral.
- It must be usable in games, XR, simulations, and 3D applications without assuming any astronomy-specific concepts.

## Language And Output

- Write source in TypeScript.
- Use strict typing.
- Ship ESM only.
- Ship compiled JavaScript plus `.d.ts` type declarations.
- Prefer browser-compatible runtime code. Do not rely on Node-only APIs in the shipped runtime.

## Public API Shape

- Use named exports only. Do not introduce default exports.
- Expose public APIs through explicit entrypoints and subpath exports.
- Do not require consumers to deep-import from internal files.
- Keep the public surface small, obvious, and stable.
- Prefer public contracts over clever internal coupling.

Recommended package shape:

- `@found-in-space/touch-os`
- `@found-in-space/touch-os/core`
- `@found-in-space/touch-os/components`
- `@found-in-space/touch-os/containers`
- `@found-in-space/touch-os/services`
- `@found-in-space/touch-os/hosts`
- `@found-in-space/touch-os/hosts/three`
- `@found-in-space/touch-os/adapters/schema`

## Architecture Boundaries

- Keep the core runtime platform-neutral.
- Core modules must not depend on `three`, WebXR, DOM event objects, or scene-placement concepts.
- Host adapters belong in separate modules such as `hosts/dom`, `hosts/three`, or `hosts/xr`.
- Application state belongs outside the runtime.
- Runtime state belongs inside the runtime.
- Components may own only local ephemeral state.

## API Style

- Prefer factory functions and plain objects over inheritance-heavy class hierarchies.
- Prefer explicit contracts and composition over magic behavior.
- Use clear `createX` naming where it improves discoverability.
- Model events, actions, and service contracts with explicit interfaces and discriminated unions.
- Avoid hidden globals, ambient singletons, and implicit registration.
- Keep modules side-effect free and tree-shakeable.

## Component Framework Rules

- Keep the component contract explicit: `mount`, `update`, `measure`, `layout`, `render`, `hitTest`, `handleEvent`, `dispose`.
- Components must not depend on host-native event objects.
- Components must not mutate application state directly.
- Components should communicate upward through emitted actions or change requests.
- Containers, paging, scrolling, focus, and layout belong to the runtime rather than ad hoc application code.
- Embedded live surfaces such as camera feeds or mirrors should be modeled as components backed by host-facing services, not as ad hoc escape hatches.

## TypeScript Style

- Avoid `any`.
- Prefer `unknown` plus narrowing when necessary.
- Encode invalid states out of the type system where practical.
- Keep types close to the public contracts they describe.
- Prefer small, composable interfaces over large catch-all types.
- Add concise documentation comments for public types and exported factories when the intent is not obvious from naming alone.

## Testing Expectations

- The core runtime must be testable without a full 3D, WebGL, or XR environment.
- Add tests for lifecycle, layout, event dispatch, focus, scrolling, and emitted actions.
- Test host adapters separately with mocked host input and mocked placement data.
- Treat the reference fixtures in `src/examples/reference-fixtures.ts` and the supported patterns in `docs/usage.md` as conformance fixtures, not just illustrative examples.

## Change Discipline

- When adding a new subsystem, define its public contract before expanding implementation detail.
- Keep files and modules organized around architectural boundaries, not around temporary experiments.
- Avoid premature framework sprawl. Start with the smallest runtime that cleanly satisfies the documented architecture.
- If you introduce a new abstraction, make sure it simplifies at least one documented use case in `docs/usage.md`, `src/examples/reference-fixtures.ts`, or `examples/three-living-room`.
