import { describe, expect, it } from "vitest";
import { createEmbeddedSurfaceService } from "../src/index.js";
import {
  MIRROR_COMPONENT_ID,
  publishMirrorSurface
} from "../examples/three-living-room/src/mirror.js";

describe("living room mirror bridge", () => {
  it("publishes a live canvas-backed surface handle for the rear-view panel", () => {
    const surfaces = createEmbeddedSurfaceService();

    publishMirrorSurface(
      surfaces,
      MIRROR_COMPONENT_ID,
      {
        width: 640,
        height: 360
      },
      42
    );

    expect(surfaces.getAttachment(MIRROR_COMPONENT_ID)).toMatchObject({
      available: true,
      sourceWidth: 640,
      sourceHeight: 360,
      lastFrameTimestamp: 42,
      refreshState: "updating",
      forwardedEvents: []
    });
    expect(surfaces.getAttachment(MIRROR_COMPONENT_ID)?.handle).toMatchObject({
      image: {
        width: 640,
        height: 360
      }
    });
  });
});
