# Touch OS Architecture

This document defines the architecture for a reusable virtual-device UI runtime.

The runtime is designed for screens that do not exist as native browser or mobile surfaces, such as:

- an in-world panel attached to scenery
- a hand-held tablet in XR
- a dashboard or cockpit display
- a camera-locked heads-up panel

It is intentionally domain-neutral. It assumes nothing about the surrounding application, simulation, or subject matter.

The goal is to provide a small but complete component framework for virtual devices:

- components render into a shared display surface
- hosts translate native input into normalized interaction events
- containers provide layout, paging, scrolling, and composition
- application code owns business state and reacts to emitted actions

## Goals

- Provide a clear component model for virtual-device interfaces.
- Normalize interaction across mouse, touch, stylus, controller rays, and similar pointer sources.
- Keep the runtime independent from any one rendering engine or application domain.
- Support several host styles without changing component code.
- Make simple menus and settings panels easy while keeping custom controls possible.
- Avoid coupling controls to native host events or host placement logic.

## Non-Goals

- This is not a replacement for a full browser DOM.
- This is not a general web framework.
- This is not responsible for application routing outside the device surface.
- This is not responsible for data fetching, persistence, or domain logic.
- This should not require a separate rendering context per component.

## Core Model

The system is split into four layers:

1. The display runtime
2. The component model
3. Container and layout services
4. Host adapters

Each layer has a distinct responsibility.

## Display Runtime

The display runtime owns the virtual screen as a whole.

Its responsibilities are:

- maintain the component tree
- maintain the layout tree
- track hover, press, focus, scroll, and active gesture state
- run layout and render passes
- dispatch normalized events
- provide container services to components
- schedule redraws and reconcile dirty regions or dirty state

The display runtime must not own:

- application business logic
- domain-specific state
- host-specific raycasting logic
- host-specific placement rules

## Rendering Model

The runtime renders into one shared display surface.

That surface may be backed by:

- a 2D canvas
- a texture-backed surface
- another retained drawing target in the future

The important architectural rule is:

- components target a shared display abstraction
- components do not create their own rendering contexts

This keeps composition predictable and allows one display definition to be hosted in multiple environments.

## Component Contract

A component is a reusable UI unit that participates in layout, rendering, hit testing, and interaction.

Every component must have:

- an `id`
- a `kind` or `type`
- immutable input props for the current render pass
- optional local ephemeral state

A component may expose:

- preferred size behavior
- child slots
- hit targets
- focus behavior
- gesture handlers
- commands or actions

At the architectural level, a component must be understandable through this contract:

### Inputs

- props
- container constraints
- theme tokens
- current runtime state made available through services

### Outputs

- draw instructions
- hit targets
- emitted actions
- state update requests

### Restrictions

- it must not depend on host-native event objects
- it must not know where in 3D space the display is mounted
- it must not mutate global application state directly

## Suggested Component Interface

The exact method names can vary, but a component framework in this system needs the following responsibilities somewhere in the contract:

- `mount`
- `update`
- `measure`
- `layout`
- `render`
- `hitTest`
- `handleEvent`
- `dispose`

These can be implemented as methods, function hooks, or registry entries, but the framework must support each phase explicitly.

## Component Lifecycle

The lifecycle should be explicit and stable.

### 1. Mount

The runtime creates the component instance, associates it with an ID, and gives it access to runtime services.

The component may:

- initialize local ephemeral state
- register internal resources
- subscribe to container-local services

The component must not:

- assume final size
- assume final position
- perform host-specific side effects

### 2. Update

The runtime provides new props, theme values, or service snapshots.

The component may:

- update local derived state
- invalidate layout
- invalidate rendering

### 3. Measure

The component reports intrinsic size needs or sizing behavior under the provided constraints.

Examples:

- fixed height
- fill available width
- content-driven height
- aspect-ratio-driven size

### 4. Layout

The runtime assigns the final bounds within the display surface.

The component receives:

- x/y position within the display
- width/height
- clipping or scrolling context if relevant

