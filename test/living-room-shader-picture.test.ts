import { describe, expect, it } from "vitest";
import { createEmbeddedSurfaceService, createRuntime } from "../src/index.js";
import { findCommandByRole } from "./helpers/runtime-helpers.js";
import {
  createWallPictureRoot,
  getWallPictureSurface,
  getWallPictureTheme
} from "../examples/three-living-room/src/panel-ui.js";
import {
  createShaderPictureSource,
  WALL_PICTURE_SOURCE_ID
} from "../examples/three-living-room/src/shader-picture.js";

describe("living room shader picture", () => {
  it("publishes a live texture-backed source for the composite wall picture", () => {
    const surfaces = createEmbeddedSurfaceService();
    const source = createShaderPictureSource({
      width: 512,
      height: 320
    });

    source.publish(surfaces, 42);

    expect(surfaces.getSource(WALL_PICTURE_SOURCE_ID)).toMatchObject({
      available: true,
      sourceWidth: 512,
      sourceHeight: 320,
      lastFrameTimestamp: 42,
      refreshState: "updating",
      sourceType: "three-texture",
      surfaceRevision: 1
    });
    expect(surfaces.getSource(WALL_PICTURE_SOURCE_ID)?.handle).toMatchObject({
      kind: "three-texture"
    });

    source.dispose();
  });

  it("renders the wall picture as a composite embedded surface", () => {
    const surfaces = createEmbeddedSurfaceService();
    const source = createShaderPictureSource({
      width: 512,
      height: 320
    });
    source.publish(surfaces, 42);

    const runtime = createRuntime({
      root: createWallPictureRoot(),
      surface: getWallPictureSurface(),
      theme: getWallPictureTheme(),
      services: { surfaces }
    });

    const snapshot = runtime.render();
    const viewport = findCommandByRole(snapshot.commands, "embedded-surface-viewport");
    if (viewport.type !== "surface") {
      throw new Error("Expected the wall picture viewport to render as a surface command.");
    }

    expect(viewport.compositionMode).toBe("composite");
    expect(viewport.sourceId).toBe(WALL_PICTURE_SOURCE_ID);
    expect(viewport.surfaceRevision).toBe(1);

    source.dispose();
  });
});
