import type { DisplayRuntime } from "../core/runtime.js";
import {
  createCancelInputEvent,
  createRuntimeInputEvent,
  hasResolvedRuntimeTarget,
  resolvePointerBlocking
} from "./three-panel-interactor.js";
import type {
  PointerClaimPolicy,
  ThreePanelHostFrame,
  ThreePanelHostInputEvent,
  ThreePanelHit
} from "./three.js";

interface HostPointerState {
  event: ThreePanelHostInputEvent;
  surfaceX: number;
  surfaceY: number;
  dispatched: boolean;
}

interface ResolvedHostPointerHit {
  surfaceX: number;
  surfaceY: number;
  distance: number;
}

export interface ThreeHostPointerLifecycleOptions {
  runtime: DisplayRuntime;
  pointerClaimPolicy?: PointerClaimPolicy;
  resolveHit(
    frame: ThreePanelHostFrame,
    event: ThreePanelHostInputEvent
  ): ResolvedHostPointerHit | null;
}

export interface ThreeHostPointerLifecycle {
  process(frame: ThreePanelHostFrame, event: ThreePanelHostInputEvent): void;
  clear(pointerId: string | undefined, timestamp: number): void;
  getHit(): ThreePanelHit | null;
}

/** Complete pointer capture and cancellation lifecycle for direct Three host events. */
export function createThreeHostPointerLifecycle(
  options: ThreeHostPointerLifecycleOptions
): ThreeHostPointerLifecycle {
  const capturedPointers = new Set<string>();
  const pointerStates = new Map<string, HostPointerState>();
  let latestHit: ThreePanelHit | null = null;

  function process(frame: ThreePanelHostFrame, event: ThreePanelHostInputEvent): void {
    const hit = options.resolveHit(frame, event);
    const pointerId = event.pointerId ?? "default";
    const previousState = pointerStates.get(pointerId);

    if (!hit) {
      dispatchMissedEvent(event, pointerId, previousState);
      if (!capturedPointers.has(pointerId)) {
        latestHit = null;
      }
      return;
    }

    const result = options.runtime.dispatchInput(
      createRuntimeInputEvent(event, pointerId, hit.surfaceX, hit.surfaceY)
    );
    const hasTargetHit = hasResolvedRuntimeTarget(result.componentId, result.targetId);
    const hasCapturedPress = updateCapturedPointerState(
      capturedPointers,
      pointerId,
      event.type,
      hasTargetHit
    );
    const blocked = resolvePointerBlocking(
      options.pointerClaimPolicy ?? "block-on-hit",
      hasTargetHit,
      hasCapturedPress
    );

    latestHit = {
      blocked,
      length: hit.distance,
      surfaceX: hit.surfaceX,
      surfaceY: hit.surfaceY,
      componentId: hasTargetHit ? result.componentId : latestHit?.componentId,
      targetId: hasTargetHit ? result.targetId : latestHit?.targetId,
      pointerId,
      source: event.source
    };

    if (event.type === "cancel") {
      pointerStates.delete(pointerId);
      latestHit = null;
    } else {
      pointerStates.set(pointerId, {
        event: copyHostEvent(event),
        surfaceX: hit.surfaceX,
        surfaceY: hit.surfaceY,
        dispatched: true
      });
    }

    if (!hasTargetHit && !hasCapturedPress) {
      latestHit = null;
    }
  }

  function dispatchMissedEvent(
    event: ThreePanelHostInputEvent,
    pointerId: string,
    previousState: HostPointerState | undefined
  ): void {
    const hasCapturedPress = updateCapturedPointerState(
      capturedPointers,
      pointerId,
      event.type,
      false
    );
    if (!previousState?.dispatched && !hasCapturedPress) {
      return;
    }

    if (event.type === "pointer-move") {
      const surfaceX = hasCapturedPress ? previousState?.surfaceX ?? -1 : -1;
      const surfaceY = hasCapturedPress ? previousState?.surfaceY ?? -1 : -1;
      options.runtime.dispatchInput(createRuntimeInputEvent(event, pointerId, surfaceX, surfaceY));
      pointerStates.set(pointerId, {
        event: copyHostEvent(event),
        surfaceX,
        surfaceY,
        dispatched: true
      });
      if (hasCapturedPress && latestHit?.pointerId === pointerId) {
        latestHit = {
          ...latestHit,
          blocked: resolvePointerBlocking(
            options.pointerClaimPolicy ?? "block-on-hit",
            false,
            true
          )
        };
      } else {
        latestHit = null;
      }
      return;
    }

    options.runtime.dispatchInput(
      createCancelInputEvent(
        event,
        pointerId,
        previousState?.surfaceX ?? -1,
        previousState?.surfaceY ?? -1
      )
    );
    if (event.type === "cancel") {
      pointerStates.delete(pointerId);
    } else {
      pointerStates.set(pointerId, {
        event: copyHostEvent(event),
        surfaceX: previousState?.surfaceX ?? -1,
        surfaceY: previousState?.surfaceY ?? -1,
        dispatched: true
      });
    }
    latestHit = null;
  }

  function clear(pointerId: string | undefined, timestamp: number): void {
    const entries = pointerId
      ? [[pointerId, pointerStates.get(pointerId)] as const]
      : [...pointerStates.entries()].map(([id, state]) => [id, state] as const);
    for (const [id, state] of entries) {
      if (!state) {
        capturedPointers.delete(id);
        if (latestHit?.pointerId === id) {
          latestHit = null;
        }
        continue;
      }
      if (state.dispatched) {
        options.runtime.dispatchInput(
          createCancelInputEvent(
            { ...state.event, type: "cancel", timestamp },
            id,
            state.surfaceX,
            state.surfaceY
          )
        );
      }
      capturedPointers.delete(id);
      pointerStates.delete(id);
      if (latestHit?.pointerId === id) {
        latestHit = null;
      }
    }
    if (pointerId === undefined) {
      latestHit = null;
    }
  }

  return {
    process,
    clear,
    getHit() {
      return latestHit ? { ...latestHit } : null;
    }
  };
}

function updateCapturedPointerState(
  capturedPointers: Set<string>,
  pointerId: string,
  type: ThreePanelHostInputEvent["type"],
  hasTargetHit: boolean
): boolean {
  const hasCapturedPress = capturedPointers.has(pointerId);
  if (type === "pointer-down") {
    if (hasTargetHit) {
      capturedPointers.add(pointerId);
      return true;
    }

    capturedPointers.delete(pointerId);
    return false;
  }

  if (type === "pointer-up" || type === "cancel") {
    capturedPointers.delete(pointerId);
  }

  return hasCapturedPress;
}

function copyHostEvent(event: ThreePanelHostInputEvent): ThreePanelHostInputEvent {
  const modifiers = event.modifiers ? { modifiers: { ...event.modifiers } } : {};
  switch (event.source) {
    case "screen":
      return { ...event, ...modifiers };
    case "ray":
      return {
        ...event,
        ...modifiers,
        origin: { ...event.origin },
        direction: { ...event.direction }
      };
    case "surface":
      return { ...event, ...modifiers };
  }
}