### 5. Render

The component draws into the shared display surface using the assigned bounds and current runtime state.

### 6. Hit Test

The component may expose one or more interactive targets inside its bounds.

These targets should be logical targets, not host-native ones.

Examples:

- main button face
- dismiss button
- slider track
- slider thumb
- list row

### 7. Event Handling

The runtime sends normalized events to the relevant component or target.

The component may:

- emit an action
- request a value change
- request focus
- request navigation within the display
- request scrolling

### 8. Dispose

The component releases local resources and unregisters transient subscriptions.

## Normalized Event Model

Components should not receive raw host-native input events.

Instead, hosts translate native input into a normalized event model.

The normalized model should support at least:

- pointer enter
- pointer move
- pointer leave
- pointer down
- pointer up
- press
- long press
- drag start
- drag move
- drag end
- cancel
- scroll
- focus
- blur

Each event should include only framework-relevant information, such as:

- pointer id
- logical pointer type
- surface coordinates
- local component coordinates
- target id
- modifier flags if needed
- pressure or analog data if supported

The framework should treat host input sources as transport layers.

Examples of host sources:

- mouse cursor
- touchscreen contact
- stylus
- gamepad ray
- laser pointer
- tracked controller ray

## State Model

The runtime should clearly distinguish three kinds of state.

### 1. Application state

This is owned outside the display runtime.

Examples:

- current settings values
- selected object id
- current page id
- domain data shown by the display

The display runtime consumes this state through props or store adapters.

### 2. Display runtime state

This is owned by the display runtime.

Examples:

- hovered target
- pressed target
- focused component
- scroll position
- active gesture
- dirty flags
- layout cache

### 3. Component-local ephemeral state

This belongs to an individual component instance.

Examples:

- temporary animation state
- drag interpolation state
- cached text metrics
- collapsed or expanded local UI state that is not part of application truth

The framework should bias toward:

- application state outside
- transient interaction state inside

## Event And Action Flow

The recommended flow is one-way:

- props and state come down into the display
- actions and value changes go up out of the display

A component should not directly mutate application state. It should emit:

- action events
- change events
- navigation requests
- service requests

The embedding application decides what those events mean.

## Container Services

Container services are the shared capabilities that make the runtime more than a loose collection of controls.

These services should be first-class.

### Layout Service

Responsible for:

- bounds calculation
- stacks, rows, columns
- spacing and padding
- intrinsic and constrained measurement
- alignment
- clipping
- scroll extents

### Navigation Service

Responsible for:

- page switching within the display
- back stack where appropriate
- active view or route within the display
- focus transitions across pages or sections

### Scroll Service

Responsible for:

- scroll offsets
- scroll bounds
- drag-to-scroll
- momentum or inertial scrolling if supported
- clipping and visible region calculation

### Focus Service

Responsible for:

- current focused component
- focus traversal
- default action target
- keyboard or non-pointer navigation when supported

### Theme Service

Responsible for:

- colors
- typography tokens
- spacing tokens
- radii
- visual density
- platform skinning

Components should read theme tokens rather than hard-coding a visual language.

### Timing And Animation Service

Responsible for:

- time deltas
- animation scheduling
- transitions
- delayed actions
- long-press timing

### Surface Service

Responsible for:

- display width and height
- orientation
- pixel density
- safe areas
- resize events

Components should not assume fixed portrait or landscape layouts.

## Container Types

The framework should provide a small number of built-in container primitives.

Recommended minimum set:

- stack container
- row container
- column container
- dock layout container for edge-attached HUD regions
- scroll container
- page container
- section container
- overlay container

These are more important than a large library of leaf widgets. Without containers, every application ends up reinventing composition rules.

For docked HUD layout:

- slots should anchor measured children to safe-area-adjusted edges rather than stretching them by default
- each slot should accept one child unless the API explicitly says otherwise
- callers that need multiple widgets in one slot should compose them through row, column, or stack containers
- docked regions should not automatically avoid overlapping each other

