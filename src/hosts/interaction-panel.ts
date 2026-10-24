import * as THREE from "three";
import type { DisplayRuntime } from "../core/runtime.js";
import type { InteractionCapture, InteractionGeometry, InteractionHit, InteractionSource, InteractionTarget } from "../interaction/contracts.js";
import type { ThreePanelHost } from "./three.js";

export function createThreePanelTarget(options: {
  id: string;
  runtime: DisplayRuntime;
  host: ThreePanelHost;
  priority?: number;
  occlusion?: "scene" | "none";
  background?: "block" | "fallthrough";
  enabled?: () => boolean;
  surfaceOnly?: boolean;
  flush?(): void;
}): InteractionTarget {
  const { runtime, host } = options;
  const geometry = host.mesh.geometry.parameters;
  const active = new Set<string>();
  function project(source: InteractionSource): InteractionGeometry | null {
    const metrics = host.getSurfaceMetrics();
    const mesh = host.mesh;
    if (source.surface?.targetId === options.id) {
      const { x, y } = source.surface;
      mesh.updateWorldMatrix(true, false);
      const point = new THREE.Vector3((x / metrics.width - 0.5) * geometry.width, (0.5 - y / metrics.height) * geometry.height, 0).applyMatrix4(mesh.matrixWorld);
      return { point, distance: 0, local: { x, y } };
    }
    mesh.updateWorldMatrix(true, false);
    if (!mesh.matrixWorld.elements.every(Number.isFinite) || mesh.matrixWorld.determinant() === 0) return null;
    const inverse = mesh.matrixWorld.clone().invert();
    let local: THREE.Vector3, distance: number;
    if (source.ray) {
      const ray = new THREE.Ray(new THREE.Vector3().copy(source.ray.origin), new THREE.Vector3().copy(source.ray.direction));
      if (!ray.origin.toArray().every(Number.isFinite) || !ray.direction.toArray().every(Number.isFinite) || ray.direction.lengthSq() === 0) return null;
      ray.direction.normalize();
      const localRay = ray.clone().applyMatrix4(inverse);
      if (localRay.direction.z === 0) return null;
      const t = -localRay.origin.z / localRay.direction.z;
      if (!Number.isFinite(t) || t < 0) return null;
      local = localRay.at(t, new THREE.Vector3());
      distance = local.clone().applyMatrix4(mesh.matrixWorld).distanceTo(ray.origin);
    } else if (source.contact) {
      local = new THREE.Vector3().copy(source.contact).applyMatrix4(inverse);
      if (Math.abs(local.z) > 0.015) return null;
      local.z = 0; distance = 0;
    } else return null;
    return {
      point: local.clone().applyMatrix4(mesh.matrixWorld), distance,
      local: { x: (local.x / geometry.width + 0.5) * metrics.width, y: (0.5 - local.y / geometry.height) * metrics.height }
    };
  }
  return {
    id: options.id,
    ...(options.priority === undefined ? {} : { priority: options.priority }),
    ...(options.occlusion === undefined ? {} : { occlusion: options.occlusion }),
    enabled() {
      if (options.enabled?.() === false) return false;
      if (options.surfaceOnly) return true;
      for (let object: THREE.Object3D | null = host.mesh; object; object = object.parent) if (!object.visible) return false;
      return true;
    },
    query(source): InteractionHit | null {
      if (options.surfaceOnly && source.surface?.targetId !== options.id) return null;
      const projection = project(source);
      if (!projection) return null;
      const { x, y } = projection.local, metrics = host.getSurfaceMetrics();
      if (x < 0 || y < 0 || x > metrics.width || y > metrics.height) return null;
      const hit = runtime.queryHit({ x, y });
      if (!hit && options.background === "fallthrough") return null;
      const bounds = hit ? runtime.getBounds(hit.componentId) : undefined;
      return { ...projection, targetId: options.id,
        ...(hit && bounds ? { subtargetId: hit.targetId, editorId: hit.componentId,
          metadata: { ...hit, componentLocal: { x: x - bounds.x, y: y - bounds.y } } } : {}) };
    },
    project,
    validCapture(capture: InteractionCapture) {
      if (!capture.start.editorId) return true;
      const bounds = runtime.getBounds(capture.start.editorId);
      if (!bounds) return false;
      const metadata = capture.start.metadata as { componentLocal: { x: number; y: number } };
      return !!runtime.queryHit({ x: bounds.x + metadata.componentLocal.x, y: bounds.y + metadata.componentLocal.y }, capture.start.editorId);
    },
    deliver(event) {
      const type = event.type === "begin" ? "pointer-down" : event.type === "complete" ? "pointer-up"
        : event.type === "cancel" ? "cancel" : event.type === "scroll" ? "scroll"
        : event.type === "update" || event.type === "hover" ? "pointer-move"
        : event.type === "leave" ? "pointer-move" : undefined;
      if (!type) return;
      // Hover is still queried during capture, but manipulation must receive only the unbounded projection.
      const pointerId = event.input.source.id;
      if ((event.type === "hover" || event.type === "leave") && active.has(pointerId)) return;
      if (event.type === "begin") active.add(pointerId);
      const local = event.type === "leave" ? { x: -1, y: -1 } : event.geometry.local;
      const base = { timestamp: event.input.timestamp, pointerId,
        pointerType: event.input.source.pointerType, surfaceX: local.x, surfaceY: local.y,
        ...(event.type === "complete" ? { activationAllowed: event.activationAllowed === true } : {}) };
      runtime.dispatchInput(type === "scroll" ? { ...base, type, deltaX: event.input.delta?.x ?? 0, deltaY: event.input.delta?.y ?? 0 } : { ...base, type });
      if (type === "pointer-up" || type === "cancel") active.delete(pointerId);
      options.flush?.();
    }
  };
}
