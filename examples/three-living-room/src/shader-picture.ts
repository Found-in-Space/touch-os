import * as THREE from "three";
import {
  resolveCompositeSurfacePlacements,
  type EmbeddedSurfaceService,
  type ThreePanelHost
} from "../../../src/index.js";

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

export interface ShaderPicturePresenter {
  update(host: ThreePanelHost): void;
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
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(previousTarget);
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

export function createShaderPicturePresenter(parent: THREE.Object3D): ShaderPicturePresenter {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = 0.01;
  mesh.visible = false;
  parent.add(mesh);

  return {
    update(host) {
      const placement = resolveCompositeSurfacePlacements(host).find(
        (entry) => entry.componentId === WALL_PICTURE_COMPONENT_ID
      );
      if (!placement || !isShaderPictureSurfaceHandle(placement.command.handle)) {
        mesh.visible = false;
        return;
      }

      material.map = placement.command.handle.texture;
      material.needsUpdate = true;
      mesh.renderOrder = host.mesh.renderOrder + 1;
      mesh.position.set(placement.localCenter.x, placement.localCenter.y, 0.01);
      mesh.scale.set(
        placement.mirrorX ? -placement.size.width : placement.size.width,
        placement.size.height,
        1
      );
      mesh.visible = true;
    },
    dispose() {
      parent.remove(mesh);
      geometry.dispose();
      material.dispose();
    }
  };
}

export function isShaderPictureSurfaceHandle(handle: unknown): handle is ShaderPictureSurfaceHandle {
  return (
    typeof handle === "object" &&
    handle !== null &&
    "kind" in handle &&
    (handle as { kind?: unknown }).kind === "three-texture" &&
    "texture" in handle
  );
}
