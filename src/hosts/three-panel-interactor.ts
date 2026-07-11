import * as THREE from "three";
import {
  DEFAULT_MODIFIERS,
  type InputEvent,
  type ModifierState,
  type PointerType
} from "../core/events.js";
import type { DisplayRuntime } from "../core/runtime.js";
import type { SurfaceMetrics } from "../services/contracts.js";
import type {
  PanelInteractor,
  PointerClaimPolicy,
  PointerPresentationState,
  ThreePanelHostFrame,
  ThreePanelHostInputEvent,
  ThreePanelHit,
  ThreePanelMesh,
  ThreePointerPhase,
  ThreePointerSample,
  Vector3Like
} from "./three.js";

interface InteractorPointerState extends PointerPresentationState {
  captured: boolean;
  pressed: boolean;
  dispatched: boolean;
  pointerType: PointerType;
  pressure: number | undefined;
  modifiers: ModifierState;
  timestamp: number;
}

export interface PanelInteractorInternal extends PanelInteractor {
  getPointerIds(): readonly string[];
}

export interface PanelInteractorInternalOptions {
  runtime: DisplayRuntime;
  mesh: ThreePanelMesh;
  getSurfaceMetrics(): SurfaceMetrics;
  pointerClaimPolicy?: PointerClaimPolicy;
}

const CONTACT_PLANE_TOLERANCE_RATIO = 0.02;
const CONTACT_PLANE_TOLERANCE_MIN = 0.0025;
const CONTACT_PLANE_TOLERANCE_MAX = 0.01;
const CONTACT_NORMAL_ALIGNMENT_MIN = 0.25;