## Control Types

The framework should ship with a minimal generic control set.

Recommended base controls:

- button
- hold-button for start/stop style continuous input
- repeat-button driven by runtime ticks rather than host timers
- discrete four-direction d-pad
- toggle
- slider
- text label
- value readout
- action card
- list item
- segmented control or tab switcher

These controls should remain generic. Richer or domain-specific controls can be built on top of the same component contract.

For continuous controls:

- a hold-button should emit its start action exactly once on pointer-down
- a hold-button should emit its stop action exactly once on pointer-up, cancel, disable, unmount, or forced pointer clear
- a repeat-button should repeat from runtime time and tick delivery rather than browser timers
- a repeat-button should stop immediately on pointer-up, cancel, disable, unmount, or forced pointer clear
- the initial d-pad should be discrete four-direction hold input rather than an analog thumbstick

## Rich Custom Components

The architecture must support components that render richer graphics inside the same display surface.

Examples:

- a mini map
- a graph
- a waveform
- a sensor plot
- a compact preview panel

These should still behave like normal components:

- measured by the layout system
- rendered into the shared surface
- hit-tested through the same target model
- driven by plain props and emitted actions

### Shared-Surface Bitmap Path

Some richer custom components need a raster body while still belonging to the shared display surface.

Examples:

- dense plots
- heatmaps
- waveform previews
- cached mini maps

These should use a runtime-managed bitmap path rather than a foreign or embedded surface.

Recommended contract:

- components allocate and update raster assets through a bitmap service
- components draw those assets through a public `bitmap` draw primitive
- components may layer normal vector or text overlays on top of the bitmap
- hit testing and emitted actions stay in the normal component contract

Decision rule:

- `bitmap` = runtime-generated raster content that is still part of the shared UI surface
- `embedded surface` = externally owned viewport, stream, camera, or secondary render target

## Embedded Surface Components

Some common virtual-device elements are not best modeled as ordinary controls drawn entirely by the UI runtime.

Examples:

- rear-view mirrors
- security camera monitors
- drone or external camera feeds
- live map or radar viewports
- remote desktop or streamed app panels

These should be modeled as embedded surface components.

An embedded surface component is still a normal component in terms of:

- lifecycle
- layout
- bounds
- visibility
- focus rules
- emitted actions

But its visual content is provided by a host-facing service rather than drawn entirely by the shared UI renderer.

The component should own:

- layout and size policy
- optional frame, bezel, label, or chrome
- hit regions for component-local controls
- routing rules for whether input stays in the shell or is forwarded into the embedded surface

The runtime or host service should own:

- creation of the secondary camera, viewport, or streamed source
- render-target allocation
- frame updates
- composition into the final device display
- lifecycle of external graphics resources

This distinction keeps the component model clean. A mirror or live monitor is still "just a component" to the layout system, but it is not forced into the same rendering path as text, buttons, or sliders.

### Embedded Surface Contract

An embedded surface component should be able to declare:

- desired source type
- aspect-ratio preferences
- refresh policy
- composition mode
- whether it accepts forwarded input
- fallback content when the source is unavailable

The backing service should return:

- a surface handle, texture handle, frame source, or equivalent host-defined reference
- availability state
- optional metadata such as source size, aspect ratio, latency, refresh state, or last frame time

When `preserveAspectRatio` is enabled, the default interpretation should be centered `contain`
behavior inside the component viewport. That means letterboxing or pillarboxing is preferred over
stretching or cropping.

### Composition Rules

The architecture should allow two composition strategies:

1. Copy into the shared UI surface.
2. Composite a foreign surface alongside the shared UI surface.

The first model is simpler and works well when performance and platform behavior are acceptable.

The second model is closer to classic overlay or native-surface composition and is often the better fit for live camera views or other continuously updated content.

The component framework should not hard-code only one of these strategies. It should define the component contract so hosts can choose the most suitable composition path.

### Input Rules For Embedded Surfaces

