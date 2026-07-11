import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { DispatchResult, DisplayRuntime } from "../src/core/runtime.js";
import type { InputEvent } from "../src/core/events.js";
import type { RenderSnapshot, SurfaceDrawCommand } from "../src/core/draw.js";
import type { SurfaceMetrics } from "../src/services/contracts.js";
import {
  createPanelDriver,
  type ThreePanelDriverCompositeServices,
  type ThreePanelHostInternal
} from "../src/hosts/three-panel-driver.js";
import {
  createCancelInputEvent,
  createPanelInteractorInternal,
  createRuntimeInputEvent,
  toSurfaceHit
} from "../src/hosts/three-panel-interactor.js";
import { createThreeHostPointerLifecycle } from "../src/hosts/three-host-pointer-lifecycle.js";
import type {
  PointerClaimPolicy,
  PointerPresentationState,
  PointerPresenter,
  ThreeCompositeSurfacePlacement,
  ThreePanelHostFrame,
  ThreePanelHit,
  ThreePanelHostInputEvent,
  ThreePanelMesh,
  ThreePointerSample,
  ThreePointerSource,
  ThreeTextureCompositePresenter,
  ThreeTextureSurfaceHandle
} from "../src/hosts/three.js";

describe("Three pointer interactor lifecycle", () => {
  it("covers policy, transport, miss, cancellation, and metadata transitions", () => {
    const harness = createInteractorHarness("block-on-press");
    const { dispatchInput, interactor, mesh } = harness;

    const hover = interactor.process(surfaceSample("hover", "move", 1), frame(1));
    expect(hover).toMatchObject({ claimed: false, blocked: false, dispatched: true });
    const press = interactor.process(surfaceSample("press", "down", 2), frame(2));
    expect(press).toMatchObject({ claimed: true, blocked: true, dispatched: true });
    expect(interactor.getPointerIds()).toEqual(expect.arrayContaining(["hover", "press"]));

    interactor.process(
      {
        pointerId: "scroll",
        pointerType: "touch",
        transport: "surface",
        phase: "scroll",
        timestamp: 3,
        surfaceX: 50,
        surfaceY: 25
      },
      frame(3)
    );
    expect(dispatchInput).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "scroll", deltaX: 0, deltaY: 0 })
    );

    mesh.visible = false;
    const rayMiss = interactor.process(
      {
        pointerId: "press",
        pointerType: "ray",
        transport: "ray",
        phase: "move",
        timestamp: 4
      },
      frame(4)
    );
    expect(rayMiss.hostEvent).toMatchObject({
      source: "ray",
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: 0, z: -1 }
    });
    mesh.visible = true;

    interactor.process(
      {
        pointerId: "invalid-surface",
        pointerType: "touch",
        transport: "surface",
        phase: "down",
        timestamp: 5
      },
      frame(5)
    );
    interactor.clear("invalid-surface");

    expect(
      interactor.process(
        {
          pointerId: "invalid-screen",
          pointerType: "mouse",
          transport: "screen",
          phase: "move",
          timestamp: 6
        },
        frame(6)
      ).hit
    ).toBeNull();
    expect(
      interactor.process(
        {
          pointerId: "invalid-ray",
          pointerType: "ray",
          transport: "ray",
          phase: "move",
          timestamp: 7,
          origin: { x: 0, y: 0, z: 1 }
        },
        frame(7)
      ).hit
    ).toBeNull();
    expect(
      interactor.process(
        {
          pointerId: "invalid-contact",
          pointerType: "touch",
          transport: "contact",
          phase: "down",
          timestamp: 8
        },
        frame(8)
      ).hit
    ).toBeNull();

    const rayHit = interactor.process(
      {
        pointerId: "ray-hit",
        pointerType: "ray",
        transport: "ray",
        phase: "down",
        timestamp: 9,
        origin: { x: 0, y: 0, z: 1 },
        direction: { x: 0, y: 0, z: -1 }
      },
      frame(9)
    );
    expect(rayHit.hit).toMatchObject({ source: "ray" });

    const zeroNormalContact = interactor.process(
      {
        pointerId: "contact-hit",
        pointerType: "touch",
        transport: "contact",
        phase: "down",
        timestamp: 10,
        contactPoint: { x: 0, y: 0, z: 0 },
        contactNormal: { x: 0, y: 0, z: 0 }
      },
      frame(10)
    );
    expect(zeroNormalContact.hit).toMatchObject({ source: "contact" });
    expect(
      interactor.process(surfaceSample("contact-hit", "cancel", 11), frame(11)).hit
    ).toBeNull();

    interactor.clear(undefined, 12);
    expect(interactor.getPointerIds()).toEqual([]);
    expect(interactor.getPointerState("press")).toBeUndefined();
  });

  it("normalizes direct host events and UV-less intersections", () => {
    const scrollEvent: ThreePanelHostInputEvent = {
      source: "surface",
      type: "scroll",
      timestamp: 1,
      surfaceX: 2,
      surfaceY: 3
    };
    expect(createRuntimeInputEvent(scrollEvent, "scroll", 2, 3)).toMatchObject({
      type: "scroll",
      pointerType: "touch",
      deltaX: 0,
      deltaY: 0
    });
    expect(createCancelInputEvent(scrollEvent, "scroll")).toMatchObject({
      type: "cancel",
      surfaceX: -1,
      surfaceY: -1
    });
    expect(
      toSurfaceHit(
        { distance: 4 } as unknown as THREE.Intersection<THREE.Object3D>,
        surfaceMetrics()
      )
    ).toEqual({ surfaceX: 0, surfaceY: 50, distance: 4 });
  });
});