/** Stateful pointer interaction lifecycle shared by public interactors and panel drivers. */
export function createPanelInteractorInternal(
  options: PanelInteractorInternalOptions
): PanelInteractorInternal {
  const raycaster = new THREE.Raycaster();
  const states = new Map<string, InteractorPointerState>();
  const clearableStates = new Map<string, InteractorPointerState>();

  function resolveState(pointerId: string): InteractorPointerState {
    const existing = states.get(pointerId) ?? clearableStates.get(pointerId);
    if (existing) {
      return existing;
    }

    const created: InteractorPointerState = {
      pointerId,
      claimed: false,
      blocked: false,
      hit: null,
      active: false,
      captured: false,
      pressed: false,
      dispatched: false,
      pointerType: "unknown",
      pressure: undefined,
      modifiers: DEFAULT_MODIFIERS,
      timestamp: 0
    };
    states.set(pointerId, created);
    return created;
  }

  function cancelState(state: InteractorPointerState, timestamp?: number): void {
    if (!state.dispatched) {
      return;
    }

    options.runtime.dispatchInput({
      type: "cancel",
      timestamp: timestamp ?? state.timestamp,
      pointerId: state.pointerId,
      pointerType: state.pointerType,
      modifiers: state.modifiers,
      surfaceX: state.hit?.surfaceX ?? -1,
      surfaceY: state.hit?.surfaceY ?? -1,
      ...(state.pressure === undefined ? {} : { pressure: state.pressure })
    });
  }

  return {
    process(sample, frame) {
      const state = resolveState(sample.pointerId);
      state.pointerType = sample.pointerType;
      state.pressure = sample.pressure;
      state.modifiers = sample.modifiers ?? DEFAULT_MODIFIERS;
      state.timestamp = sample.timestamp;
      const metrics = options.getSurfaceMetrics();
      const hit = resolvePointerSampleHit(frame, sample, options.mesh, metrics, raycaster);

      let dispatched = false;
      let hostEvent: ThreePanelHostInputEvent | undefined;
      let currentHit: ThreePanelHit | null = null;
      let hasTargetHit = false;

      if (hit) {
        hostEvent = createHostEventFromSample(sample, hit);
        const dispatchResult = options.runtime.dispatchInput(
          createRuntimeInputEvent(hostEvent, sample.pointerId, hit.surfaceX, hit.surfaceY)
        );
        state.dispatched = true;
        dispatched = true;
        hasTargetHit = hasResolvedRuntimeTarget(dispatchResult.componentId, dispatchResult.targetId);
        if (hasTargetHit) {
          currentHit = {
            length: hit.distance,
            surfaceX: hit.surfaceX,
            surfaceY: hit.surfaceY,
            componentId: dispatchResult.componentId,
            targetId: dispatchResult.targetId,
            pointerId: sample.pointerId,
            source: sample.transport === "contact" ? "contact" : hostEvent.source,
            blocked: false
          };
        }
      } else if (state.dispatched) {
        hostEvent =
          sample.phase === "move" ? createMissMoveHostEvent(sample) : createCancelHostEvent(sample);
        const surfaceX = state.captured && state.hit ? state.hit.surfaceX : -1;
        const surfaceY = state.captured && state.hit ? state.hit.surfaceY : -1;
        options.runtime.dispatchInput(
          sample.phase === "move"
            ? createRuntimeInputEvent(hostEvent, sample.pointerId, surfaceX, surfaceY)
            : createCancelInputEvent(hostEvent, sample.pointerId, surfaceX, surfaceY)
        );
        dispatched = true;
        if (sample.phase !== "move") {
          state.dispatched = false;
        }
      }

      state.active = sample.phase !== "up" && sample.phase !== "cancel";
      if (sample.phase === "down") {
        state.pressed = true;
        state.captured = hasTargetHit;
      }
      const hasCapturedPress = state.captured;
      if (sample.phase === "up" || sample.phase === "cancel") {
        state.pressed = false;
        state.captured = false;
      }

      const claimed = resolvePointerClaim(
        options.pointerClaimPolicy ?? "block-on-hit",
        hasTargetHit,
        hasCapturedPress
      );
      const blocked = resolvePointerBlocking(
        options.pointerClaimPolicy ?? "block-on-hit",
        hasTargetHit,
        hasCapturedPress
      );

      state.claimed = claimed;
      state.blocked = blocked;
      state.hit = currentHit
        ? { ...currentHit, blocked }
        : hasCapturedPress && state.hit
          ? { ...state.hit, blocked }
          : null;

      if (sample.phase === "cancel") {
        state.hit = null;
        states.delete(sample.pointerId);
        clearableStates.delete(sample.pointerId);
      } else if (sample.phase === "up") {
        states.delete(sample.pointerId);
        if (state.dispatched) {
          clearableStates.set(sample.pointerId, state);
        } else {
          clearableStates.delete(sample.pointerId);
        }
      } else {
        states.set(sample.pointerId, state);
        if (state.dispatched) {
          clearableStates.set(sample.pointerId, state);
        }
      }

      return {
        hit: state.hit ? { ...state.hit } : null,
        claimed,
        blocked,
        dispatched,
        ...(hostEvent ? { hostEvent } : {})
      };
    },
    getPointerState(pointerId) {
      const state = states.get(pointerId);
      return state
        ? {
            pointerId: state.pointerId,
            claimed: state.claimed,
            blocked: state.blocked,
            hit: state.hit ? { ...state.hit } : null,
            active: state.active
          }
        : undefined;
    },
    getPointerIds() {
      return [...new Set([...states.keys(), ...clearableStates.keys()])];
    },
    clear(pointerId, timestamp) {
      if (pointerId) {
        const state = states.get(pointerId) ?? clearableStates.get(pointerId);
        if (state) {
          cancelState(state, timestamp);
        }
        states.delete(pointerId);
        clearableStates.delete(pointerId);
        return;
      }
      const trackedStates = new Set([...states.values(), ...clearableStates.values()]);
      for (const state of trackedStates) {
        cancelState(state, timestamp);
      }
      states.clear();
      clearableStates.clear();
    }
  };
}

export function resolvePointerBlocking(
  policy: PointerClaimPolicy,
  hasTargetHit: boolean,
  hasCapturedPress: boolean
): boolean {
  switch (policy) {
    case "passthrough":
    case "manual":
      return false;
    case "block-on-press":
      return hasCapturedPress;
    case "block-on-hit":
    default:
      return hasTargetHit || hasCapturedPress;
  }
}

export function hasResolvedRuntimeTarget(
  componentId: string | undefined,
  targetId: string | undefined
): boolean {
  return typeof componentId === "string" && typeof targetId === "string";
}

export function toSurfaceHit(
  hit: THREE.Intersection<THREE.Object3D>,
  metrics: SurfaceMetrics
): { surfaceX: number; surfaceY: number; distance: number } {
  return {
    surfaceX: (hit.uv?.x ?? 0) * metrics.width,
    surfaceY: (1 - (hit.uv?.y ?? 0)) * metrics.height,
    distance: hit.distance
  };
}

export function createRuntimeInputEvent(
  event: ThreePanelHostInputEvent,
  pointerId: string,
  surfaceX: number,
  surfaceY: number
): InputEvent {
  const base = createInputEventBase(event, pointerId, surfaceX, surfaceY);
  if (event.type === "scroll") {
    return {
      ...base,
      type: "scroll",
      deltaX: event.deltaX ?? 0,
      deltaY: event.deltaY ?? 0
    };
  }

  return {
    ...base,
    type: event.type
  };
}

