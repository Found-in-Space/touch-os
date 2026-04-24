# Plan: List Item Control

## Goal

Add a generic `list item` control that fills the remaining gap in the spec’s minimum control set without pushing application-specific table, inventory, or navigation semantics into core.

## Recommendation

`touch-os` should ship one domain-neutral `list item` shell rather than several specialized row widgets.

That control should be appropriate for:

- settings rows
- selectable result rows
- compact summary rows
- actionable menu rows

It should stay neutral about whether a row means navigation, selection, reveal, or confirmation. Those meanings should continue to come from emitted outputs and consumer-owned state.

## Why This Feature Exists

The current runtime already covers buttons, toggles, sliders, choice groups, and action cards, but many virtual-device screens still need a compact row primitive between “plain label” and “full card.”

A built-in `list item` should reduce repeated ad hoc row implementations while preserving the same lifecycle, hit testing, and one-way output flow as the rest of the runtime.

## Required Feature Set

### 1. Neutral Row Shell

The control should support:

- required primary label
- optional secondary text
- optional leading accessory slot or presentation hint
- optional trailing text or affordance
- optional disabled state

### 2. Explicit Interaction

The row should remain controlled and emit through explicit outputs only.

Recommended outputs:

- `action` for row activation
- optional `change-request` only when the row is explicitly modeled as a controlled toggle-like variant

The default control should not mutate selection or navigation state internally.

### 3. Clear Hit Targets

The shell should define explicit hit targets for:

- the row body
- optional trailing affordance when present

Empty interior space should not imply hidden extra behavior.

### 4. Theme-Driven Presentation

The row should derive spacing, typography, frame treatment, and focus chrome from theme tokens rather than fixed styling.

### 5. Runtime-Owned Focusability

When interactive, the control should register with the focus service and provide a stable default action target so it participates cleanly in traversal and page-local focus handoff.

## Proposed Public Shape

Illustrative shape:

```ts
interface ListItemProps {
  label: string;
  description?: string;
  actionId?: string;
  leadingText?: string;
  trailingText?: string;
  disabled?: boolean;
}

declare function createListItem(id: string, props: ListItemProps): DisplayNode;
```

The exact prop names can change, but the first version should stay intentionally small.

## Non-Goals

This first control should not:

- introduce virtualized lists
- own selection collections
- imply routing semantics
- become a generic table or data-grid primitive
- absorb domain-specific accessory widgets into core

## Testing Requirements

Add tests for:

- measurement and layout inside columns, sections, and scroll containers
- row-body press behavior
- disabled non-interactive behavior
- focus traversal/default target registration
- optional secondary text and trailing content rendering

## Phasing

### Phase 1

Ship a simple interactive row with label, optional description, and optional trailing text.

### Phase 2

Add a small trailing-affordance variant if real use cases need a split row/action hit model.

### Phase 3

Evaluate whether a separate selectable-row presentation variant belongs in core or should remain an application-level composition.
