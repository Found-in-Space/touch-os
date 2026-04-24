# HUD XR Issue

We are exploring an issue related to the HUD on the living room example. The HUD consists of a number of panels 
that should be shown on both the desktop and XR paths of the renderer. In XR we only want to see the 
'rear-view mirror'. 

## Summary

The `three-living-room` example behaves correctly in desktop mode, but the HUD path does not transition cleanly into XR mode.

The clearest current symptom is:

- desktop mode works normally
- when entering XR, the wall-mounted mirrors and other non-HUD panel paths can update correctly
- in the latest head-locked HUD experiment, the HUD does switch into its reduced XR layout
- the rear-view mirror in that HUD shows one valid camera frame instead of a blank wall
- after that initial XR update, the HUD appears to freeze rather than continue updating frame-to-frame

Earlier in the investigation, the clearest symptom looked different:

- the HUD appeared to remain in desktop layout
- the top-left panel still said `Desktop` while the TV said `XR`
- the rear-view mirror looked blank or dead

This has been confusing because multiple distinct failure modes can look visually similar in-headset. We now have enough evidence to say the problem is specifically associated with the HUD host path, not with the rear-view feed itself.

## Confirmed Observations

### What works

- Desktop mode works.
  The HUD displays normally, interactions work, and the rear-view mirror behaves as expected.

- The rear-view mirror feed itself works.
  A second wall-mounted mirror was added back into the scene, and it shows a live view correctly.

- The same HUD runtime/content works when hosted on the hand.
  We temporarily routed the XR HUD through a right-hand `createHeldTabletDriver(...)` path, and it worked correctly there.

- The head-locked HUD can now reconcile into XR mode at least once.
  In the latest experiment, the HUD reduced to the XR mirror-only presentation and the mirror displayed one valid frame.

### What fails

- In XR, when the HUD is hosted through the normal `createHudHost(...)` / HUD layer path, it does not behave like the rest of the scene.

- An example-specific camera-parented head-locked HUD path is also still unstable.
  This matters because it weakens the narrower theory that only the generic `createHudHost(...)` implementation is broken.

- The latest failing symptom is a freeze after initial XR success.
  Concrete example:
  the HUD enters its XR mirror-only layout, the mirror shows one real frame, and then the HUD appears to stop updating.

- Earlier failing symptoms included the HUD remaining in desktop mode and the mirror appearing blank or dead.

### Practical interpretation

The problem is not:

- the shared store in general
- the rear-view camera feed in general
- the embedded-surface bridge in general
- the HUD component tree in general
- the first XR reconciliation in general

The problem does appear to be tied to the head-locked HUD hosting/rendering path.

## Current Best Understanding

There are three important hosting contexts in this example:

1. Scene-mounted panels
   Example: TV panel, wall mirror.
   These behave correctly.

2. Hand/controller-anchored panels
   Example: wrist tablet, temporary right-hand HUD test.
   These behave correctly.

3. HUD/head-anchored panel path
   Example: the normal HUD overlay.
   This is the path that behaves incorrectly.

So far, the evidence suggests:

- the HUD content is fine
- the mirror source is fine
- the head-locked HUD path is the unstable part
- the latest experiment suggests the failure is not limited to one `createHudHost(...)` implementation detail
- the remaining issue is now better described as "updates stop after the first successful XR frame"

## Attempts Made So Far

This section intentionally includes both useful and disproven hypotheses so we do not keep retrying the same lines of attack.

### 1. Checked shared XR state flow

We traced the example store, runtime binding, and panel UI code because the TV could say `XR` while the HUD still said `Desktop`.

What we found:

- the store has shared `xrActive` state
- the panel UI does branch on `state.xrActive`
- tests covering HUD reconciliation passed locally

Conclusion:

- the static code path looked correct
- the bug was likely runtime/host integration, not just missing state plumbing

### 2. Moved the HUD mirror from top to bottom

This was done as a hot-reload sanity check.

Outcome:

- the visual change appeared correctly

Conclusion:

- the example was reloading properly
- the issue was not just stale dev-server output

### 3. Forced HUD runtime refresh after publishing mirror frames

Because the HUD mirror looked like a frozen frame, we tried explicitly refreshing the HUD runtime after every `publishMirrorSurface(...)`.

Outcome:

- did not resolve the issue

Conclusion:

- simple runtime invalidation was not the whole problem

### 4. Enabled `preserveDrawingBuffer` on the mirror renderer

This was meant to rule out stale `drawImage(...)` behavior from a WebGL canvas source.

Outcome:

- did not resolve the issue

Conclusion:

- browser canvas-copy behavior was not the only issue

### 5. Restored a second wall-mounted mirror

We added a separate scene-mounted mirror using the same rear-view source.

