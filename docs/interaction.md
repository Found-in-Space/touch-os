# Shared Three.js interaction

The 0.4 development API puts panels and scene targets in one interaction context.
The environment owns routing, capture, scheduling, beam/marker feedback and view
cleanup. Author content, bind semantic outputs to applied state, and choose
placement. The [two-panel example](../examples/three-living-room/interaction.html)
uses sliders and dials with the same editing behavior; run `npm run dev` and open
`/interaction.html`.

Install `@found-in-space/touch-os@0.4.0-alpha.0`, `three`, and the optional Three
pointer foundation `@pmndrs/pointer-events@6.6.32`. The root, `/core`, `/components`
and `/interaction` exports require neither Three nor pointer-events at runtime.
`/hosts/three` deliberately loads pointer-events. That dependency initializes a
global pointer registry and extends Three's Object3D prototype when imported.
Those shared hooks remain installed; disposing an environment removes only its
own exact pointer registrations. Multiple environments allocate distinct IDs.
The bounded registry cleanup adaptation is pinned to 6.6.32 because upstream
has no unregister method. It does not undo hooks used by other applications.

```ts
import { createSlider, createValueBinding } from '@found-in-space/touch-os';
import {
  createDesktopInteractionInput, createThreeUIEnvironment,
  createWebXRInteractionInput
} from '@found-in-space/touch-os/hosts/three';

const state = createValueBinding({
  value: 50, apply: requested => Math.round(requested), cancellation: 'retain'
});
const ui = createThreeUIEnvironment({
  parent: scene,
  inputs: [
    createDesktopInteractionInput({ element: renderer.domElement, camera }),
    createWebXRInteractionInput({ xr: renderer.xr, origin: cameraRoot })
  ],
  ownsInputs: true
});
const content = () => createSlider('brightness', {
  label: 'Brightness', field: 'brightness', min: 0, max: 100,
  value: state.get().value
});
const panel = ui.mountPanel({
  id: 'settings', content, surface: { width: 320, height: 100 },
  placement: { panelWidth: 0.6, panelHeight: 0.1875,
    position: { x: 0, y: 1.3, z: -0.8 } },
  bind(output) {
    if (output.type !== 'change-request') return;
    if (output.phase === 'begin') state.begin();
    else if (output.phase === 'commit') state.commit();
    else if (output.phase === 'cancel') state.cancel();
    else state.request(Number(output.value));
  }
});
const unsubscribe = state.subscribe(() => panel.setContent(content()));
// In the application's animation loop, after final transforms and before render:
ui.update({ timestamp: performance.now(), scene, camera, xrFrame });
// On teardown: unsubscribe(); ui.dispose(); state.dispose();
```

For a canvas view, supply `canvas: element` instead of placement. It owns a new
runtime and canvas-local pointer adapter; a desktop and XR view can use the same
application state with independent layout, focus and pointer state. Bitmap
assets belong to each runtime's services. Supplied runtimes are borrowed and
must be distinct per view. Each mounted runtime advances once per frame.
`mountPanel` attaches immediately. `detach` cancels and preserves resources;
`attach` restores the view; `hide` cancels and disables targeting until `show`;
`dispose` is final. An environment owns views, hosts and its default presenter.
Supplied input adapters and presenters are borrowed unless explicitly owned.

`content` is evaluated on mounting and after bound outputs. Publish external
state changes with `setContent`, typically from a store or binding subscription.
Controlled slider/dial props are the applied value: thumb, fill and formatted
readout never display an unapplied proposal. Change requests have `begin`,
`update`, `commit`, and `cancel` phases. Apply value requests during `update`;
lifecycle phases allow explicit retain/rollback policy. A value binding exposes
pending/rejected state, suppresses stale asynchronous results, and lets external
reconciliation invalidate outstanding work. Render pending state in app content
when useful; the control continues to show its last applied value.

## Extension contracts

`/interaction` exports the headless input, target, capture and resolved snapshot
contracts, `createInteractionContext`, `createActivationBehavior`, and
`createContinuousValueBehavior`. New widgets supply local hit regions, value
mappings, rendering and semantic outputs. They consume normalized display events
and declare `gesture: 'continuous'`, `'activate'`, or `'scroll'`; they do not read
controllers, manage spatial capture, or handle tracking. Slider and dial share
the continuous behavior. Parent vertical scrolling competes with child
activation; continuous children keep their own gesture. A losing activation
receives cancellation. A continuous control has one editor by default.

