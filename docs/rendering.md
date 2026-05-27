# Rendering

`touch-os` renders through one UI tree and one draw-command path:

```text
DisplayNode tree -> DisplayRuntime -> RenderSnapshot -> DrawCommand[]
```

Apps and components do not draw to canvas, Three.js, DOM, WebXR, or host-native APIs directly. Apps return `DisplayNode`; components return `DrawCommand[]`; hosts interpret draw commands.

## Shared Canvas Snapshot Renderer

Canvas-like renderers use the internal shared module `src/rendering/canvas-snapshot-renderer.ts`, specifically `drawRenderSnapshotToCanvasContext(...)` and `drawCommandToCanvasContext(...)`.

The Three host canvas renderer and child-runtime snapshot handles both delegate to this implementation. That keeps command semantics identical for direct runtime rendering, embedded child-runtime snapshots, same-runtime app windows, and child-runtime app windows.

## Command Semantics

- `rect` honors `radius`; it uses `roundRect` when available and a manual arc path when `roundRect` is unavailable.
- `clipRect` is applied before every command type.
- `text` uses shared `fontWeight`, `fontSize`, `align`, `verticalAlign`, color, and max-width behavior.
- `bitmap` uses shared `fit`, `opacity`, and `sampling`; `globalAlpha` and `imageSmoothingEnabled` are restored after drawing.
- `surface` with `compositionMode: "copy"` draws through the shared renderer when the handle is a touch-os render snapshot.
- `surface` with `compositionMode: "composite"` is reserved for host composition and is not rasterized into the shared canvas.
- `mirrorX` mirrors copied surfaces inside the command rect.

Presentation skins are not renderers. A desktop shell, tablet shell, HUD, cockpit panel, or nested runtime can choose where an app appears, but command interpretation stays in renderer backends.

## Embedded Surface Rendering Paths

Embedded surfaces are normal layout items backed by host-owned visual content. A component or app chooses the source and broad composition intent; the host chooses the concrete rendering backend.

Use the shared canvas path for ordinary UI:

- vector controls, text, icons, and simple charts
- runtime-managed bitmaps that belong visually inside the panel texture
- content that must be clipped and blended exactly with the surrounding UI surface

Use `compositionMode: "copy"` for external content that can be rasterized into the shared canvas snapshot:

- child-runtime snapshots
- low-rate previews
- simple mirrored or camera-style content where one extra copy is acceptable

Use `compositionMode: "composite"` for live or high-detail content that should not be baked into the shared panel canvas:

- video
- GPU render targets
- camera feeds
- high-frequency shader content
- nested child runtimes that contain their own GPU-backed surfaces

In the Three.js host, a composite `three-texture` source is currently presented as a panel-local mesh positioned over the shared panel mesh. This avoids copying the source into the panel canvas, preserves independent texture filtering, and lets nested composite surfaces bubble through child-runtime snapshots. It is still part of the normal Three/WebXR scene render.

Native or XR compositor layers are a stronger host optimization, not a separate app-facing surface type. A host may choose to present a composite source through a platform layer such as a WebXR quad/media layer when the platform supports it, while retaining a scene mesh as the universal fallback and interaction proxy. This can improve video or dense text quality because the compositor layer is not sampled through the same scene projection pass. It may not match normal scene depth, clipping, or ordering exactly, so hosts should apply it only where those tradeoffs are acceptable.

## Host Quality Optimizations

Hosts should keep rendering quality policy outside application code. The same app surface should work on a wall panel, HUD, arm tablet, desktop canvas, or future browser host.

Recommended host-side policies:

- Use mipmapped and anisotropic filtering for minified Three.js texture composites when the renderer supports it.
- Prefer `compositionMode: "composite"` for video, live GPU surfaces, camera feeds, and high-frequency shader content.
- Keep a normal scene-mesh composite fallback even when a native compositor layer is available.
- Route associated media audio in the host, where listener pose and physical source placement are known.
- In XR, avoid maximum foveation for applications with high-contrast detail, text, stars, or video near the edge of the field of view. Lower foveation values improve visual stability at the cost of GPU work.
- For tiny high-contrast content such as stars or point plots, avoid raw one-pixel hard cutoffs. Prefer a minimum screen-space or angular size, soft sprites, filtered atlases, or stable LOD thresholds with hysteresis.

These optimizations do not change draw-command semantics. They are renderer and host decisions made after the runtime has produced a `RenderSnapshot`.
