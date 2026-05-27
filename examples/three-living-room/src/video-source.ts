import * as THREE from "three";
import type { EmbeddedSurfaceService } from "../../../src/index.js";

export const TV_VIDEO_SOURCE_ID = "media.tv-video";
export const DEFAULT_TV_VIDEO_URL = "https://data.foundin.space/touchos/video-sample.mp4";
export const TV_VIDEO_SIZE = {
  width: 1280,
  height: 720
} as const;

export interface VideoTextureSurfaceHandle {
  kind: "three-texture";
  texture: THREE.Texture;
}

export interface VideoTextureSource {
  readonly sourceId: string;
  readonly handle: VideoTextureSurfaceHandle;
  readonly video: HTMLVideoElement;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  setVolume(volume: number): void;
  publish(surfaces: EmbeddedSurfaceService, timestamp: number): void;
  unpublish(surfaces: EmbeddedSurfaceService): void;
  dispose(): void;
}

export function createVideoTextureSource(options: {
  url: string;
  sourceId?: string;
  width?: number;
  height?: number;
  loop?: boolean;
  muted?: boolean;
  volume?: number;
  crossOrigin?: "" | "anonymous" | "use-credentials";
}): VideoTextureSource {
  if (typeof document === "undefined") {
    throw new Error("Video texture sources require a browser document.");
  }

  const sourceId = options.sourceId ?? TV_VIDEO_SOURCE_ID;
  const fallbackWidth = options.width ?? TV_VIDEO_SIZE.width;
  const fallbackHeight = options.height ?? TV_VIDEO_SIZE.height;
  const video = document.createElement("video");
  video.crossOrigin = options.crossOrigin ?? "anonymous";
  video.loop = options.loop ?? true;
  video.muted = options.muted ?? false;
  video.volume = clampVolume(options.volume ?? 0.75);
  video.playsInline = true;
  video.preload = "auto";
  video.src = options.url;

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const handle: VideoTextureSurfaceHandle = {
    kind: "three-texture",
    texture
  };

  return {
    sourceId,
    handle,
    video,
    async play() {
      await video.play();
    },
    pause() {
      video.pause();
    },
    stop() {
      video.pause();
      if (video.readyState > 0) {
        try {
          video.currentTime = 0;
        } catch {
          // Some browsers reject seeks before metadata is fully usable.
        }
      }
    },
    setVolume(volume) {
      video.volume = clampVolume(volume);
      video.muted = video.volume === 0;
    },
    publish(surfaces, timestamp) {
      const width = video.videoWidth || fallbackWidth;
      const height = video.videoHeight || fallbackHeight;
      surfaces.publish(sourceId, {
        available: true,
        handle,
        sourceWidth: width,
        sourceHeight: height,
        aspectRatio: width / height,
        lastFrameTimestamp: timestamp,
        refreshState: video.paused ? "idle" : "updating",
        sourceType: "three-texture"
      });
    },
    unpublish(surfaces) {
      surfaces.unpublish(sourceId);
    },
    dispose() {
      video.pause();
      video.removeAttribute("src");
      video.load();
      texture.dispose();
    }
  };
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return 0.75;
  }
  return Math.max(0, Math.min(1, volume));
}