Input to an embedded surface component may be handled in three ways:

- consumed by the shell component itself
- forwarded to the embedded surface
- split between shell controls and embedded content regions

Examples:

- a monitor frame may have close or pin buttons handled by the shell
- the live viewport area may accept pan, press, or drag input forwarded to the embedded source
- a mirror may be view-only and reject forwarded input entirely

If an embedded surface is marked non-interactive, it should not claim input for its viewport area
and should not forward events into the backing source even while it remains visually present.

The routing decision should be explicit in the component contract rather than hidden in host-specific behavior.

## Host Architecture

Hosts are responsible for placing and driving a display surface inside some environment.

The host contract should be intentionally narrow.

A host must provide:

- a render target for the display surface
- surface size information
- normalized input injection
- lifecycle hooks for attach, update, and detach

A host may provide:

- 3D placement
- visibility rules
- clipping integration
- hit conversion from rays or projections
- pointer blocking or passthrough behavior

The host must not define component semantics.

## Known Host Patterns

The architecture should explicitly support at least these host styles.

### 1. Scene-Mounted Panel Host

A display surface attached to an object or anchor in world space.

Typical uses:

- wall terminal
- dashboard screen
- cockpit panel
- room display

Host responsibilities:

- attach the display to a scene node or anchor
- convert world interaction into local display coordinates
- manage visibility and render texture updates

### 2. Pose-Anchored XR Panel Host

A display surface attached to an explicit tracked pose supplied by the application.

Typical uses:

- virtual tablet
- wrist slate
- head-mounted mirror
- chest panel
- tool display
- shoulder rig screen
- portable control panel

Host responsibilities:

- bind panel placement to tracked pose data
- convert controller ray interaction into local display coordinates
- manage anchor-relative orientation and offset

Important architectural rule:

- the host should accept explicit anchor pose data rather than hard-coding one body location

The runtime should not care whether that pose represents:

- a hand
- a wrist
- a head
- a chest
- a controller grip
- a tool mount
- another rig-defined body anchor

The application or host adapter chooses the anchor source. The runtime just consumes the explicit pose.

### 3. Camera-Locked HUD Host

A display surface attached to the viewer or camera frame rather than the world.

Typical uses:

- heads-up overlay
- persistent utility panel
- compact status device

Host responsibilities:

- keep the display stable relative to the view
- support pointer or gaze interaction without world anchoring

There are two valid patterns here:

1. Viewport-sized overlay mode
   The HUD surface width, height, and pixel density track the active viewport.
   This is a full-surface overlay mapped to the current view.

2. Compact camera-relative panel mode
   A fixed-size panel is anchored relative to the head or camera pose using the same explicit-pose
   model as other pose-anchored XR panels.

Viewport-sized overlay mode is optional. It should be used only when the product truly needs a
full-view overlay. XR experiences that just need a rear-view mirror, utility card, or compact
status surface may use a small pose-anchored panel instead.

The runtime must not require desktop HUD and XR HUD presentations to share the same layout tree,
host path, or rendering strategy.

The HUD root may render no background of its own. In that configuration, only child components that
explicitly draw chrome should be visible, and empty HUD pixels should remain visually transparent.

Empty HUD pixels must not claim or block input. A pointer miss on the HUD should fall through to
lower-priority world or panel interactions in the same frame.

Once a HUD control successfully receives a press, the HUD keeps pointer ownership until pointer-up,
cancel, or forced pointer clear, even if the pointer later moves outside the original control
bounds.

The architecture should allow more hosts later, but these patterns are enough to shape the initial design.

## Host-Neutral Coordinates

The core runtime should only understand display-space coordinates.

That means hosts must translate native interaction into:

- normalized surface coordinates
- local display-space coordinates
- optional pressure, depth, or analog values

The core runtime should never need to know about:

- world transforms
- raycasters
- camera matrices
- tracked pose APIs

## Services Exposed To Components

Components should be able to depend on stable runtime services rather than directly querying host objects.

Recommended service set:

- layout service
- navigation service
- focus service
- scroll service
- theme service
- timing service
- bitmap service for runtime-managed raster content
- embedded surface or viewport service when supported

These services should be injected by the runtime and be mockable in tests.

## Testing Requirements

The architecture should be testable without a full 3D or XR environment.

The core runtime should support tests for:

- layout
- event dispatch
- component lifecycle
- value changes
- focus changes
- scrolling
- custom component integration

Host adapters should be testable separately with mocked host input and mocked placement data.

## Evolution Path

A sensible implementation path is:

1. Build or extract the core display runtime with normalized events and basic controls.
2. Build container services and layout primitives.
3. Add host adapters for scene-mounted surfaces, explicit-pose XR panels, and optional HUD surfaces.
4. Add richer custom component support on top of the same lifecycle and event model.
5. Only then consider whether a more declarative authoring model is needed.

This keeps the architecture grounded in reusable primitives instead of starting with a large framework surface.

## Success Criteria

The architecture is successful if:

- components are unaware of the application domain
- components are unaware of host-native event objects
- the same display definition can run in multiple host styles
- layout and paging belong to the runtime rather than ad hoc application code
- simple menus and settings panels are easy to build
- richer custom components still fit the same lifecycle and event model

## Reference Component Examples

These examples are intentionally pseudocode.

They are not meant to freeze one exact API shape. Instead, they define the sort of component behavior the framework must be able to express cleanly.

When the new project begins, these should become both:

- reference documentation
- conformance tests for the runtime and host adapters

### 1. Button

This is the baseline control. If this feels awkward to express, the component contract is probably wrong.

```text
component Button(id, props) {
  props: {
    label: string
    actionId: string
    disabled?: boolean = false
  }

  state: {
    hovered: boolean = false
    pressed: boolean = false
  }

  measure(ctx) {
    return size(fillWidth, ctx.theme.controlHeight)
  }

  hitTest(point, bounds) {
    if (!pointInRect(point, bounds)) return null
    return { targetId: id + ":face" }
  }

  handleEvent(event, ctx) {
    if (props.disabled) return

    if (event.type == "pointer-enter") state.hovered = true
    if (event.type == "pointer-leave") state.hovered = false
    if (event.type == "pointer-down") state.pressed = true
    if (event.type == "pointer-up") state.pressed = false

    if (event.type == "press") {
      ctx.emit({
        type: "action",
        actionId: props.actionId,
        componentId: id
      })
    }
  }

  render(ctx, bounds) {
    drawButtonFace(bounds, state, ctx.theme)
    drawCenteredLabel(bounds, props.label, ctx.theme)
  }
}
```

Emits:

- `action`

Uses services:

- theme service

Proves:

- basic lifecycle
- hit testing
- pressed and hovered interaction state
- one-way action flow

### 2. Slider

This proves that value changes flow outward as requests rather than mutating application state internally.

```text
component Slider(id, props) {
  props: {
    label: string
    value: number
    min: number
    max: number
    step?: number = 1
  }

  state: {
    dragging: boolean = false
  }

  measure(ctx) {
    return size(fillWidth, ctx.theme.controlHeight * 1.5)
  }

  hitTest(point, bounds) {
    if (!pointInRect(point, bounds)) return null
    if (pointInSliderThumb(point, bounds, props.value)) return { targetId: id + ":thumb" }
    return { targetId: id + ":track" }
  }

  handleEvent(event, ctx) {
    if (event.type == "pointer-down") state.dragging = true
    if (event.type == "drag-end" || event.type == "cancel") state.dragging = false

    if (event.type == "drag-move" || event.type == "press") {
      let nextValue = valueFromLocalX(event.localX, props.min, props.max, props.step)
      ctx.emit({
        type: "change-request",
        field: "value",
        value: nextValue,
        componentId: id
      })
    }
  }

  render(ctx, bounds) {
    drawSliderLabel(bounds, props.label, props.value, ctx.theme)
    drawSliderTrack(bounds, ctx.theme)
    drawSliderThumb(bounds, props.value, state.dragging, ctx.theme)
  }
}
```