describe("Three direct-host pointer lifecycle", () => {
  it("covers hit, miss, capture, cancellation, source copying, and clearing", () => {
    let hasHit = true;
    let hasTarget = true;
    const dispatchInput = vi.fn((_event: InputEvent): DispatchResult => ({
      handled: hasTarget,
      componentId: hasTarget ? "component" : undefined,
      targetId: hasTarget ? "target" : undefined,
      outputs: []
    }));
    const runtime = { dispatchInput } as unknown as DisplayRuntime;
    const lifecycle = createThreeHostPointerLifecycle({
      runtime,
      pointerClaimPolicy: "block-on-press",
      resolveHit() {
        return hasHit ? { surfaceX: 20, surfaceY: 10, distance: 2 } : null;
      }
    });

    lifecycle.process(frame(0), surfaceHostEvent("pointer-move", 0, "hover"));
    hasHit = false;
    lifecycle.process(frame(0), surfaceHostEvent("pointer-move", 0, "hover"));
    expect(lifecycle.getHit()).toBeNull();
    hasHit = true;

    lifecycle.process(frame(1), surfaceHostEvent("pointer-down", 1, "captured"));
    expect(lifecycle.getHit()).toMatchObject({
      pointerId: "captured",
      componentId: "component",
      blocked: true
    });

    hasHit = false;
    lifecycle.process(frame(2), surfaceHostEvent("pointer-move", 2, "captured"));
    expect(dispatchInput).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "pointer-move", surfaceX: 20, surfaceY: 10 })
    );
    expect(lifecycle.getHit()).toMatchObject({ pointerId: "captured", blocked: true });

    lifecycle.process(frame(3), surfaceHostEvent("pointer-up", 3, "captured"));
    expect(lifecycle.getHit()).toBeNull();
    lifecycle.process(frame(4), surfaceHostEvent("cancel", 4, "captured"));
    lifecycle.process(frame(5), surfaceHostEvent("pointer-move", 5, "untracked"));

    hasHit = true;
    hasTarget = false;
    lifecycle.process(frame(6), surfaceHostEvent("pointer-down", 6, "empty"));
    expect(lifecycle.getHit()).toBeNull();

    hasTarget = true;
    lifecycle.process(frame(7), rayHostEvent("pointer-down", 7, "ray"));
    hasTarget = false;
    lifecycle.process(frame(8), rayHostEvent("pointer-move", 8, "ray"));
    expect(lifecycle.getHit()).toMatchObject({
      pointerId: "ray",
      componentId: "component"
    });
    lifecycle.process(frame(9), rayHostEvent("cancel", 9, "ray"));
    expect(lifecycle.getHit()).toBeNull();

    hasTarget = true;
    lifecycle.process(frame(10), {
      source: "screen",
      type: "pointer-down",
      timestamp: 10,
      ndcX: 0,
      ndcY: 0,
      modifiers: { altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }
    });
    expect(lifecycle.getHit()).toMatchObject({ pointerId: "default", source: "screen" });
    lifecycle.clear("missing", 11);
    expect(lifecycle.getHit()).not.toBeNull();
    lifecycle.clear("default", 12);
    expect(lifecycle.getHit()).toBeNull();

    lifecycle.process(frame(13), surfaceHostEvent("pointer-down", 13, "all"));
    lifecycle.clear(undefined, 14);
    expect(lifecycle.getHit()).toBeNull();

    let defaultPolicyHit = true;
    const defaultPolicyLifecycle = createThreeHostPointerLifecycle({
      runtime,
      resolveHit() {
        return defaultPolicyHit ? { surfaceX: 1, surfaceY: 1, distance: 0 } : null;
      }
    });
    defaultPolicyLifecycle.process(frame(15), surfaceHostEvent("pointer-down", 15, "default-policy"));
    defaultPolicyHit = false;
    defaultPolicyLifecycle.process(frame(16), surfaceHostEvent("pointer-move", 16, "default-policy"));
    expect(defaultPolicyLifecycle.getHit()).toMatchObject({ blocked: true });
  });
});

