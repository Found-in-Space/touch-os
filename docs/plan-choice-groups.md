# Plan: Choice Groups

## Goal

Define a generic built-in grouped-choice control for `touch-os` that supports:

- single selection across 2, 3, 4, or more choices
- multiple selection when needed
- controlled state owned by the application
- horizontal, vertical, and wrapped multi-column layout
- equivalent direct-component and declarative-schema support

This plan covers the standard UI patterns commonly called:

- radio group for single-select
- checkbox group for multi-select

## Recommendation

Add a **generic choice-group subsystem** with a shared option model and explicit selection mode.

Recommended public surface:

- `createChoiceGroup`
- `ChoiceGroupProps`
- schema kind: `choice-group`

Recommended selection modes:

- `selectionMode: "single"`
- `selectionMode: "multiple"`

Optional ergonomic aliases may be added later if they remain thin wrappers:

- `createRadioGroup`
- `createCheckboxGroup`

The underlying implementation should be shared. The distinction between radio and checkbox behavior should come from explicit selection mode, not separate ad hoc implementations.

## Why This Feature Matters

Grouped choice is a base control category for device-style interfaces.

Common generic uses include:

- mode selection
- quality presets
- filter toggles
- source selection
- display preferences
- channel enablement
- grouped settings with a fixed option list

Without a built-in grouped-choice control, consumers must compose basic controls into patterns that the runtime should understand directly.

## Current Gap

The current built-in component set includes:

- button variants
- toggle
- slider
- text label
- value readout
- graph-like display controls
- embedded surface

The project does **not** currently provide:

- radio button
- checkbox
- radio group
- checkbox group
- generic single-select or multi-select option group

The schema adapter also has no grouped-choice item kind today.

## Core Principles

### 1. External State Owns Selection

Choice groups must be controlled components.

The selected value or values belong outside the runtime. The component emits change requests and does not own persistent application state.

### 2. One Clear Contract, Two Selection Modes

The base abstraction should be one generic option-group contract with explicit mode:

- single-select behaves like a radio group
- multi-select behaves like a checkbox group

This avoids duplicate implementations while keeping behavior obvious.

### 3. Options Are Explicit Data

Each option must be represented by explicit data rather than hidden child behavior.

The runtime should know:

- the option id or value
- the visible label
- whether it is disabled
- optional helper text or secondary text, if supported

### 4. Layout Must Be First-Class

Grouped choice is not useful if it only stacks vertically.

The built-in control should support:

- vertical lists
- horizontal rows
- wrapped multi-column or flow layouts for compact displays

This must be part of the component contract rather than left entirely to application-specific composition.

### 5. Semantics Must Stay Generic

The control must not assume domain-specific meaning.

It should emit:

- the next selected value for single-select
- the next selected value set for multi-select

It should not assume:

- business rules
- persistence
- domain labels beyond the supplied option text

## Recommended Public Contract

### Core Types

```ts
export interface ChoiceOption<TValue extends string = string> {
  value: TValue;
  label: string;
  description?: string;
  disabled?: boolean;
}

export type ChoiceGroupSelectionMode = "single" | "multiple";

export type ChoiceGroupOrientation = "vertical" | "horizontal";

export interface ChoiceGroupFlowLayout {
  columns?: number;
  minOptionWidth?: number;
}

export interface ChoiceGroupProps<TValue extends string = string> {
  label?: string;
  options: readonly ChoiceOption<TValue>[];
  selectionMode: ChoiceGroupSelectionMode;
  value?: TValue;
  values?: readonly TValue[];
  field?: string;
  orientation?: ChoiceGroupOrientation;
  flow?: ChoiceGroupFlowLayout;
  showIndicators?: boolean;
  disabled?: boolean;
}
```

### Contract Rules

For `selectionMode: "single"`:

- `value` is used
- `values` must be absent
- selecting an option replaces the current selection
- pressing the already-selected option should typically keep it selected rather than clearing it

For `selectionMode: "multiple"`:

- `values` is used
- `value` must be absent
- selecting an unselected option adds it
- selecting a selected option removes it

Configuration errors should be rejected explicitly rather than tolerated silently.

## Visual Model

Each option row or tile should expose:

- a selection indicator
- a text label
- optional secondary description
- hover, pressed, focused, selected, and disabled visual states

Indicator guidance:

- single-select uses a circular radio indicator
- multi-select uses a square checkbox indicator

The outer presentation may remain stylistically consistent with the existing `toggle`, `button`, and `slider` controls.

## Layout Requirements

### 1. Vertical Layout

Support the standard settings-list presentation:

- one option per row
- full available width
- configurable gap between options

