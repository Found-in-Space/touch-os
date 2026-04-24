import * as THREE from "three";
import type { SurfaceMetrics } from "../../../src/index.js";

export function resolvePresentationCamera(
  renderer: Pick<THREE.WebGLRenderer, "xr">,
  camera: THREE.Camera
): THREE.Camera {
  return renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
}

export function getPresentationSurfaceMetrics(
  renderer: Pick<THREE.WebGLRenderer, "getPixelRatio" | "getSize">,
  camera: THREE.Camera
): Partial<SurfaceMetrics> {
  const viewport = resolveCameraViewport(camera);
  if (viewport) {
    return {
      width: viewport.width,
      height: viewport.height,
      pixelDensity: 1
    };
  }

  const size = new THREE.Vector2();
  renderer.getSize(size);
  return {
    width: size.x,
    height: size.y,
    pixelDensity: renderer.getPixelRatio()
  };
}

function resolveCameraViewport(
  camera: THREE.Camera
): { width: number; height: number } | undefined {
  const directViewport = getViewportForCamera(camera);
  if (directViewport) {
    return directViewport;
  }

  if (!isArrayCamera(camera)) {
    return undefined;
  }

  for (const subCamera of camera.cameras) {
    const viewport = getViewportForCamera(subCamera);
    if (viewport) {
      return viewport;
    }
  }

  return undefined;
}

function getViewportForCamera(
  camera: THREE.Camera
): { width: number; height: number } | undefined {
  const viewportCamera = camera as THREE.Camera & {
    viewport?: THREE.Vector4;
  };
  const viewport = viewportCamera.viewport;
  if (!viewport || viewport.z <= 0 || viewport.w <= 0) {
    return undefined;
  }

  return {
    width: viewport.z,
    height: viewport.w
  };
}

function isArrayCamera(camera: THREE.Camera): camera is THREE.ArrayCamera {
  return (camera as THREE.Camera & { isArrayCamera?: boolean }).isArrayCamera === true;
}
