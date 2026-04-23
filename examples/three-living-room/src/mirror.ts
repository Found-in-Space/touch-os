import type { EmbeddedSurfaceService } from "../../../src/index.js";

export interface MirrorCanvasSource {
  width: number;
  height: number;
}

export const MIRROR_COMPONENT_ID = "mirror-surface";
export const WALL_MIRROR_COMPONENT_ID = "wall-mirror-surface";

export function publishMirrorSurface(
  surfaces: EmbeddedSurfaceService,
  componentId: string,
  canvas: MirrorCanvasSource,
  timestamp: number
): void {
  surfaces.setState(componentId, {
    available: true,
    handle: { image: canvas },
    sourceWidth: canvas.width,
    sourceHeight: canvas.height,
    lastFrameTimestamp: timestamp,
    refreshState: "updating"
  });
}

export function clearMirrorSurface(
  surfaces: EmbeddedSurfaceService,
  componentId: string
): void {
  surfaces.setState(componentId, {
    available: false,
    handle: undefined,
    refreshState: "stale"
  });
}
