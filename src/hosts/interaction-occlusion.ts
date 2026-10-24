import * as THREE from "three";
import type { InteractionSource } from "../interaction/contracts.js";

export interface ThreeInteractionOcclusion {
  /** Limit traversal to the scene or an explicit group of occluders. */
  root: THREE.Object3D | (() => THREE.Object3D);
  /** Skip meshes before raycasting, for example surfaces already handled by registered targets. */
  exclude?: (object: THREE.Object3D) => boolean;
  /** Override material policy, for example for cutout textures or custom shaders. Invisible ancestors remain excluded. */
  blocks?: (intersection: THREE.Intersection) => boolean;
}

/** Default policy: visible, opaque, depth-writing mesh faces. Texture/shader alpha needs an explicit policy. */
export function blocksInteractionRay(intersection: THREE.Intersection): boolean {
  const mesh = intersection.object as THREE.Mesh;
  const material = Array.isArray(mesh.material) ? mesh.material[intersection.face?.materialIndex ?? 0] : mesh.material;
  return !!material && material.visible && material.depthWrite && !material.transparent && material.opacity > 0;
}

export function createOcclusionQuery(options: ThreeInteractionOcclusion): (source: InteractionSource) => number {
  const raycaster = new THREE.Raycaster();
  const intersections: THREE.Intersection[] = [];
  return source => {
    if (!source.ray) return Infinity;
    raycaster.ray.origin.copy(source.ray.origin);
    raycaster.ray.direction.copy(source.ray.direction).normalize();
    const root = typeof options.root === "function" ? options.root() : options.root;
    for (let ancestor: THREE.Object3D | null = root.parent; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return Infinity;
    root.updateWorldMatrix(true, true);
    intersections.length = 0;
    root.traverseVisible(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || options.exclude?.(mesh)) return;
      // Do not raycast transparent particle meshes when the default policy already excludes them.
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!options.blocks && !materials.some(material => material.visible && material.depthWrite && !material.transparent && material.opacity > 0)) return;
      raycaster.intersectObject(mesh, false, intersections);
    });
    const blocks = options.blocks ?? blocksInteractionRay;
    let distance = Infinity;
    for (const intersection of intersections) if (intersection.distance < distance && blocks(intersection)) distance = intersection.distance;
    return distance;
  };
}