describe("Three panel driver lifecycle", () => {
  it("owns complete attachment, source, presentation, composite, and disposal state", () => {
    const harness = createDriverHarness();
    const {
      compositePresenters,
      driver,
      hostCalls,
      mesh,
      pointerPresenters,
      runtimeCalls,
      setPlacements,
      setRevision,
      source,
      sourceCalls
    } = harness;

    expect(() => driver.update(frame(0))).toThrow(/detached/i);
    expect(() => driver.processPointer(surfaceSample("pointer", "down", 0), frame(0))).toThrow(
      /detached/i
    );
    driver.detach();

    driver.attach();
    driver.attach();
    expect(hostCalls.attach).toHaveBeenCalledTimes(1);

    source.current = [richSurfaceSample("pointer", "down", 1)];
    setPlacements([texturePlacement("surface", "source")]);
    driver.update(frame(1));
    expect(runtimeCalls.tick).toHaveBeenCalledWith(1);
    expect(driver.getHit()).toMatchObject({ pointerId: "pointer" });
    expect(driver.getPointerState("pointer")).toMatchObject({ active: true });
    expect(driver.getCompositeSurfaces()).toEqual(harness.compositeSurfaces);
    expect(pointerPresenters.every((presenter) => presenter.update.mock.calls.length > 0)).toBe(true);
    expect(compositePresenters).toHaveLength(1);

    driver.render();
    expect(compositePresenters).toHaveLength(1);

    setRevision(2);
    setPlacements([nonTexturePlacement("ignored")]);
    driver.update(frame(2));
    expect(compositePresenters[0]?.dispose).toHaveBeenCalledTimes(1);

    setRevision(3);
    setPlacements([texturePlacement("without-source", undefined)]);
    source.current = [richSurfaceSample("pointer", "down", 3)];
    driver.update(frame(3));
    expect(compositePresenters).toHaveLength(2);

    driver.clearPointer("other", 4);
    expect(driver.getHit()).not.toBeNull();
    driver.clearPointer("pointer", 5);
    expect(driver.getHit()).toBeNull();

    source.current = [richSurfaceSample("pointer", "down", 6)];
    driver.update(frame(6));
    mesh.visible = false;
    source.current = [];
    driver.update(frame(7));
    expect(driver.getPointerState("pointer")).toBeUndefined();
    expect(driver.getHit()).toBeNull();

    driver.detach();
    driver.detach();
    expect(hostCalls.detach).toHaveBeenCalledTimes(1);
    expect(sourceCalls.clear).toHaveBeenCalled();
    expect(() => driver.processPointer(surfaceSample("pointer", "move", 8), frame(8))).toThrow(
      /detached/i
    );

    driver.attach();
    driver.dispose();
    driver.dispose();
    expect(hostCalls.dispose).toHaveBeenCalledTimes(1);
    expect(pointerPresenters.every((presenter) => presenter.dispose.mock.calls.length === 1)).toBe(
      true
    );
    expect(compositePresenters[1]?.dispose).toHaveBeenCalledTimes(1);

    expect(() => driver.attach()).toThrow(/disposed/i);
    expect(() => driver.update(frame(9))).toThrow(/disposed/i);
    expect(() => driver.render()).toThrow(/disposed/i);
    expect(() => driver.processPointer(surfaceSample("pointer", "move", 9), frame(9))).toThrow(
      /disposed/i
    );
  });
});

