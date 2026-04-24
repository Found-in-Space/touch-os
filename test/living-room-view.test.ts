import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  getPresentationSurfaceMetrics,
  resolvePresentationCamera
} from "../examples/three-living-room/src/view.js";

describe("living room XR view helpers", () => {
  it("uses the XR presentation camera when a session is active", () => {
    const userCamera = new THREE.PerspectiveCamera();
    const xrCamera = new THREE.ArrayCamera();
    const getCamera = vi.fn(() => xrCamera);
    const renderer = {
      xr: {
        isPresenting: true,
        getCamera
      }
    } as unknown as Pick<THREE.WebGLRenderer, "xr">;

    expect(resolvePresentationCamera(renderer, userCamera)).toBe(xrCamera);
    expect(getCamera).toHaveBeenCalledOnce();
  });

  it("falls back to the renderer size when no XR viewport is available", () => {
    const renderer = {
      getSize(target: THREE.Vector2) {
        return target.set(1280, 720);
      },
      getPixelRatio() {
        return 2;
      }
    } as unknown as Pick<THREE.WebGLRenderer, "getPixelRatio" | "getSize">;

    expect(getPresentationSurfaceMetrics(renderer, new THREE.PerspectiveCamera())).toEqual({
      width: 1280,
      height: 720,
      pixelDensity: 2
    });
  });

  it("uses the first XR eye viewport for presentation-sized HUD surfaces", () => {
    const leftCamera = new THREE.PerspectiveCamera();
    const rightCamera = new THREE.PerspectiveCamera();
    (leftCamera as THREE.PerspectiveCamera & { viewport?: THREE.Vector4 }).viewport =
      new THREE.Vector4(0, 0, 960, 1080);
    (rightCamera as THREE.PerspectiveCamera & { viewport?: THREE.Vector4 }).viewport =
      new THREE.Vector4(960, 0, 960, 1080);
    const xrCamera = new THREE.ArrayCamera([leftCamera, rightCamera]);
    const renderer = {
      getSize(target: THREE.Vector2) {
        return target.set(1280, 720);
      },
      getPixelRatio() {
        return 2;
      }
    } as unknown as Pick<THREE.WebGLRenderer, "getPixelRatio" | "getSize">;

    expect(getPresentationSurfaceMetrics(renderer, xrCamera)).toEqual({
      width: 960,
      height: 1080,
      pixelDensity: 1
    });
  });
});
