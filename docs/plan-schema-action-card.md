# Plan: Schema Action Card Kind

## Goal

Add first-class declarative schema support for the generic action card so compact information-plus-action shells can be expressed in schema documents without custom adapter code.

## Recommendation

Once the schema adapter supports a stable generic built-in set, `action-card` should be one of those built-in kinds.

This is justified because the action card is a generic control type, not a product-specific extension.

## Why This Feature Exists

Some declarative surfaces need to define compact cards with:

- a title
- a few body lines
- an optional empty-state message
- an optional primary action
- an optional dismiss affordance

That pattern is common enough that it should not require custom declarative extension code in every consumer.

## Required Feature Set

### 1. Stable Built-In Kind Name

The declarative schema should expose a built-in kind named:

- `action-card`

The schema layer should not use ambiguous names for this control.

### 2. Generic Item Shape

The declarative item shape should remain generic and text-oriented.

Recommended properties:

- `id`
- `title`
- `lines`
- `emptyStateText`
- `primaryActionId`
- `primaryActionLabel`
- `dismissible`
- `dismissActionId`

No domain-specific fields should be required.

### 3. Direct Mapping To Component Semantics

The schema kind must map directly to the generic action card component contract.

That mapping should preserve:

- shell chrome ownership
- primary action emission
- dismiss emission
- empty-state behavior

### 4. Controller-Friendly Updates

The declarative adapter should support practical updates for action-card content through normal schema-controller mechanisms.

Required minimum update paths:

- replace the card item through schema replacement
- update text values shown in the card
- update whether primary or dismiss actions are available, if the adapter supports property patching

### 5. Validation Rules

The declarative schema should validate action-card items explicitly.

Required validation checks:

- `id` must be present
- `title` must be present
- if a primary action label is present, the adapter must define how its action identifier is resolved
- dismiss configuration must be explicit rather than inferred

## Suggested Schema Shape

Illustrative item:

```ts
interface SchemaActionCardItem {
  kind: "action-card";
  id: string;
  title: string;
  lines?: readonly string[];
  emptyStateText?: string;
  primaryActionId?: string;
  primaryActionLabel?: string;
  dismissible?: boolean;
  dismissActionId?: string;
}
```

## Relationship To Custom Kinds

This built-in kind should not remove the need for custom declarative kinds.

The action-card kind is simply the generic built-in answer for a widely reusable shell pattern.

Richer or domain-specific card kinds should still be implemented through the extension registry when needed.

## Non-Goals

This feature should not:

- encode domain semantics into the item contract
- replace richer custom cards
- require embedded live content support in the base item

## Testing Requirements

This feature should include tests for:

- valid action-card schema rendering
- empty-state rendering
- primary action emission
- dismiss action emission
- schema validation failures for invalid items

## Phasing

### Phase 1

Add the built-in schema kind and validation.

### Phase 2

Ensure controller update paths work cleanly for common card content changes.
