# TouchOS interaction reengineering

Status: development implementation on 18 October 2026. Shared contracts, the
Three environment, panel/aggregate routing, planar capture, default feedback,
slider/dial behaviors and desktop/WebXR input are implemented. See
[interaction.md](./interaction.md) for public usage and lifecycle. Packed
composition and headless behavior are verified; coordinated registry publication,
remaining legacy-consumer migration and physical headset acceptance remain.

TouchOS should make an interactive panel a content, state-binding and placement
choice. Applications should receive working input, interaction feedback and
resource management from the library. Build the interaction path around public
adapters and composable widget behaviors, with one authority resolving input
across surfaces and scene targets.

The current 0.3 API is a development baseline. Breaking changes are permitted;
compatibility wrappers, existing factory boundaries and historical examples do
not constrain the replacement architecture. Coordinate consumer updates and
package versions rather than silently changing the contents of a published
version.

## Architecture

The headless UI runtime owns layout, component lifecycle and normalized UI
behavior. Three.js and WebXR remain optional integrations. Applications own
domain state and semantic actions.

Use `@pmndrs/pointer-events` as the Three.js pointer foundation, through an
explicit adapter boundary. Its public custom intersection interface can combine
mesh geometry and specialized queries. Adoption must satisfy the ownership,
geometry, cancellation and package requirements below; forwarding upstream
events alone does not complete this work.

| Part | Responsibility |
| --- | --- |
| Input adapter | Source identity, current poses, ordered semantic input events and lifecycle. |
| Interactor | Ray, screen or contact targeting technique and capability information. |
| Shared interaction context | Candidate resolution, priorities, capture ownership and lifecycle. |
| Target adapter | Query eligibility and geometry without dispatching application actions; identify semantic subtargets. |
| UI behavior | Activation, continuous editing, scrolling and gesture arbitration in local coordinates. |
| Presentation | Beam, reticle, widget styling and optional haptic or audio feedback from resolved state. |
| Application binding | Apply actions and value requests to authoritative state; publish the resulting values. |

The Three integration must be usable directly in a plain Three.js application.
Adapters supplied by another toolkit are optional implementations of the same
contracts. TouchOS must have no dependency on SkyKit or astronomical data.
Keep domain-specific pickers and metadata in their owning packages.

## Public contracts

Define these contracts before expanding implementation. Factory names and exact
entrypoints are design work; the responsibilities are requirements.

- An input source supplies a stable identity within a source lifetime, tracking
  validity, coordinate space, capabilities and ordered begin, complete and
  cancel actions. Handedness and controller array position are attributes, not
  identity. Preserve short interactions occurring between rendered frames.
- A target query returns eligibility, a stable target and optional subtarget
  identity, world geometry, local coordinates and opaque domain metadata. It
  must not deliver actions or acquire capture. Provide explicit blocking and
  fallthrough policies for panel backgrounds and disabled content.
- A capture record identifies its input source, target, subtarget and active
  gesture. Spatial capture of a surface and delivery to a widget are related
  parts of that record, with defined coordination rather than competing owners.
- A resolved interaction snapshot separates current hover, pressed target,
  captured target, active gesture, tracking validity, current geometric hit and
  manipulation projection. Use explicit spaces and units for every position
  and distance. Presentation consumes this snapshot without another pick.
- A mounted view owns registration, invalidation and cleanup. Supplied resources
  have explicit borrowing rules. Detachment is reversible; disposal is final
  and cancels active interactions before releasing owned resources.

Targets can be aggregate objects with semantic subtargets. A whole star field,
for example, can have one scene target whose query returns a selected entity.
Changing the selected entity must not be mistaken for a click on an unchanged
target merely because the scene object stayed the same.

## Input resolution and timing

Prepare transforms, resolve targeting and ownership, deliver semantic events,
apply synchronous state updates, then render the resulting UI and feedback.
Preserve ordered event edges with the pose available when each occurred; use
the current frame pose for continuous movement. Normalize clocks at adapters.
Each runtime advances once per scheduled frame, independent of view count.

Candidate resolution precedes dispatch. Within a declared priority layer,
spatial targets normally use distance in the same scene coordinate space.
Overlay and modal priority are explicit. Specialized targets choose their own
candidate internally; their domain score is not a distance for comparing them
with unrelated targets.

An established gesture retains ownership until completion or cancellation.
Near and far interactors from one hand must not activate the same target twice.
Different pointers may operate different controls concurrently. A continuous
control defaults to one editor; behaviors may explicitly support multiple
pointers. Parent scrolling and child dragging participate in gesture
arbitration, with cancellation of losing behaviors.

WebXR adapters consume semantic selection events, including the distinction
between successful completion and interruption. Polling gamepad button zero is
not the activation contract. Support controller rays and desktop input first;
the contracts must also admit direct touch and transient inputs without
requiring a persistent controller, a grip pose or continuous hover.

## Capture geometry and feedback