export function createCancelInputEvent(
  event: ThreePanelHostInputEvent,
  pointerId: string,
  surfaceX = -1,
  surfaceY = -1
): InputEvent {
  return {
    ...createInputEventBase(event, pointerId, surfaceX, surfaceY),
    type: "cancel"
  };
}

function resolvePointerClaim(
  policy: PointerClaimPolicy,
  hasTargetHit: boolean,
  hasCapturedPress: boolean
): boolean {
  switch (policy) {
    case "block-on-press":
      return hasCapturedPress;
    case "passthrough":
    case "manual":
      return hasTargetHit || hasCapturedPress;
    case "block-on-hit":
    default:
      return hasTargetHit || hasCapturedPress;
  }
}

function resolvePointerSampleHit(
  frame: ThreePanelHostFrame,
  sample: ThreePointerSample,
  mesh: ThreePanelMesh,
  metrics: SurfaceMetrics,
  raycaster: THREE.Raycaster
): { surfaceX: number; surfaceY: number; distance: number } | null {
  if (!mesh.visible) {
    return null;
  }

  switch (sample.transport) {
    case "surface":
      if (
        sample.surfaceX === undefined ||
        sample.surfaceY === undefined ||
        !isSurfacePointInBounds(sample.surfaceX, sample.surfaceY, metrics)
      ) {
        return null;
      }

      return {
        surfaceX: sample.surfaceX,
        surfaceY: sample.surfaceY,
        distance: 0
      };
    case "screen": {
      if (!frame.camera || sample.ndcX === undefined || sample.ndcY === undefined) {
        return null;
      }

      raycaster.setFromCamera(new THREE.Vector2(sample.ndcX, sample.ndcY), frame.camera);
      const hit = raycaster.intersectObject(mesh, false)[0];
      return hit ? toSurfaceHit(hit, metrics) : null;
    }
    case "ray": {
      if (!sample.origin || !sample.direction) {
        return null;
      }

      raycaster.ray.origin.set(sample.origin.x, sample.origin.y, sample.origin.z);
      raycaster.ray.direction
        .set(sample.direction.x, sample.direction.y, sample.direction.z)
        .normalize();
      const hit = raycaster.intersectObject(mesh, false)[0];
      return hit ? toSurfaceHit(hit, metrics) : null;
    }
    case "contact":
      return sample.contactPoint
        ? toContactSurfaceHit(mesh, metrics, sample.contactPoint, sample.contactNormal)
        : null;
  }
}

function toContactSurfaceHit(
  mesh: ThreePanelMesh,
  metrics: SurfaceMetrics,
  contactPoint: Vector3Like,
  contactNormal?: Vector3Like
): { surfaceX: number; surfaceY: number; distance: number } | null {
  const localPoint = mesh.worldToLocal(
    new THREE.Vector3(contactPoint.x, contactPoint.y, contactPoint.z)
  );
  const geometry = mesh.geometry.parameters;
  const panelWidth = geometry.width ?? 1;
  const panelHeight = geometry.height ?? 1;
  const halfWidth = panelWidth / 2;
  const halfHeight = panelHeight / 2;
  const contactPlaneTolerance = clampContactPlaneTolerance(panelWidth, panelHeight);
  if (
    localPoint.x < -halfWidth ||
    localPoint.x > halfWidth ||
    localPoint.y < -halfHeight ||
    localPoint.y > halfHeight ||
    Math.abs(localPoint.z) > contactPlaneTolerance
  ) {
    return null;
  }

  if (!isContactNormalAligned(mesh, contactNormal)) {
    return null;
  }

  return {
    surfaceX: ((localPoint.x + halfWidth) / panelWidth) * metrics.width,
    surfaceY: ((halfHeight - localPoint.y) / panelHeight) * metrics.height,
    distance: 0
  };
}

function clampContactPlaneTolerance(panelWidth: number, panelHeight: number): number {
  return Math.min(
    Math.max(
      Math.min(panelWidth, panelHeight) * CONTACT_PLANE_TOLERANCE_RATIO,
      CONTACT_PLANE_TOLERANCE_MIN
    ),
    CONTACT_PLANE_TOLERANCE_MAX
  );
}

