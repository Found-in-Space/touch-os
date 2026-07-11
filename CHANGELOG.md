# Changelog

## 0.3.0

`0.3.0` hardens the existing runtime and Three.js host contracts without adding a new application framework.

Highlights:

- observable service invalidation and explicit runtime invalidation methods;
- no-op surface, root, child-runtime, Canvas, and texture update paths;
- monotonic host-frame timing and frame-driven long-press/repeat behavior;
- continuous pointer-source cancellation on tracking loss and lifecycle cleanup;
- reversible Three host detachment and final, idempotent disposal;
- hidden or disposed Three panel sessions become unavailable to panel coordination immediately;
- identical default app-event behavior in same-runtime and child-runtime shells;
- corrected panel routing ownership through separate `panelKey` and `ownerKey` fields;
- empty-clip correctness, clipped Three composites, and bounded presenter cleanup;
- UI-oriented Three material, color-space, and persistent texture-quality defaults;
- themed font families and non-distorting text clipping/ellipsis;
- strict package, coverage, browser-rendering, example, and audit release gates.

See the [0.2 to 0.3 migration guide](./docs/usage.md#migrate-from-02-to-03) for before/after examples of each intentional contract correction.