Emits:

- `change-request`

Uses services:

- theme service
- focus service if keyboard or non-pointer input is supported

Proves:

- normalized drag input
- controlled component behavior
- separation of runtime interaction state from application state

### 3. Settings Page

This shows that paging, scrolling, and composition belong to the runtime rather than being rebuilt inside each application.

```text
component SettingsPage(id, props) {
  props: {
    title: string
    values: object
  }

  render(ctx, bounds) {
    return Column([
      Header({
        title: props.title,
        trailing: Button({
          label: "Back",
          actionId: "nav.back"
        })
      }),

      ScrollContainer([
        Section({
          title: "Display",
          children: [
            Toggle({
              label: "Show Labels",
              value: props.values.showLabels,
              field: "showLabels"
            }),
            Slider({
              label: "Brightness",
              value: props.values.brightness,
              min: 0,
              max: 100
            })
          ]
        }),

        Section({
          title: "Audio",
          children: [
            Toggle({
              label: "Alerts",
              value: props.values.alertsEnabled,
              field: "alertsEnabled"
            })
          ]
        })
      ])
    ])
  }

  handleEvent(event, ctx) {
    if (event.type == "action" && event.actionId == "nav.back") {
      ctx.navigation.back()
    }
  }
}
```

Emits:

- `action`
- `change-request` from child controls

Uses services:

- layout service
- navigation service
- scroll service
- theme service

Proves:

- container composition
- page-local navigation
- scroll ownership inside the runtime
- reusable control composition

### 4. Custom Graph

This proves that richer visuals still fit the same component model rather than requiring an entirely separate UI system.

```text
component Graph(id, props) {
  props: {
    points: array<number>
    highlightedIndex?: number
  }

  state: {
    hoveredIndex: number | null = null
  }

  measure(ctx) {
    return size(fillWidth, 180)
  }

  hitTest(point, bounds) {
    if (!pointInRect(point, bounds)) return null
    return { targetId: id + ":plot" }
  }

  handleEvent(event, ctx) {
    if (event.type == "pointer-move") {
      let bounds = ctx.layout.getBounds(id)
      state.hoveredIndex = nearestPointIndex(event.localX, props.points, bounds.width)
    }

    if (event.type == "press" && state.hoveredIndex != null) {
      ctx.emit({
        type: "action",
        actionId: "graph.select-point",
        index: state.hoveredIndex,
        componentId: id
      })
    }
  }

  render(ctx, bounds) {
    drawGraphAxes(bounds, ctx.theme)
    drawGraphLine(bounds, props.points, ctx.theme)
    drawGraphHighlight(bounds, props.highlightedIndex, state.hoveredIndex, ctx.theme)
  }
}
```

Emits:

- `action`

Uses services:

- theme service
- timing service if animated highlights are supported

Proves:

- custom drawing in the shared surface
- custom hit testing
- non-standard visuals without a separate component model

### 5. Embedded Surface

This is the reference example for live viewports such as mirrors, monitors, camera feeds, or streamed application panels.

