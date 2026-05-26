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