### 2. Horizontal Layout

Support inline choice presentation:

- options arranged left to right
- useful for short mode sets such as `Low`, `Medium`, `High`

### 3. Wrapped Multi-Column Layout

Support compact surfaces that need more than one column.

Recommended capability:

- `orientation: "horizontal"` with `flow.columns`
- or an equivalent explicit layout mode if that proves clearer

Required behavior:

- options wrap into multiple rows when columns are requested
- each option remains individually hittable
- column count and spacing remain explicit and predictable

The implementation should not depend on DOM flexbox or browser layout APIs in shipped runtime code.

## Measurement And Layout Behavior

The component should measure based on:

- group label height, if present
- option indicator size
- option text content
- inter-option gap
- outer padding
- configured columns or minimum option width

Expected behavior:

- vertical mode reports total stacked height
- horizontal single-row mode may consume full available width and fixed option heights
- wrapped mode reports height from computed rows under current width constraints

## Interaction Requirements

The control must work with the normalized runtime event model only.

Required behaviors:

- pointer enter and leave update hover state
- pointer down and up update pressed state
- press on an enabled option emits a change request
- disabled options do not emit changes
- focus state is visible at either group or option level

Recommended event output:

- `change-request`
- `field: props.field ?? "value"` for single-select
- `field: props.field ?? "values"` for multi-select

Emitted values:

- single-select emits the selected option value
- multi-select emits the full next array of selected option values

## Focus And Navigation

The component should integrate with the runtime focus model already used by existing controls.

Minimum expectations:

- focused state is visually apparent
- pointer press can focus the group
- hit testing identifies the specific option target

Future directional focus navigation may be added later, but this component should not block that work.

## Schema Support

The declarative layer should expose equivalent functionality through a built-in schema kind.

Recommended shape:

```ts
export interface SchemaChoiceGroupItem extends SchemaBaseItem {
  kind: "choice-group";
  label?: string;
  field: string;
  selectionMode: "single" | "multiple";
  value?: string;
  values?: readonly string[];
  orientation?: "vertical" | "horizontal";
  options: readonly {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
  }[];
  columns?: number;
  disabled?: boolean;
}
```

The schema adapter should not reduce the choice-group feature set compared with direct component usage.

## Suggested Rendering Roles

To keep tests and host behavior inspectable, the component should emit stable draw roles such as:

- `choice-group-frame`
- `choice-group-label`
- `choice-option-row`
- `choice-option-indicator`
- `choice-option-indicator-mark`
- `choice-option-label`
- `choice-option-description`

Hit-test roles should identify option-level targets clearly.

## Validation Rules

The component should reject invalid configurations including:

- empty `options`
- duplicate option `value`s
- `selectionMode: "single"` with `values`
- `selectionMode: "multiple"` with `value`
- selected value not present in `options`, unless intentionally tolerated and normalized
- non-positive `columns`, if provided

The plan should prefer explicit validation over hidden fallback behavior.

## Non-Goals

This feature should not become:

- a searchable dropdown
- a freeform combobox
- a hierarchical tree selector
- a tag-entry control
- a host-native HTML form shim

Those are separate controls if needed later.

## Implementation Shape

Recommended structure:

- `src/components/choice-group.ts`
- exported from `src/components/index.ts`
- schema registration in `src/adapters/schema.ts`
- tests in `test/controls.test.ts` or a dedicated `test/choice-group.test.ts`

If wrapper aliases are added later, they should delegate to `createChoiceGroup` rather than fork implementation.

## Testing Requirements

Add tests for:

- single-select change requests
- multi-select add and remove behavior
- disabled option behavior
- disabled whole-group behavior
- duplicate option validation
- vertical measurement and rendering
- horizontal layout behavior
- wrapped multi-column layout behavior
- stable hit testing per option
- focus rendering
- schema adapter support for single-select
- schema adapter support for multi-select

## Phasing

### Phase 1

Ship the shared `choice-group` component with:

- explicit options
- `single` and `multiple` modes
- vertical and horizontal layout
- controlled change-request output

### Phase 2

Add wrapped multi-column layout and schema parity.

### Phase 3

Consider optional refinements only if they remain generic:

- descriptions per option
- segmented visual variant for compact horizontal single-select sets
- optional group-level label hiding when an enclosing section already provides context

## Recommended Outcome

The project should standardize on one generic grouped-choice control rather than separate unrelated radio and checkbox implementations.

That gives `touch-os`:

- a clean public contract
- predictable selection semantics
- reusable layout behavior
- a natural path to schema support
- room for thin radio and checkbox aliases later without expanding the architectural surface unnecessarily