Keep the current intersection, the captured target and its manipulation
projection distinct. For a planar control, a valid captured ray continues to
project onto the current panel plane outside its bounds. The widget constrains
its value. A moving panel uses current transforms. A parallel ray, invalid
transform or lost source must follow a defined cancellation policy rather than
reusing an old point as a current hit.

The pointer foundation distinguishes its pointer point from its face
projection during capture. The adapter must deliberately choose and normalize
the projection used by manipulation and feedback, including its distance and
local coordinates. Do not derive captured drag coordinates from clamped texture
UVs or a previous hit distance.

Ship a default beam and hit marker with distinct hover, press and drag states.
The beam endpoint and marker use the resolved interaction geometry. Feedback
must include more than color alone. Keep haptic and audio channels optional and
capability driven. Custom feedback replaces presentation without replacing
input routing.

Spatial and overlay panel modes define rendering and interaction together:
occlusion, depth behavior and feedback order must agree. Keep physical panel
dimensions separate from logical layout units and texture resolution. UI
placements should support comfortable distance, reach and readable targets
without inheriting application world-scale changes accidentally.

## Widget authoring and application state

Widgets combine layout and rendering, local hit regions, reusable behaviors and
semantic outputs. Supply activation, continuous-value and drag/scroll behavior
primitives with consistent focus, disabled, hover, press and drag state. New
widgets should not implement controller selection, capture bookkeeping or
tracking loss.

A dial and a slider should reuse continuous-value editing with different local
value mappings. Gesture behavior must support begin, update, commit and cancel.
The application decides whether cancellation retains applied changes or rolls
back a preview; the binding makes that decision explicit.

Application state is authoritative. Thumb position, fill and formatted readout
reflect the applied value together. Asynchronous requests need explicit pending
and rejection behavior, with stale results unable to overwrite newer edits.
External state changes reconcile without resetting an active component merely
because its props changed.

Create the UI environment once. Mount each panel with content, bindings and
placement. Built-in input, feedback and cleanup come from that environment.
Desktop and XR views may share content and state without sharing a canvas or
layout. Keep per-view input state separate. Update layout and raster content
only when invalidated; pointer feedback need not repaint an unchanged panel.

## Implementation sequence

1. Define the public input, target, capture, behavior and snapshot contracts;
   document their lifecycle transitions and the minimal panel authoring path.
2. Implement the Three pointer adapter, pure target queries, shared routing,
   capture projection and default presentation. Integrate a real slider and an
   aggregate custom target before migrating application code.
3. Migrate built-in controls onto shared behaviors and add a dial as a
   conformance example. Implement the desktop and WebXR input adapters through
   the public contracts.
4. Add an external toolkit adapter for its existing domain picker and input
   environment. Verify panel and domain interaction in the same context.
5. Convert consumer examples to content, bindings and placement. Remove
   superseded input loops and APIs; update contributor and consumer docs to the
   replacement design.
6. Verify packed consumers with exact dependency versions, then coordinate
   versioned producer and consumer updates. Source aliases and unpublished
   local dependencies are development modes, not release acceptance.

Upstream pointer code initializes a global pointer map and extends Three's
object prototype. Keep that dependency out of the headless import graph and
make its optional loading effects explicit. Resolve instance identity and
resource cleanup across multiple contexts. If the published API cannot satisfy
these requirements, make the necessary upstream change or bounded adaptation
before claiming the integration complete. Account for these effects in package
tree-shaking metadata.

## Acceptance

| Composition | Required result |
| --- | --- |
| Plain Three.js app | Mount two panels and a custom dial through public exports without a toolkit dependency or per-panel input code. |
| Panel and specialized scene target | An eligible target behind a slider receives no activation during the slider gesture, including release outside the panel. |
| Continuous editing | Applied value, thumb, fill and readout update continuously and reconcile external changes. |
| Custom target query | Preserve domain selection policy, identity and metadata without one scene mesh per entity. |
| Capture | Correct projection beyond panel bounds and through panel movement; invalid projection has a defined outcome. |
| Multiple inputs | Independent controls work concurrently; same-control contention and near/far precedence are deterministic. |
| Lifecycle | Source loss, cancellation, hidden/removed targets, session interruption and disposal release ownership once and cannot activate another target. |
| Recovery | A held input does not synthesize a new gesture; a new activation is required. |
| Semantic subtargets | Moving between entities inside an aggregate target cannot create an unintended completion. |
| Packaging | Headless imports remain independent of Three.js, WebXR and toolkit code; multiple contexts and teardown release their registrations. |
| Headset | Beam, marker and control agree visually; target readability, placement, direct touch and frame cost are acceptable on the intended hardware. |

Headless composition checks establish routing and value behavior. Physical
headset acceptance separately establishes the assembled visual and ergonomic
result.

## References

- [Unity XR interaction architecture](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.3/manual/architecture.html)
- [WebXR input specification](https://www.w3.org/TR/webxr/#input)
- [Pointer library](https://github.com/pmndrs/xr/tree/main/packages/pointer-events)
- [Custom intersection interface](https://github.com/pmndrs/xr/blob/main/packages/pointer-events/src/intersections/intersector.ts)
