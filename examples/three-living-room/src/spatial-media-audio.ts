import * as THREE from "three";

export interface SpatialMediaAudio {
  readonly listener: THREE.AudioListener;
  readonly source: THREE.PositionalAudio;
  attach(parent: THREE.Object3D): void;
  resume(): Promise<void>;
  dispose(): void;
}

export function createSpatialMediaAudio(options: {
  camera: THREE.Camera;
  mediaElement: HTMLMediaElement;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  volume?: number;
}): SpatialMediaAudio {
  const listener = new THREE.AudioListener();
  options.camera.add(listener);

  const source = new THREE.PositionalAudio(listener);
  source.setMediaElementSource(options.mediaElement);
  source.setRefDistance(options.refDistance ?? 1.8);
  source.setMaxDistance(options.maxDistance ?? 9);
  source.setRolloffFactor(options.rolloffFactor ?? 1.15);
  source.setVolume(options.volume ?? 1);

  let parent: THREE.Object3D | undefined;

  return {
    listener,
    source,
    attach(nextParent) {
      if (parent === nextParent) {
        return;
      }

      source.parent?.remove(source);
      parent = nextParent;
      parent.add(source);
    },
    async resume() {
      if (listener.context.state === "suspended") {
        await listener.context.resume();
      }
    },
    dispose() {
      source.disconnect();
      source.parent?.remove(source);
      listener.parent?.remove(listener);
      parent = undefined;
    }
  };
}
