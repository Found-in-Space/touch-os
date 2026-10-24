/** Optional Three integration. Importing this module loads pointer-events' documented prototype hooks. */
import * as THREE from "three";
import { Pointer, type Intersector, type Intersection } from "@pmndrs/pointer-events";
import { createInteractionContext, resolveInteractionHit } from "../interaction/context.js";
import type { InteractionHit, InteractionResolver, InteractionSource, InteractionTarget } from "../interaction/contracts.js";
import { createOcclusionQuery, type ThreeInteractionOcclusion } from "./interaction-occlusion.js";

export interface ThreeInteractionOptions { occlusion?: ThreeInteractionOcclusion }

/** Bounded adaptation for pointer-events 6.6.32, which has no public unregister method. */
export function createThreeInteractionResolver(options: ThreeInteractionOptions = {}): InteractionResolver {
  const occlusionDistance = options.occlusion ? createOcclusionQuery(options.occlusion) : undefined;
  const pointers = new Map<string, Pointer>();
  let disposed = false;
  const root = new THREE.Object3D();
  root.pointerEvents = "auto";
  const miss = new THREE.Object3D();
  const camera = new THREE.PerspectiveCamera();
  let source: InteractionSource;
  let targets: readonly InteractionTarget[] = [];
  let result: InteractionHit | undefined;
  const intersector: Intersector = {
    isReady: () => source.tracked,
    startIntersection() { result = undefined; },
    executeIntersection() {
      let distance: number | undefined;
      result = resolveInteractionHit(source, targets, (hit, target) => {
        if (!occlusionDistance || !source.ray || target.occlusion === "none") return true;
        distance ??= occlusionDistance(source);
        return hit.distance <= distance + 1e-7 * Math.max(1, hit.distance);
      });
    },
    finalizeIntersection() { return toIntersection(); },
    // Capture is coordinated in the headless context; the projector returns the current face point.
    intersectPointerCapture() { return toIntersection(); }
  };
  function toIntersection(): Intersection {
    const point = new THREE.Vector3().copy(result?.point ?? { x: 0, y: 0, z: 0 });
    return { object: result ? root : miss, distance: result?.distance ?? Infinity,
      point, pointOnFace: point.clone(), localPoint: new THREE.Vector3(result?.local.x ?? 0, result?.local.y ?? 0, 0),
      pointerPosition: new THREE.Vector3().copy(source.ray?.origin ?? source.contact ?? { x: 0, y: 0, z: 0 }),
      pointerQuaternion: new THREE.Quaternion(), details: { type: "ray" } };
  }
  function releaseSource(id: string) {
    const pointer = pointers.get(id);
    if (!pointer) return;
    pointer.cancel({ timeStamp: 0 });
    // Delete only our exact registration, never a pointer belonging to another context.
    const registry = globalThis.pointerEventspointerMap;
    if (registry?.get(pointer.id) === pointer) registry.delete(pointer.id);
    pointers.delete(id);
  }
  return {
    resolve(nextSource, nextTargets) {
      if (disposed) throw new Error("Three interaction resolver is disposed.");
      source = nextSource; targets = nextTargets;
      let pointer = pointers.get(source.id);
      if (!pointer) {
        let id = -1;
        while (globalThis.pointerEventspointerMap?.has(id)) --id;
        pointer = new Pointer(id, source.pointerType, undefined, intersector, () => camera);
        pointers.set(source.id, pointer);
      }
      pointer.computeIntersection("pointer", root, { timeStamp: 0 });
      return result;
    },
    releaseSource,
    dispose() { if (disposed) return; for (const id of pointers.keys()) releaseSource(id); root.clear(); disposed = true; }
  };
}
export function createThreeInteractionContext(options: ThreeInteractionOptions = {}) {
  return createInteractionContext({ resolver: createThreeInteractionResolver(options) });
}