Outcome:

- the wall mirror showed a live rear-view feed correctly

Conclusion:

- the rear-view feed and scene-mounted host path are healthy

### 6. Temporarily moved the XR HUD onto the right hand

We replaced the XR HUD host path with a right-hand `createHeldTabletDriver(...)` test while keeping the HUD runtime/content effectively the same.

Outcome:

- this worked correctly

Conclusion:

- the HUD content is not inherently broken
- the difference is in how it is hosted

This is one of the strongest pieces of evidence we have.

### 7. Refactored `createHudHost(...)` to use the same explicit-anchor model as the tablet host

We generalized the host implementation so both tablet and HUD were built around an explicit anchor + local offset model.

Outcome:

- tests passed
- example still did not behave correctly in XR

Conclusion:

- the architectural cleanup was worthwhile
- but it did not, by itself, fix the runtime symptom

### 8. Suspected the rear-view camera was seeing the HUD plane

Because the HUD is a near-camera scene panel, we suspected the rear-view camera might be capturing the HUD itself, producing the appearance of a HUD snapshot inside the mirror.

We tried:

- render-layer isolation
- then reverted that because it hid the HUD entirely in XR
- then temporary hide/show of HUD-attached meshes during rear-view rendering

Outcome:

- these changes altered behavior, but did not fully solve the core problem

Conclusion:

- self-capture may be part of the confusion
- but it does not explain the full “HUD stays in desktop mode” symptom on its own

### 9. Routed HUD sizing and placement through XR presentation camera data

We updated the HUD path to:

- resolve surface metrics from the XR presentation camera / active XR viewport rather than desktop renderer size
- teach viewport-sized HUD sizing to use XR `ArrayCamera` eye projection data instead of assuming a plain perspective camera

Outcome:

- tests passed
- the in-headset symptom did not materially improve
- the HUD still looked like the desktop variant and the mirror still failed to update usefully

Conclusion:

- using XR presentation camera and viewport data was not sufficient by itself
- the bug was likely deeper than just "wrong size source" or "wrong XR camera projection math"

### 10. Replaced the example HUD path with a camera-parented scene panel

We then changed the living-room example so the HUD was no longer relying on the generic head-locked host implementation.

Instead, the example HUD mesh was:

- attached directly as a child of the user camera
- positioned locally in front of the camera
- scaled from the camera projection to fill the view plane

Outcome:

- this produced the first meaningful behavioral change
- the HUD now entered the reduced XR layout instead of remaining in desktop mode
- the HUD mirror showed one real camera frame instead of a blank wall
- after that initial XR frame, the HUD still appeared to freeze

Conclusion:

- the HUD can reconcile into XR mode at least once
- the mirror surface can publish and display at least one valid frame in the head-locked path
- the remaining problem is not just initial state reconciliation
- the next target should be whatever stops continuous updates after the first successful XR frame

## Most Important Facts For Further Investigation

If a new investigator starts from scratch, these are the key points they should trust first:

- Desktop mode works.
- The wall mirror shows the rear-view feed live.
- The HUD behaves correctly when temporarily hosted on the hand.
- A head-locked HUD path can now reconcile into XR mode at least once.
- A head-locked HUD path can now show one valid mirror frame at least once.
- After that first successful XR frame, the HUD still appears to freeze.
- The issue is therefore not just "HUD never received XR state" or "mirror source is always blank".
- The remaining failure is in sustained head-locked HUD updating, not just initial transition.

## Open Questions

- What causes the head-locked HUD path to stop updating after the first successful XR frame?
- Is the HUD runtime revision still changing after XR starts, or does the runtime itself stop redrawing after frame one?
- Is there still an ordering issue between:
  store XR state,
  host update,
  offscreen mirror render,
  and HUD render?
- Is the HUD host canvas texture being redrawn after the first XR frame, or is the last successful frame just being reused?
- Is the freeze caused by head-locked mesh placement/tracking, embedded-surface refresh, or runtime render invalidation after XR frame one?

## Recommended Investigation Direction

Compare the working hand-hosted HUD test and the failing head-locked HUD version as directly as possible, but focus specifically on frame one versus frame two and later.

Specifically:

- compare the host update inputs frame-by-frame
- compare which camera / pose / surface metrics each host receives
- compare whether the HUD runtime revision changes on the first XR frame and on subsequent XR frames
- compare whether the mirror `lastFrameTimestamp` keeps advancing after the first visible HUD frame
- compare whether the HUD host canvas texture is redrawn after frame one
- compare whether the HUD mesh transform continues changing with the camera after frame one

The key is to treat the hand-hosted version as the control case and the head-locked version as the broken variant of the same content, with the one-frame XR success now treated as the most important clue rather than as noise.
