import type { EmbeddedSurfaceService } from "../../../src/index.js";

export interface MirrorCanvasSource {
  width: number;
  height: number;
}

export const REAR_VIEW_SOURCE_ID = "camera.rear";
export const MIRROR_COMPONENT_ID = "mirror-surface";
export const XR_HUD_MIRROR_COMPONENT_ID = "xr-hud-mirror-surface";
export const WALL_MIRROR_COMPONENT_ID = "wall-mirror-surface";

export function publishMirrorSurface(
  surfaces: EmbeddedSurfaceService,
  sourceId: string,
  canvas: MirrorCanvasSource,
  timestamp: number
): void {
  surfaces.publish(sourceId, {
    available: true,
    handle: { image: canvas },
    sourceWidth: canvas.width,
    sourceHeight: canvas.height,
    lastFrameTimestamp: timestamp,
    refreshState: "updating",
    sourceType: "canvas-image"
  });
}

export function clearMirrorSurface(
  surfaces: EmbeddedSurfaceService,
  sourceId: string
): void {
  surfaces.unpublish(sourceId);
}