A target's pure `query` returns a current hit or null for fallthrough. Domain
metadata is opaque. Aggregate targets identify semantic subtargets: completion
on a different entity cannot activate the initial entity. Targets can override
single-editor policy explicitly. Register an external target using
`ui.registerTarget(target)` and unregister it before disposing its underlying
resources. `createThreePanelTarget` exposes the panel adapter independently.
`createThreeInteractionContext` and `createThreeInteractionResolver` support
custom scheduling without a UI environment. Pointer-events performs the optional
Three query traversal; the headless context remains the sole authority for
capture and semantic delivery, avoiding competing native capture/click owners.

Higher priority layers win before distance. Equal-priority targets use current
world-metre distance; a domain score never competes with panel distance.
`background: 'block'` is the default, including disabled controls and blank panel
content; `'fallthrough'` allows scene targets through noninteractive content.
Overlay panels default to priority 1000, disable depth testing/writes and render
before overlay feedback. Spatial panels use scene depth and distance. Ray hits
behind visible opaque, depth-writing scene meshes are rejected, including
registered scene targets. The environment uses `frame.scene`, or the topmost
ancestor of its parent when no scene is supplied. `occlusion: { root, blocks,
exclude }` can restrict traversal, customize the per-intersection policy, or
skip meshes before raycasting. `occlusion: false` disables scene occlusion.
Transparent and non-depth-writing materials do not block by default; cutout
textures and custom shaders need an application policy because this CPU test
does not evaluate shader pixels. Invisible ancestors are excluded. Overlay
targets opt out with `occlusion: 'none'`. Registered panel meshes are handled
by panel arbitration, so blank `fallthrough` content stays transparent to input. Keep one
presentation mode per environment when using its default feedback; a custom
presenter may implement mixed rendering policy from resolved state.

An input source ID identifies a source lifetime, never a controller array index
or handedness. `group` and `precedence` prevent competing near/far techniques
from acquiring the same gesture. Existing capture keeps ownership. Input edges
are queued with their event pose in order, preserving interactions between
rendered frames. Frame timestamps and adapter `now()` must use the same
monotonic millisecond clock. Continuous sources omitted from a frame cancel;
returning to tracking does not invent a new begin. Explicit `forgetSource`
releases history as well as pointer registration.

WebXR uses `selectstart`, `select`, and `selectend`. Successful `select` completes;
`selectend` without `select` cancels at the next sample or before a subsequent
`selectstart`, retaining the interruption timestamp and pose. An interrupted
gesture followed by a new gesture between frames cannot steal its completion. Source removal, hidden
sessions and session end cancel. The adapter uses the actual frame from `xr.getFrame()` (or a supplied XRFrame) to detect pose loss
from `getPose`; when unavailable the adapter uses Three's connected controller
slots, with source identity tracked through connection events. Transient inputs
can use event-frame poses without a persistent controller or grip.

Capture retains target/widget identity while its manipulation projection is
recomputed on the current panel plane. It continues beyond panel bounds and
through panel movement. Parallel rays, singular transforms or lost tracking
cancel rather than reusing stale coordinates. Snapshots expose current hit,
hover, pressed target, capture, gesture and unbounded projection separately.
Presentation consumes this geometry once; custom feedback replaces presentation
without replacing routing. The default transparent beam ends at that point and
uses a ring whose size changes for press and drag, in addition to color. Beam
endpoints, marker orientation and physical marker size remain in world metres
under translated, rotated or nonuniformly scaled parents.

Completion delivers pointer-up to finish continuous edits even outside a panel.
Its `activationAllowed` flag records whether the shared router still resolves
the original target and subtarget. The panel adapter and embedded app forwarding
preserve this flag; a covered button cannot synthesize a press on release.
Direct runtime pointer input retains its usual behavior when the flag is omitted.

Headless checks cover routing, state, geometry, lifecycle and packed exports.
Physical headset checks remain required for visual alignment, readable targets,
comfortable placement, direct-touch ergonomics and measured frame cost.