function isContactNormalAligned(mesh: ThreePanelMesh, contactNormal?: Vector3Like): boolean {
  if (!contactNormal) {
    return true;
  }

  const worldContactNormal = new THREE.Vector3(contactNormal.x, contactNormal.y, contactNormal.z);
  if (worldContactNormal.lengthSq() === 0) {
    return true;
  }

  worldContactNormal.normalize();
  const panelNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(
    mesh.getWorldQuaternion(new THREE.Quaternion())
  );
  return Math.abs(panelNormal.dot(worldContactNormal)) >= CONTACT_NORMAL_ALIGNMENT_MIN;
}

function createHostEventFromSample(
  sample: ThreePointerSample,
  hit: { surfaceX: number; surfaceY: number }
): ThreePanelHostInputEvent {
  const type = mapSamplePhaseToEventType(sample.phase);
  const base = {
    type,
    timestamp: sample.timestamp,
    pointerId: sample.pointerId,
    pointerType: sample.pointerType,
    ...(sample.pressure === undefined ? {} : { pressure: sample.pressure }),
    ...(sample.modifiers === undefined ? {} : { modifiers: sample.modifiers }),
    ...(sample.phase === "scroll"
      ? {
          deltaX: sample.deltaX ?? 0,
          deltaY: sample.deltaY ?? 0
        }
      : {})
  };

  switch (sample.transport) {
    case "screen":
      return {
        ...base,
        source: "screen",
        ndcX: sample.ndcX ?? 0,
        ndcY: sample.ndcY ?? 0
      };
    case "ray":
      return {
        ...base,
        source: "ray",
        origin: sample.origin ?? { x: 0, y: 0, z: 0 },
        direction: sample.direction ?? { x: 0, y: 0, z: -1 }
      };
    case "surface":
    case "contact":
      return {
        ...base,
        source: "surface",
        surfaceX: hit.surfaceX,
        surfaceY: hit.surfaceY
      };
  }
}

function createMissMoveHostEvent(sample: ThreePointerSample): ThreePanelHostInputEvent {
  return createFallbackHostEvent(sample, "pointer-move");
}

function createCancelHostEvent(sample: ThreePointerSample): ThreePanelHostInputEvent {
  return createFallbackHostEvent(sample, "cancel");
}

function createFallbackHostEvent(
  sample: ThreePointerSample,
  type: "pointer-move" | "cancel"
): ThreePanelHostInputEvent {
  const base = {
    type,
    timestamp: sample.timestamp,
    pointerId: sample.pointerId,
    pointerType: sample.pointerType,
    ...(sample.pressure === undefined ? {} : { pressure: sample.pressure }),
    ...(sample.modifiers === undefined ? {} : { modifiers: sample.modifiers })
  };

  switch (sample.transport) {
    case "screen":
      return {
        ...base,
        source: "screen",
        ndcX: sample.ndcX ?? 0,
        ndcY: sample.ndcY ?? 0
      };
    case "ray":
      return {
        ...base,
        source: "ray",
        origin: sample.origin ?? { x: 0, y: 0, z: 0 },
        direction: sample.direction ?? { x: 0, y: 0, z: -1 }
      };
    case "surface":
    case "contact":
      return {
        ...base,
        source: "surface",
        surfaceX: sample.surfaceX ?? -1,
        surfaceY: sample.surfaceY ?? -1
      };
  }
}

function mapSamplePhaseToEventType(
  phase: ThreePointerPhase
): ThreePanelHostInputEvent["type"] {
  switch (phase) {
    case "move":
      return "pointer-move";
    case "down":
      return "pointer-down";
    case "up":
      return "pointer-up";
    case "cancel":
      return "cancel";
    case "scroll":
      return "scroll";
  }
}

export function isSurfacePointInBounds(
  surfaceX: number,
  surfaceY: number,
  metrics: SurfaceMetrics
): boolean {
  return surfaceX >= 0 && surfaceX <= metrics.width && surfaceY >= 0 && surfaceY <= metrics.height;
}

function defaultPointerType(source: ThreePanelHostInputEvent["source"]): PointerType {
  switch (source) {
    case "screen":
      return "mouse";
    case "ray":
      return "ray";
    case "surface":
      return "touch";
  }
}

function createInputEventBase(
  event: ThreePanelHostInputEvent,
  pointerId: string,
  surfaceX: number,
  surfaceY: number
) {
  return {
    timestamp: event.timestamp,
    pointerId,
    pointerType: event.pointerType ?? defaultPointerType(event.source),
    modifiers: event.modifiers ?? DEFAULT_MODIFIERS,
    surfaceX,
    surfaceY,
    ...(event.pressure === undefined ? {} : { pressure: event.pressure })
  };
}
