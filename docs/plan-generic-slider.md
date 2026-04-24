# Plan: Generic Slider

## Goal

Define the generic requirements for the built-in slider control so it can serve as the standard scalar-selection control across `touch-os` surfaces without consumer-specific extensions.

## Recommendation

The built-in slider should remain a **generic, single-axis scalar control**.

It should cover:

- continuous numeric adjustment
- stepped numeric adjustment
- discrete mode selection represented by numeric values

It should not absorb domain semantics, but it must expose enough display and interaction flexibility to support real generic uses cleanly.

## Why This Feature Matters

A generic slider is one of the most common compact controls in device-like interfaces.

It is often used for:

- brightness
- volume
- sensitivity
- exposure
- scale
- threshold values
- discrete mode selection through stepped values

If the built-in slider is too rigid, consumers are forced to replace a generic control with application-local variants for otherwise ordinary needs.

## Core Principles

### 1. External State Owns The Value

The slider must remain a controlled component.

The source of truth for the selected value belongs outside the component. The slider emits change requests; it does not own persistent application state.

### 2. Display Text Is Not The Same As Stored Value

The displayed value must be allowed to differ from the raw numeric value.

This is required for generic use cases such as:

- decimal formatting
- unit formatting
- log-derived presentation text
- enumerated labels mapped from stepped numeric positions

### 3. One-Dimensional Interaction, Clear Semantics

The slider should stay intentionally simple:

- one axis
- one selected value
- one thumb
- one track

If richer controls are needed later, they should be separate controls rather than overloading the base slider.

## Required Feature Set

### 1. Core Numeric Contract

The slider must accept:

- a numeric `value`
- numeric `min`
- numeric `max`
- optional numeric `step`

Required behavior:

- the effective value is clamped into range
- if `step` is provided, emitted values snap to step
- invalid ranges must be handled predictably

If `max <= min`, the control must not produce undefined behavior. It should either clamp to a safe fallback or reject invalid configuration explicitly.

### 2. Generic Value Presentation

The slider must support explicit display formatting for the visible value text.

Required capability:

- the raw numeric value used for change requests may differ from the text shown to the user

Acceptable design directions include:

- `formatValue(value) => string`
- `valueText`
- declarative mappings for stepped labels

The exact API may vary, but the built-in slider must support generic value presentation without requiring a custom slider implementation.

### 3. Label And Value Layout

The slider must support a clear text presentation for:

- the control label
- the current displayed value

The layout should remain readable on compact device surfaces.

Minimum expectations:

- the label remains visible
- the current displayed value remains visible
- the track and thumb remain visually distinct

### 4. Pointer Interaction

The slider must support pointer-driven interaction through the normalized runtime event model.

Required behaviors:

- press on the track may move the value immediately
- press on the thumb begins drag interaction
- drag updates the value continuously or per-step as configured
- pointer release ends drag
- cancel ends drag cleanly

### 5. Focus And Disabled State

The slider should participate in generic interactive state like other base controls.

Required states:

- normal
- hovered, where the host provides hover semantics
- active or dragging
- focused
- disabled

Disabled behavior must be explicit:

- disabled sliders do not emit change requests
- disabled sliders render in a visibly inactive state

### 6. Change Request Semantics

The slider must emit generic change requests rather than application-specific payloads.

Required output shape:

- component identity
- target field identity, where applicable
- next numeric value

The slider must not assume:

- units
- domain meaning
- downstream side effects

### 7. Declarative Availability

Because the slider is a built-in generic control, its declarative schema representation must support the same generic behavior as the direct component factory.

This includes:

- numeric range configuration
- step configuration
- field binding
- value presentation formatting or display mapping

The declarative layer should not reduce the built-in slider to a less capable version of the direct component API.

## Suggested Capability Envelope

The generic slider should support these usage patterns without custom slider variants:

- scalar decimal values
- integer values
- stepped value sets
- enumerated labels over numeric steps
- unit-bearing value strings

Examples of display behavior:

- raw value: `0.5`, shown as `0.50`
- raw value: `2`, shown as `Frustum`
- raw value: `1.25`, shown as `1.25x`
- raw value: `4`, shown as `High`

These are all still generic slider needs.

## Non-Goals

This feature should not turn the generic slider into:

- a range slider with two thumbs
- a radial slider
- a timeline scrubber with playback semantics
- a domain-specific selector

Those may be useful later, but they should remain separate controls.

## Testing Requirements

The generic slider should have tests for:

- value clamping
- step snapping
- drag updates
- press-on-track behavior
- cancel cleanup
- focused rendering
- disabled behavior
- formatted display text
- declarative schema support for formatted display

## Phasing

### Phase 1

Stabilize the generic numeric contract and add value-presentation support.

### Phase 2

Ensure the declarative schema layer exposes equivalent slider formatting capabilities.

### Phase 3

Consider optional refinements such as:

- orientation support
- tick marks
- value-label maps for stepped modes

These should only be added if they stay generic and do not complicate the base slider beyond its role as the standard scalar-selection control.