function createInteractorHarness(pointerClaimPolicy?: PointerClaimPolicy) {
  const dispatchInput = vi.fn((_event: InputEvent): DispatchResult => ({
    handled: true,
    componentId: "component",
    targetId: "target",
    outputs: []
  }));
  const runtime = { dispatchInput } as unknown as DisplayRuntime;
  const mesh = createPanelMesh();
  const interactor = createPanelInteractorInternal({
    runtime,
    mesh,
    getSurfaceMetrics: surfaceMetrics,
    ...(pointerClaimPolicy === undefined ? {} : { pointerClaimPolicy })
  });
  return { dispatchInput, interactor, mesh, runtime };
}

function createDriverHarness() {
  const mesh = createPanelMesh();
  const snapshot: RenderSnapshot = { revision: 1, sharedSurfaceRevision: 0, commands: [] };
  const compositeSurfaces: readonly SurfaceDrawCommand[] = [];
  let revision = 1;
  let placements: ThreeCompositeSurfacePlacement[] = [];
  const hostCalls = {
    attach: vi.fn((): void => {}),
    updateForDriver: vi.fn((_frame: ThreePanelHostFrame): void => {}),
    detach: vi.fn((): void => {}),
    dispose: vi.fn((): void => {}),
    render: vi.fn((): RenderSnapshot => ({ ...snapshot, revision })),
    getHit: vi.fn((): ThreePanelHit | null => null),
    getSurfaceMetrics: vi.fn(surfaceMetrics),
    getCompositeSurfaces: vi.fn((): readonly SurfaceDrawCommand[] => compositeSurfaces),
    clearPointer: vi.fn((_pointerId?: string, _timestamp?: number): void => {})
  };
  const host = { mesh, ...hostCalls } as unknown as ThreePanelHostInternal;
  const runtimeCalls = {
    dispatchInput: vi.fn((_event: InputEvent): DispatchResult => ({
      handled: true,
      componentId: "component",
      targetId: "target",
      outputs: []
    })),
    tick: vi.fn((_timestamp: number): void => {})
  };
  const runtime = runtimeCalls as unknown as DisplayRuntime;
  const pointerPresenters = [createPointerPresenter(), createPointerPresenter()];
  const sourceCalls = { clear: vi.fn((): void => {}) };
  const source: ThreePointerSource & { current: ThreePointerSample[] } = {
    current: [],
    sample() {
      return this.current;
    },
    clear: sourceCalls.clear
  };
  const sourceWithoutClear: ThreePointerSource = { sample: () => [] };
  const compositePresenters: Array<ReturnType<typeof createCompositePresenter>> = [];
  const compositeServices: ThreePanelDriverCompositeServices = {
    resolvePlacements() {
      return placements;
    },
    isTextureHandle(handle): handle is ThreeTextureSurfaceHandle {
      return typeof handle === "object" && handle !== null && "kind" in handle && handle.kind === "three-texture";
    },
    createPresenter() {
      const presenter = createCompositePresenter();
      compositePresenters.push(presenter);
      return presenter;
    }
  };
  const driver = createPanelDriver({
    host,
    runtime,
    pointerClaimPolicy: "block-on-hit",
    pointerSources: [source, sourceWithoutClear],
    pointerPresenter: pointerPresenters,
    ownsPointerPresenter: true,
    compositeServices
  });

  return {
    compositePresenters,
    compositeSurfaces,
    driver,
    host,
    hostCalls,
    mesh,
    pointerPresenters,
    runtime,
    runtimeCalls,
    setPlacements(next: ThreeCompositeSurfacePlacement[]) {
      placements = next;
    },
    setRevision(next: number) {
      revision = next;
    },
    source,
    sourceCalls
  };
}