```text
component EmbeddedSurface(id, props) {
  props: {
    sourceId: string
    title?: string
    interactive?: boolean = false
    preserveAspectRatio?: boolean = true
    compositionMode?: "copy" | "composite" = "copy"
  }

  mount(ctx) {
    ctx.surfaces.attach(id, {
      sourceId: props.sourceId,
      preserveAspectRatio: props.preserveAspectRatio,
      compositionMode: props.compositionMode
    })
  }

  update(ctx) {
    ctx.surfaces.configure(id, {
      sourceId: props.sourceId,
      interactive: props.interactive
    })
  }

  measure(ctx) {
    return size(fillWidth, 160)
  }

  hitTest(point, bounds) {
    if (!pointInRect(point, bounds)) return null
    if (pointInFrameButton(point, bounds)) return { targetId: id + ":close" }
    if (pointInViewport(point, bounds)) return { targetId: id + ":viewport" }
    return { targetId: id + ":frame" }
  }

  handleEvent(event, ctx) {
    if (event.targetId == id + ":close" && event.type == "press") {
      ctx.emit({
        type: "action",
        actionId: "surface.close",
        componentId: id
      })
    }

    if (event.targetId == id + ":viewport" && props.interactive) {
      ctx.surfaces.forwardEvent(id, event)
    }
  }

  render(ctx, bounds) {
    drawPanelFrame(bounds, props.title, ctx.theme)

    if (ctx.surfaces.isAvailable(id)) {
      drawEmbeddedSurface(bounds.inset(8), ctx.surfaces.getHandle(id), props.compositionMode)
    } else {
      drawSurfacePlaceholder(bounds.inset(8), "Source Unavailable", ctx.theme)
    }
  }

  dispose(ctx) {
    ctx.surfaces.release(id)
  }
}
```

Emits:

- `action`

Uses services:

- theme service
- embedded surface or viewport service

Proves:

- lifecycle around external graphics resources
- host-provided live content
- surface composition without breaking the component contract
- explicit routing between shell controls and forwarded viewport input

## Summary

The central architectural idea is simple:

- one shared virtual display surface
- a stable component lifecycle
- normalized events
- explicit container services
- narrow host adapters

If those pieces are clear and enforced, the system can support both simple device-like UIs and richer custom virtual interfaces without being tied to any one application or rendering environment.

---

# Pointer implementation

`touch-os` should not implement a “star pointer.” It should implement a host-side 3D pointer interop layer that is domain-neutral.

That layer should work in two modes:

- standalone: `touch-os` supplies common 3D pointer sources and panel interaction behavior
- interoperable: an app feeds its own ray/finger pointer into the same contract and gets back panel hit + claim/blocking results

That fits the spec well: the core runtime stays display-space only, while hosts own ray/projection conversion and pointer blocking in [spec.md](/Users/kws/work/fis/touch-os/spec.md:558).

**What To Implement First**

1. Add a public `ThreePointerSample` transport contract above `ThreePanelHostInputEvent`.
The current `ThreePanelHostInputEvent` in [three.ts](/Users/kws/work/fis/touch-os/src/hosts/three.ts:72) is already close to the final injected host event, but it is too low-level to be the main interop seam.

Use a higher-level sample type like:

```ts
type ThreePointerTransport = "screen" | "ray" | "surface" | "contact";

interface ThreePointerSample {
  pointerId: string;
  pointerType: PointerType;
  transport: ThreePointerTransport;
  phase: "move" | "down" | "up" | "cancel" | "scroll";
  timestamp: number;
  sourceId?: string;
  handedness?: "left" | "right" | "none";
  pressure?: number;
  modifiers?: ModifierState;
  ndcX?: number;
  ndcY?: number;
  origin?: Vector3Like;
  direction?: Vector3Like;
  surfaceX?: number;
  surfaceY?: number;
  contactPoint?: Vector3Like;
  contactNormal?: Vector3Like;
  deltaX?: number;
  deltaY?: number;
}
```

This gives one neutral format for:
- mouse/screen pointers
- XR/controller rays
- virtual finger / poke contact
- externally owned pointer systems

2. Add a `PanelInteractor` that turns a pointer sample into panel input plus a claim result.
This should live in the Three host layer, not in core.

Suggested API:

```ts
interface PanelInteractionResult {
  hit: ThreePanelHit | null;
  claimed: boolean;
  blocked: boolean;
  dispatched: boolean;
  hostEvent?: ThreePanelHostInputEvent;
}

interface PanelInteractor {
  process(sample: ThreePointerSample, frame: ThreePanelHostFrame): PanelInteractionResult;
  getPointerState(pointerId: string): unknown;
  clear(pointerId?: string): void;
}
```

