# HUD XR Issue

We are exploring an issue related to the HUD on the living room example. The HUD consists of a number of panels 
that should be shown on both the desktop and XR paths of the renderer. In XR we only want to see the 
'rear-view mirror'. 

## Summary

The `three-living-room` example behaves correctly in desktop mode, but the HUD path does not transition cleanly into XR mode.

The clearest symptom is:

- desktop mode works normally
- when entering XR, the wall-mounted mirrors and other non-HUD panel paths can update correctly
- the HUD overlay does not appear to reconcile into its XR layout
- instead, it appears to stay in its desktop layout and/or behave like a stale snapshot
- the top-left panel includes the state and this confirms 'Desktop' whilst the TV changes to 'XR'.
- the rear-view mirror just shows a blank wall.

This has been confusing because multiple distinct failure modes can look visually similar in-headset. We now have enough evidence to say the problem is specifically associated with the HUD host path, not with the rear-view feed itself.

## Confirmed Observations

### What works

- Desktop mode works.
  The HUD displays normally, interactions work, and the rear-view mirror behaves as expected.

- The rear-view mirror feed itself works.
  A second wall-mounted mirror was added back into the scene, and it shows a live view correctly.

- The same HUD runtime/content works when hosted on the hand.
  We temporarily routed the XR HUD through a right-hand `createHeldTabletDriver(...)` path, and it worked correctly there.

### What fails

- In XR, when the HUD is hosted through the normal `createHudHost(...)` / HUD layer path, it does not behave like the rest of the scene.

- The HUD appears to remain in desktop mode.
  Concrete example:
  the HUD still shows the desktop layout with all panels visible, and the mode readout still says `Desktop`.

- The HUD mirror appears stale or dead.
  It does not behave like the live wall mirror or the hand-hosted variant.

### Practical interpretation

The problem is not:

- the shared store in general
- the rear-view camera feed in general
- the embedded-surface bridge in general
- the HUD component tree in general

The problem does appear to be tied to the HUD-specific hosting/rendering path.

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
- the HUD host path is the unstable part

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

## Most Important Facts For Further Investigation

If a new investigator starts from scratch, these are the key points they should trust first:

- Desktop mode works.
- The wall mirror shows the rear-view feed live.
- The HUD behaves correctly when temporarily hosted on the hand.
- The normal HUD host path is the path that fails.
- In the failing case, the HUD appears to stay in desktop mode instead of reconciling into XR mode.
- The failure is not just “the mirror texture is stale”; the whole HUD presentation looks like a non-updating or dead host context.

## Open Questions

- Why does the HUD host path fail to reflect the XR-mode state while other hosts in the same example do?
- Is the HUD host using a camera/view/surface-metrics context that remains effectively tied to the desktop renderer state?
- Is there still an ordering issue between:
  store XR state,
  host update,
  offscreen mirror render,
  and HUD render?
- Is the HUD host being driven by the wrong camera or wrong surface metrics at the moment the root/layout should reconcile?
- Is the HUD host drawing correctly but reusing stale render output or stale host canvas content?

## Recommended Investigation Direction

Compare the working hand-hosted HUD test and the failing head/HUD-hosted version as directly as possible.

Specifically:

- compare the host update inputs frame-by-frame
- compare which camera / pose / surface metrics each host receives
- compare whether the HUD runtime revision actually changes when XR starts
- compare whether the HUD host canvas texture is redrawn even when the runtime changes

The key is to treat the hand-hosted version as the control case and the HUD-hosted version as the broken variant of the same content.
