import * as THREE from "three";
import type { EmbeddedSurfaceService } from "../../../src/index.js";

export const WALL_PICTURE_COMPONENT_ID = "wall-picture-surface";
export const WALL_PICTURE_SOURCE_ID = "picture.shader";
export const WALL_PICTURE_SIZE = {
  width: 1024,
  height: 640
} as const;

export interface ShaderPictureSurfaceHandle {
  kind: "three-texture";
  texture: THREE.Texture;
}

export interface ShaderPictureSource {
  readonly handle: ShaderPictureSurfaceHandle;
  readonly size: {
    width: number;
    height: number;
  };
  render(renderer: THREE.WebGLRenderer, timestamp: number): void;
  publish(surfaces: EmbeddedSurfaceService, timestamp: number): void;
  unpublish(surfaces: EmbeddedSurfaceService): void;
  dispose(): void;
}

export function createShaderPictureSource(options?: {
  width?: number;
  height?: number;
}): ShaderPictureSource {
  const size = {
    width: options?.width ?? WALL_PICTURE_SIZE.width,
    height: options?.height ?? WALL_PICTURE_SIZE.height
  };
  const target = new THREE.WebGLRenderTarget(size.width, size.height, {
    depthBuffer: false,
    stencilBuffer: false
  });
  target.texture.colorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      resolution: { value: new THREE.Vector2(size.width, size.height) }
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform float time;
      uniform vec2 resolution;
      varying vec2 vUv;

      vec3 palette(float t) {
        vec3 a = vec3(0.22, 0.18, 0.16);
        vec3 b = vec3(0.64, 0.48, 0.28);
        vec3 c = vec3(0.90, 0.52, 0.16);
        vec3 d = vec3(0.24, 0.32, 0.58);
        return a + b * cos(6.28318 * (c * t + d));
      }

      void main() {
        vec2 p = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0) * 2.4;
        vec2 c = vec2(-0.72 + 0.08 * sin(time * 0.12), 0.24 + 0.06 * cos(time * 0.18));
        vec2 z = p;
        float trap = 1000.0;
        float escape = 0.0;

        for (int i = 0; i < 48; i += 1) {
          z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
          trap = min(trap, length(z - vec2(0.25, -0.15)));
          if (dot(z, z) > 16.0) {
            escape = float(i) / 48.0;
            break;
          }
        }

        float glow = exp(-8.0 * trap);
        float bands = 0.5 + 0.5 * cos(18.0 * trap - time * 1.2);
        vec3 color = palette(escape + glow * 0.25 + bands * 0.08);
        color += vec3(0.18, 0.10, 0.05) * glow;
        color *= 0.82 + 0.18 * smoothstep(0.0, 1.0, escape + glow);

        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
  const uniforms = material.uniforms as {
    time: { value: number };
    resolution: { value: THREE.Vector2 };
  };

  const quad = new THREE.Mesh(geometry, material);
  scene.add(quad);

  const handle: ShaderPictureSurfaceHandle = {
    kind: "three-texture",
    texture: target.texture
  };

  return {
    handle,
    size,
    render(renderer, timestamp) {
      uniforms.time.value = timestamp / 1000;
      const previousTarget = renderer.getRenderTarget();
      const previousViewport = renderer.getViewport(new THREE.Vector4());
      const previousScissor = renderer.getScissor(new THREE.Vector4());
      const previousScissorTest = renderer.getScissorTest();
      const previousXrEnabled = renderer.xr.enabled;

      // Render the offscreen picture in a plain mono pass so XR view state
      // does not leak into the composite source texture.
      renderer.xr.enabled = false;
      renderer.setRenderTarget(target);
      renderer.setViewport(0, 0, size.width, size.height);
      renderer.setScissor(0, 0, size.width, size.height);
      renderer.setScissorTest(false);
      try {
        renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.setViewport(previousViewport);
        renderer.setScissor(previousScissor);
        renderer.setScissorTest(previousScissorTest);
        renderer.xr.enabled = previousXrEnabled;
      }
    },
    publish(surfaces, timestamp) {
      surfaces.publish(WALL_PICTURE_SOURCE_ID, {
        available: true,
        handle,
        sourceWidth: size.width,
        sourceHeight: size.height,
        lastFrameTimestamp: timestamp,
        refreshState: "updating",
        sourceType: "three-texture"
      });
    },
    unpublish(surfaces) {
      surfaces.unpublish(WALL_PICTURE_SOURCE_ID);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      target.dispose();
    }
  };
}