Responsibilities:
- convert screen/ray/contact samples into surface coordinates
- inject normalized runtime input
- track pointer continuity/capture
- report whether the panel claims the pointer this frame

This is the core piece that makes `touch-os` usable standalone and also lets an external pointer system plug in cleanly.

3. Add explicit pointer claim / blocking policy.
The spec already makes blocking a host concern in [spec.md](/Users/kws/work/fis/touch-os/spec.md:574). Make that configurable.

Suggested policy:

```ts
type PointerClaimPolicy =
  | "block-on-hit"
  | "block-on-press"
  | "passthrough"
  | "manual";
```

Behavior:
- `block-on-hit`: panel hover alone claims the pointer
- `block-on-press`: only active press/drag claims it
- `passthrough`: panel can react, but never blocks world interaction
- `manual`: app decides from returned hit/result

This is what lets one app fully replace its world pointer with `touch-os`, while another app keeps its own picker and only yields to `touch-os` when appropriate.

4. Add direct-contact support as a first-class host transport.
Most apps will have either:
- a ray pointer
- a direct touch / poke interaction
- both

So `touch-os` should support both natively at the host layer.

Concrete addition:
- support `transport: "contact"` in the interactor
- convert a world-space contact point into local panel surface coordinates
- optionally support simple touch radius / pressure later

This avoids making every app reinvent the “virtual finger touching a panel” projection step.

5. Add built-in pointer source adapters, but keep them optional.
Ship helpers like:
- `createScreenPointerSource()`
- `createXrRayPointerSource()`
- `createDirectTouchPointerSource()`

These should produce `ThreePointerSample` values and nothing more.

That gives `touch-os` a complete standalone story, while apps with existing interaction systems can skip them and feed samples directly.

6. Decouple pointer visuals from pointer logic.
Do not hard-code beam/reticle visuals into the panel interactor.

Add an optional presentation interface like:

```ts
interface PointerPresentationState {
  pointerId: string;
  claimed: boolean;
  blocked: boolean;
  hit: ThreePanelHit | null;
}

interface PointerPresenter {
  update(state: PointerPresentationState): void;
  dispose(): void;
}
```

This is important because:
- some apps want `touch-os` to own the beam/cursor
- some apps already have their own pointer visuals
- some apps want one shared pointer visual that can hit world or panel targets

The interactor should expose state; presentation should be pluggable.

7. Keep the current host event path as the lowest-level escape hatch.
Do not remove `ThreePanelHostInputEvent`. Keep it as the final injected format in [three.ts](/Users/kws/work/fis/touch-os/src/hosts/three.ts:72).

Recommended layering:
- `ThreePointerSample` = interop boundary
- `PanelInteractor` = host-side resolver/arbitrator
- `ThreePanelHostInputEvent` = final host injection format
- core runtime = display-space only

That gives clean abstraction without breaking the current host design.

8. Add conformance tests for shared-pointer scenarios.
Tests should cover:
- external ray pointer feeds the interactor and gets a blocking claim
- external ray pointer feeds the interactor and gets passthrough
- direct touch contact on a panel
- same pointer remains claimed through down/drag/up
- panel switching still preserves correct claim behavior
- custom pointer visuals can consume returned hit/claim state without owning event logic

**What This Lets Apps Do**

With this architecture, an app with its own 3D pointer can do:

1. Build one ray/finger sample from its own interaction system.
2. Feed that sample into the `touch-os` panel interactor.
3. Inspect `claimed` / `blocked` / `hit`.
4. Either stop world interaction, or continue to its own world picker.
5. Reuse its existing pointer visual, or let `touch-os` provide one.

And an app with no existing system can just use the built-in sources.

**Bottom Line**

The most important thing to add is not a built-in astronomy/world pointer. It is a neutral host-side `PanelInteractor` plus `ThreePointerSample` contract.

That is the piece that:
- works standalone
- can replace an app’s current panel-pointer path
- can also sit behind an existing app-owned pointer with minimal friction
- stays faithful to the spec’s “host owns transport, core owns display semantics” boundary
