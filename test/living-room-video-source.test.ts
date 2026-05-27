import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  configureVideoTextureFiltering,
  type VideoTextureFilteringRenderer,
  type VideoTextureSource
} from "../examples/three-living-room/src/video-source.js";
import type { EmbeddedSurfaceService } from "../src/index.js";

describe("living room video source", () => {
  it("uses mipmapped anisotropic filtering when WebGL2 is available", () => {
    const texture = new THREE.Texture();
    const source = createMockVideoTextureSource(texture);

    configureVideoTextureFiltering(source, createMockRenderer(true, 8), {
      anisotropy: 6
    });

    expect(texture.generateMipmaps).toBe(true);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.anisotropy).toBe(6);
  });

  it("falls back to linear filtering without mipmaps on WebGL1", () => {
    const texture = new THREE.Texture();
    const source = createMockVideoTextureSource(texture);

    configureVideoTextureFiltering(source, createMockRenderer(false, 8));

    expect(texture.generateMipmaps).toBe(false);
    expect(texture.minFilter).toBe(THREE.LinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.anisotropy).toBe(1);
  });
});

function createMockRenderer(
  isWebGL2: boolean,
  maxAnisotropy: number
): VideoTextureFilteringRenderer {
  return {
    capabilities: {
      isWebGL2,
      getMaxAnisotropy() {
        return maxAnisotropy;
      }
    }
  };
}

function createMockVideoTextureSource(texture: THREE.Texture): VideoTextureSource {
  return {
    sourceId: "media.tv-video",
    handle: {
      kind: "three-texture",
      texture
    },
    video: {} as HTMLVideoElement,
    async play() {},
    pause() {},
    stop() {},
    setVolume() {},
    publish(_surfaces: EmbeddedSurfaceService, _timestamp: number) {},
    unpublish(_surfaces: EmbeddedSurfaceService) {},
    dispose() {}
  };
}
