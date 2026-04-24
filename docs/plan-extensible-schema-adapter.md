# Plan: Extensible Schema Adapter

## Goal

Provide a declarative surface-definition layer that supports both built-in generic controls and consumer-defined custom control kinds without forcing custom behavior into the core runtime.

## Recommendation

`touch-os` should ship a small built-in declarative adapter plus a formal extension mechanism.

The built-in layer should cover the generic control set.

The extension layer should let consumers add richer or domain-specific kinds while still producing ordinary `touch-os` component trees.

## Why This Feature Exists

A declarative schema layer is useful because it makes some UI surfaces easier to:

- author
- serialize
- patch
- validate
- inspect
- generate from tools

But a fixed closed schema becomes limiting quickly. Once a consumer needs one richer control, the schema either becomes too narrow or the library starts absorbing consumer-specific widgets into core.

An extensible schema adapter solves that tension.

## Core Principles

### 1. The Schema Layer Is A Convenience Layer

The schema layer should sit above the normal component contract.

It should generate component trees. It should not replace the component model.

### 2. Core Keeps Only Generic Built-Ins

The built-in schema kinds should remain limited to generic controls and containers.

Custom or product-specific kinds belong in extension registries, not in the core built-in set.

### 3. Custom Kinds Must Still Produce Normal Nodes

A custom kind must compile to an ordinary `touch-os` display node or subtree.

That keeps lifecycle, layout, rendering, hit testing, and event behavior consistent across built-in and custom items.

## Required Feature Set

### 1. Small Built-In Kind Set

The built-in schema adapter should cover the generic controls that belong in core.

Recommended minimum built-ins:

- text label
- button
- toggle
- slider
- value readout
- action card
- page container support
- scroll container support

Additional generic built-ins may be added later if they remain broadly reusable.

### 2. Custom Kind Registry

The adapter must support explicit registration of custom kinds.

Each registered custom kind should define:

- its kind identifier
- how to validate its item shape
- how to build display nodes from validated item data

The registry must be explicit. There should be no hidden global registration.

### 3. Validation And Error Handling

The adapter must define predictable behavior for:

- unknown kinds
- invalid item payloads
- missing required properties
- duplicate item identifiers where identifiers must be unique

Errors should be visible and actionable. The adapter should not silently drop invalid content.

### 4. Stable Controller Updates

The schema layer should support controlled updates without forcing full document replacement for every small change.

Required minimum controller capabilities:

- replace the active schema document
- update field values
- update item text or display values

Future patch APIs may exist, but the minimum controller surface should already support practical declarative use without application-specific mutation hooks.

### 5. Versioning And Migration Hooks

The schema layer should allow explicit versioning or migration if the document format evolves.

This does not require a heavy migration framework immediately, but the format should leave room for:

- schema version identifiers
- kind aliases or migrations
- document validation before mount

### 6. Consumer Isolation

Custom schema kinds must be isolated from core runtime internals.

Extensions should work through:

- validated item data
- explicit factory functions
- normal component outputs

They should not require deep imports into runtime internals.

## Suggested Public Shape

Illustrative registry-oriented API:

```ts
interface SchemaKindRegistration<TItem> {
  kind: string;
  validate(item: unknown): TItem;
  createNode(item: TItem, context: SchemaBuildContext): DisplayNode;
}

interface SchemaAdapterOptions {
  registrations?: readonly SchemaKindRegistration<unknown>[];
}

function createSchemaAdapter(
  id: string,
  schema: SchemaDocument,
  options?: SchemaAdapterOptions
): SchemaAdapter;
```

The exact types may differ, but the high-level extension seam should remain this explicit.

## Built-In Action Card Requirement

Because action cards are a generic control type, the built-in schema layer should include an action-card kind once the extension mechanism is in place.

That gives the declarative adapter a complete answer for compact information-plus-action shells without requiring every consumer to re-register the same generic item.

## Non-Goals

This feature should not:

- turn the schema layer into a second runtime
- absorb consumer-specific rich controls into core by default
- normalize deep imports into internal runtime modules
- hide validation failures

## Testing Requirements

This feature should have tests for:

- built-in generic kinds
- custom kind registration
- unknown kind failure behavior
- invalid item validation behavior
- controller-driven updates
- schema replacement
- declarative action-card support

## Phasing

### Phase 1

Add the explicit custom kind registry and formalize built-in generic kinds.

### Phase 2

Add built-in action-card support and improve patch-style updates.

### Phase 3

Consider optional tooling support such as:

- schema validators
- development warnings
- schema inspection utilities

Those should remain optional and should not complicate the runtime-facing core.
