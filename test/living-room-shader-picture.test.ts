import * as THREE from "three";
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

interface ShaderPictureRenderTestRenderer {
  xr: {
    enabled: boolean;
  };
  getRenderTarget(): unknown;
  setRenderTarget(target: unknown): void;
  getViewport(target: THREE.Vector4): THREE.Vector4;
  setViewport(xOrViewport: number | THREE.Vector4, y?: number, width?: number, height?: number): void;
  getScissor(target: THREE.Vector4): THREE.Vector4;
  setScissor(xOrScissor: number | THREE.Vector4, y?: number, width?: number, height?: number): void;
  getScissorTest(): boolean;
  setScissorTest(nextValue: boolean): void;
  render(): void;
}

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

  it("renders the shader picture with XR disabled and restores renderer state", () => {
    const source = createShaderPictureSource({
      width: 512,
      height: 320
    });
    const savedViewport = new THREE.Vector4(7, 11, 13, 17);
    const savedScissor = new THREE.Vector4(19, 23, 29, 31);
    const previousTarget = { kind: "previous-target" };
    const xrEnabledDuringRender: boolean[] = [];
    const viewportCalls: Array<readonly [number, number, number, number]> = [];
    const scissorCalls: Array<readonly [number, number, number, number]> = [];
    const renderTargetCalls: unknown[] = [];
    let scissorTest = true;

    const renderer: ShaderPictureRenderTestRenderer = {
      xr: { enabled: true },
      getRenderTarget() {
        return previousTarget;
      },
      setRenderTarget(nextTarget: unknown) {
        renderTargetCalls.push(nextTarget);
      },
      getViewport(target: THREE.Vector4) {
        return target.copy(savedViewport);
      },
      setViewport(
        xOrViewport: number | THREE.Vector4,
        y?: number,
        width?: number,
        height?: number
      ) {
        if (xOrViewport instanceof THREE.Vector4) {
          viewportCalls.push([xOrViewport.x, xOrViewport.y, xOrViewport.z, xOrViewport.w]);
          return;
        }
        viewportCalls.push([xOrViewport, y ?? 0, width ?? 0, height ?? 0]);
      },
      getScissor(target: THREE.Vector4) {
        return target.copy(savedScissor);
      },
      setScissor(
        xOrScissor: number | THREE.Vector4,
        y?: number,
        width?: number,
        height?: number
      ) {
        if (xOrScissor instanceof THREE.Vector4) {
          scissorCalls.push([xOrScissor.x, xOrScissor.y, xOrScissor.z, xOrScissor.w]);
          return;
        }
        scissorCalls.push([xOrScissor, y ?? 0, width ?? 0, height ?? 0]);
      },
      getScissorTest() {
        return scissorTest;
      },
      setScissorTest(nextValue: boolean) {
        scissorTest = nextValue;
      },
      render() {
        xrEnabledDuringRender.push(this.xr.enabled);
      }
    };

    source.render(renderer as unknown as THREE.WebGLRenderer, 1234);

    expect(xrEnabledDuringRender).toEqual([false]);
    expect(renderTargetCalls).toHaveLength(2);
    expect(viewportCalls).toEqual([
      [0, 0, 512, 320],
      [7, 11, 13, 17]
    ]);
    expect(scissorCalls).toEqual([
      [0, 0, 512, 320],
      [19, 23, 29, 31]
    ]);
    expect(scissorTest).toBe(true);
    expect(renderer.xr.enabled).toBe(true);

    source.dispose();
  });
});
