# Plan: Action Card

## Goal

Standardize a generic action-oriented information card for compact device surfaces.

This control should cover the common case of showing a small body of text plus optional shell actions without introducing domain-specific semantics.

## Recommendation

The generic concept should be called **action card**.

That name is clearer than vague terms such as "display" because it tells consumers what kind of thing this is:

- a card-shaped shell
- with informational content
- and optional actions owned by the card chrome

## Why This Feature Exists

Virtual-device interfaces frequently need a compact card that can present:

- selected-item details
- status information
- confirmation text
- warnings or notices
- contextual actions

This pattern is generic and should not require each consumer to invent a bespoke component every time.

## Core Semantics

An action card is a shell component with:

- a frame
- a title
- one or more lines of body text or an empty-state message
- an optional primary action
- an optional dismiss affordance

The action card does not own domain logic. It emits generic actions upward.

## Required Feature Set

### 1. Generic Content Model

The card must accept generic content only.

Required minimum content:

- title
- body lines or empty-state text

The component must not assume:

- domain-specific data types
- selection semantics
- navigation semantics
- application-specific commands

### 2. Optional Primary Action

The card may expose a primary action in shell chrome.

Required behavior:

- the primary action has an explicit label
- activating it emits one action event
- it does not mutate application state directly

The primary action belongs to the card shell. It should not be confused with interaction inside embedded content or child widgets.

### 3. Optional Dismiss Control

The card may expose a dismiss affordance in shell chrome.

Required behavior:

- activating dismiss emits one action event
- dismiss handling is separate from the primary action
- dismiss hit testing is owned by the shell, not forwarded elsewhere

### 4. Empty-State Behavior

The card must support an explicit empty-state presentation.

Required behavior:

- when no content lines are available, the card can still render a meaningful empty-state message
- empty-state styling should remain visually subordinate to normal content
- empty-state presentation must not change the action semantics of the shell

### 5. Stable Sizing Rules

The card must participate cleanly in layout.

Required sizing behavior:

- height grows with content length and optional action chrome
- width remains governed by parent layout constraints
- the card must remain usable on compact surfaces

The card should be easy to compose inside:

- columns
- sections
- scroll containers
- overlays
- movable window shells

### 6. Clear Shell Ownership

The shell must own its own interactive regions explicitly.

Required hit regions:

- primary action region, when present
- dismiss region, when present

The rest of the card may remain non-interactive unless a future child-composition version is introduced deliberately.

### 7. Themed But Generic Visual Language

The card should follow the runtime theme model rather than fixed styling rules.

Required theme usage:

- frame or surface color
- border or focus state
- content text color
- accent or emphasis color for title or primary action

The action card should feel like a reusable base control, not a product-specific widget.

## Declarative Availability

The action card should be available in two ways:

- as a direct component factory
- as a built-in kind in the declarative schema layer

That ensures the pattern is reusable both for code-authored surfaces and declarative surface definitions.

## Suggested Declarative Shape

Illustrative schema shape:

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

The exact schema API may change, but the semantic contract should remain stable.

## Non-Goals

This feature should not:

- encode application-specific meaning into the component contract
- assume the card always represents a selected object
- require embedded live content
- replace full-page detail views or rich editors

## Testing Requirements

This feature should have tests for:

- rendering with normal content
- rendering in empty state
- primary action emission
- dismiss action emission
- correct shell hit testing
- theme and focus rendering behavior
- declarative schema availability once the schema layer supports it

## Phasing

### Phase 1

Stabilize the component contract and naming around action card semantics.

### Phase 2

Add first-class declarative schema support.

### Phase 3

Consider optional refinements such as:

- secondary action slots
- icon support
- compact and expanded chrome variants

Those should only be added if they remain generic and do not undermine the simplicity of the base control.