function createPointerPresenter() {
  return {
    update: vi.fn((_state: PointerPresentationState): void => {}),
    dispose: vi.fn((): void => {})
  } satisfies PointerPresenter;
}

function createCompositePresenter() {
  return {
    mesh: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()),
    update: vi.fn((): void => {}),
    dispose: vi.fn((): void => {})
  } satisfies ThreeTextureCompositePresenter;
}

function texturePlacement(
  componentId: string,
  sourceId: string | undefined
): ThreeCompositeSurfacePlacement {
  return {
    componentId,
    sourceId,
    compositionMode: "composite",
    mirrorX: false,
    command: {
      type: "surface",
      componentId,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      handle: { kind: "three-texture", texture: new THREE.Texture() }
    },
    visibleRect: { x: 0, y: 0, width: 10, height: 10 },
    panelRect: { x: 0, y: 0, width: 1, height: 1 },
    uv: { left: 0, right: 1, top: 1, bottom: 0 },
    localCenter: { x: 0, y: 0, z: 0 },
    size: { width: 1, height: 1 }
  };
}

function nonTexturePlacement(componentId: string): ThreeCompositeSurfacePlacement {
  const placement = texturePlacement(componentId, "source");
  return {
    ...placement,
    command: { ...placement.command, handle: { kind: "other" } }
  };
}

function createPanelMesh(): ThreePanelMesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 1),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  );
  mesh.updateMatrixWorld(true);
  return mesh;
}

function surfaceMetrics(): SurfaceMetrics {
  return {
    width: 100,
    height: 50,
    pixelDensity: 1,
    orientation: "landscape",
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
  };
}

function frame(timestamp: number): ThreePanelHostFrame {
  return { timestamp };
}

function surfaceSample(
  pointerId: string,
  phase: ThreePointerSample["phase"],
  timestamp: number
): ThreePointerSample {
  return {
    pointerId,
    pointerType: "touch",
    transport: "surface",
    phase,
    timestamp,
    surfaceX: 50,
    surfaceY: 25
  };
}

function richSurfaceSample(
  pointerId: string,
  phase: ThreePointerSample["phase"],
  timestamp: number
): ThreePointerSample {
  return {
    ...surfaceSample(pointerId, phase, timestamp),
    pressure: 0.5,
    modifiers: { altKey: true, ctrlKey: false, metaKey: false, shiftKey: true },
    origin: { x: 0, y: 0, z: 1 },
    direction: { x: 0, y: 0, z: -1 },
    contactPoint: { x: 0, y: 0, z: 0 },
    contactNormal: { x: 0, y: 0, z: 1 }
  };
}

function surfaceHostEvent(
  type: ThreePanelHostInputEvent["type"],
  timestamp: number,
  pointerId: string
): ThreePanelHostInputEvent {
  return {
    source: "surface",
    type,
    timestamp,
    pointerId,
    surfaceX: 20,
    surfaceY: 10
  };
}

function rayHostEvent(
  type: ThreePanelHostInputEvent["type"],
  timestamp: number,
  pointerId: string
): ThreePanelHostInputEvent {
  return {
    source: "ray",
    type,
    timestamp,
    pointerId,
    origin: { x: 0, y: 0, z: 1 },
    direction: { x: 0, y: 0, z: -1 },
    modifiers: { altKey: false, ctrlKey: true, metaKey: false, shiftKey: false }
  };
}
