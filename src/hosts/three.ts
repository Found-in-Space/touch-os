import * as THREE from "three";
import type { DisplayRuntime } from "../core/runtime.js";
import type {
  BitmapDrawCommand,
  CircleDrawCommand,
  DrawCommand,
  LineDrawCommand,
  RectDrawCommand,
  RenderSnapshot,
  SurfaceDrawCommand,
  TextDrawCommand
} from "../core/draw.js";
import {
  DEFAULT_MODIFIERS,
  type InputEvent,
  type ModifierState,
  type PointerType
} from "../core/events.js";
import type { Rect } from "../core/geometry.js";
import type { SurfaceMetrics } from "../services/contracts.js";
import type { HostAdapter } from "./contracts.js";

export interface CanvasMeasureTextResult {
  width: number;
}

export interface CanvasContextLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  globalAlpha: number;
  textAlign: "left" | "center" | "right";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic";
  imageSmoothingEnabled?: boolean;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  roundRect?(x: number, y: number, width: number, height: number, radii: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): CanvasMeasureTextResult;
  drawImage?(image: unknown, x: number, y: number, width: number, height: number): void;
  closePath?(): void;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): CanvasContextLike | null;
}

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface QuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type ThreePointerTransport = "screen" | "ray" | "surface" | "contact";

export type ThreePointerPhase = "move" | "down" | "up" | "cancel" | "scroll";

export interface ThreePointerSample {
  pointerId: string;
  pointerType: PointerType;
  transport: ThreePointerTransport;
  phase: ThreePointerPhase;
  timestamp: number;
  sourceId?: string;
  handedness?: "left" | "right" | "none";
  pressure?: number;
  modifiers?: ModifierState;
  ndcX?: number;
  ndcY?: number;
  origin?: Vector3Like;
  direction?: Vector3Like;
  surfaceX?: number;
  surfaceY?: number;
  contactPoint?: Vector3Like;
  contactNormal?: Vector3Like;
  deltaX?: number;
  deltaY?: number;
}

export type PointerClaimPolicy =
  | "block-on-hit"
  | "block-on-press"
  | "passthrough"
  | "manual";

export interface PointerPresentationState {
  pointerId: string;
  claimed: boolean;
  blocked: boolean;
  hit: ThreePanelHit | null;
  active: boolean;
}

export interface PointerPresenter {
  update(state: PointerPresentationState): void;
  dispose(): void;
}

export interface PanelInteractionResult {
  hit: ThreePanelHit | null;
  claimed: boolean;
  blocked: boolean;
  dispatched: boolean;
  hostEvent?: ThreePanelHostInputEvent;
}

export interface PanelInteractor {
  process(sample: ThreePointerSample, frame: ThreePanelHostFrame): PanelInteractionResult;
  getPointerState(pointerId: string): PointerPresentationState | undefined;
  clear(pointerId?: string): void;
}

interface ThreePanelInputEventBase {
  type: "pointer-move" | "pointer-down" | "pointer-up" | "cancel" | "scroll";
  timestamp: number;
  pointerId?: string;
  pointerType?: PointerType;
  pressure?: number;
  modifiers?: ModifierState;
  deltaX?: number;
  deltaY?: number;
}

export interface ThreePanelScreenInputEvent extends ThreePanelInputEventBase {
  source: "screen";
  ndcX: number;
  ndcY: number;
}

export interface ThreePanelRayInputEvent extends ThreePanelInputEventBase {
  source: "ray";
  origin: Vector3Like;
  direction: Vector3Like;
}

export interface ThreePanelSurfaceInputEvent extends ThreePanelInputEventBase {
  source: "surface";
  surfaceX: number;
  surfaceY: number;
}

export type ThreePanelHostInputEvent =
  | ThreePanelScreenInputEvent
  | ThreePanelRayInputEvent
  | ThreePanelSurfaceInputEvent;

export interface ThreeHostPose {
  position: Vector3Like;
  orientation: QuaternionLike;
}

export interface ThreePanelHostFrame {
  scene?: THREE.Object3D;
  camera?: THREE.Camera;
  parent?: THREE.Object3D;
  surfaceMetrics?: Partial<SurfaceMetrics>;
  events?: readonly ThreePanelHostInputEvent[];
  anchorPose?: ThreeHostPose;
}

export interface ThreePanelHit {
  blocked: boolean;
  length: number;
  surfaceX: number;
  surfaceY: number;
  componentId: string | undefined;
  targetId: string | undefined;
  pointerId: string;
  source: ThreePanelHostInputEvent["source"] | "contact";
}

export interface ThreeSurfaceRenderHandle {
  draw(context: CanvasContextLike, rect: Rect): void;
}

type ThreeParentResolver =
  | THREE.Object3D
  | ((frame: ThreePanelHostFrame) => THREE.Object3D | undefined);

export interface ThreePanelPlacementHelpers {
  applyStaticTransform(mesh: ThreePanelMesh, transform: ThreeStaticTransform): void;
  runtime: DisplayRuntime;
}

export interface ThreeStaticTransform {
  position?: Vector3Like;
  quaternion?: QuaternionLike;
}

export interface ThreePanelHostOptions extends ThreeStaticTransform {
  runtime: DisplayRuntime;
  surface?: Partial<SurfaceMetrics>;
  panelWidth?: number;
  panelHeight?: number;
  renderOnUpdate?: boolean;
  renderOrder?: number;
  depthTest?: boolean;
  transparent?: boolean;
  parent?: ThreeParentResolver;
  pointerClaimPolicy?: PointerClaimPolicy;
  createCanvas?: (metrics: SurfaceMetrics) => CanvasLike;
  updatePlacement?: (
    mesh: ThreePanelMesh,
    frame: ThreePanelHostFrame,
    helpers: ThreePanelPlacementHelpers
  ) => boolean | void;
}

export interface ThreePanelHost extends HostAdapter<ThreePanelHostFrame> {
  readonly mesh: ThreePanelMesh;
  readonly texture: THREE.CanvasTexture;
  readonly material: THREE.MeshBasicMaterial;
  readonly canvas: CanvasLike;
  render(): RenderSnapshot;
  getHit(): ThreePanelHit | null;
  getSurfaceMetrics(): SurfaceMetrics;
  getCompositeSurfaces(): readonly SurfaceDrawCommand[];
}

export interface ThreeCompositeSurfacePlacement {
  componentId: string;
  sourceId: string | undefined;
  compositionMode: "composite";
  mirrorX: boolean;
  command: SurfaceDrawCommand;
  panelRect: Rect;
  localCenter: Vector3Like;
  size: {
    width: number;
    height: number;
  };
}

/** Options for a panel attached to an application-supplied pose such as a hand, head, chest, or tool mount. */
export interface PoseAnchoredPanelHostOptions extends ThreePanelHostOptions {
  tiltRadians?: number;
  offset?: Vector3Like;
}

export interface HudHostOptions extends ThreePanelHostOptions {
  distance?: number;
  offset?: { x?: number; y?: number };
  sizing?: "fixed" | "viewport";
}

type ThreePanelAnchorResolver = (
  frame: ThreePanelHostFrame
) => ThreeStaticTransform | undefined;

interface AnchoredPanelHostOptions extends ThreePanelHostOptions {
  anchor: ThreePanelAnchorResolver;
  anchorOffset?: Vector3Like;
  tiltRadians?: number;
  sizing?: "fixed" | "viewport";
}

type ThreePointerSourceResolver = (
  frame: ThreePanelHostFrame
) =>
  | Omit<ThreePointerSample, "transport">
  | readonly Omit<ThreePointerSample, "transport">[]
  | undefined;

export interface ThreePointerSource {
  sample(frame: ThreePanelHostFrame): readonly ThreePointerSample[];
  clear?(): void;
}

export interface ThreePanelDriverOptions {
  pointerClaimPolicy?: PointerClaimPolicy;
  pointerSources?: readonly ThreePointerSource[];
  pointerPresenter?: PointerPresenter | readonly PointerPresenter[];
}

export interface ScenePanelDriverOptions extends ThreePanelHostOptions, ThreePanelDriverOptions {}

export interface PoseAnchoredPanelDriverOptions
  extends PoseAnchoredPanelHostOptions, ThreePanelDriverOptions {}

export interface HudPanelDriverOptions extends HudHostOptions, ThreePanelDriverOptions {}

export interface ThreePanelDriver extends HostAdapter<ThreePanelHostFrame> {
  readonly host: ThreePanelHost;
  readonly interactor: PanelInteractor;
  render(): RenderSnapshot;
  getHit(): ThreePanelHit | null;
  getCompositeSurfaces(): readonly SurfaceDrawCommand[];
  getPointerState(pointerId: string): PointerPresentationState | undefined;
  clearPointer(pointerId?: string): void;
}

export type ThreePanelMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

interface InteractorPointerState extends PointerPresentationState {
  captured: boolean;
  pressed: boolean;
  dispatched: boolean;
  pointerType: PointerType;
  pressure: number | undefined;
  modifiers: ModifierState;
  timestamp: number;
}

const CONTACT_PLANE_TOLERANCE_RATIO = 0.02;
const CONTACT_PLANE_TOLERANCE_MIN = 0.0025;
const CONTACT_PLANE_TOLERANCE_MAX = 0.01;
const CONTACT_NORMAL_ALIGNMENT_MIN = 0.25;

export function createScenePanelHost(options: ThreePanelHostOptions): ThreePanelHost {
  const runtime = options.runtime;
  let surfaceMetrics = resolveSurfaceMetrics(options.surface);
  let canvas = (options.createCanvas ?? createDefaultCanvas)(surfaceMetrics);
  let renderer = createCanvasSurfaceRenderer(canvas, surfaceMetrics);
  const texture = new THREE.CanvasTexture(canvas as never);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: options.transparent ?? true,
    depthTest: options.depthTest ?? true,
    side: THREE.DoubleSide
  });
  const mesh: ThreePanelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(options.panelWidth ?? 0.24, options.panelHeight ?? 0.336),
    material
  );
  mesh.renderOrder = options.renderOrder ?? 0;
  mesh.visible = false;

  const raycaster = new THREE.Raycaster();
  let currentParent: THREE.Object3D | undefined;
  let lastRenderedSharedSurfaceRevision = -1;
  let latestHit: ThreePanelHit | null = null;
  let compositeSurfaces: SurfaceDrawCommand[] = [];
  const capturedPointers = new Set<string>();

  function attach(): void {
    runtime.resize(surfaceMetrics);
  }

  function update(frame: ThreePanelHostFrame): void {
    surfaceMetrics = resolveSurfaceMetrics(options.surface, frame.surfaceMetrics);
    runtime.resize(surfaceMetrics);
    if (
      canvas.width !== surfaceMetrics.width * surfaceMetrics.pixelDensity ||
      canvas.height !== surfaceMetrics.height * surfaceMetrics.pixelDensity
    ) {
      canvas = (options.createCanvas ?? createDefaultCanvas)(surfaceMetrics);
      renderer = createCanvasSurfaceRenderer(canvas, surfaceMetrics);
      texture.image = canvas as never;
      lastRenderedSharedSurfaceRevision = -1;
    }

    ensureParent(frame);
    mesh.visible = applyPlacement(frame);
    updateWorldMatrices(frame);

    if (mesh.visible) {
      for (const event of frame.events ?? []) {
        dispatchHostEvent(frame, event);
      }
    } else {
      latestHit = null;
    }

    if (options.renderOnUpdate ?? true) {
      render();
    }
  }

  function detach(): void {
    if (currentParent) {
      currentParent.remove(mesh);
      currentParent = undefined;
    }
    mesh.geometry.dispose();
    material.dispose();
    texture.dispose();
  }

  function render(): RenderSnapshot {
    const snapshot = runtime.render();
    compositeSurfaces = snapshot.commands.filter(
      (command): command is SurfaceDrawCommand =>
        command.type === "surface" && (command.compositionMode ?? "copy") === "composite"
    );
    if (snapshot.sharedSurfaceRevision !== lastRenderedSharedSurfaceRevision) {
      renderer.draw(snapshot);
      texture.needsUpdate = true;
      lastRenderedSharedSurfaceRevision = snapshot.sharedSurfaceRevision;
    }
    return snapshot;
  }

  function getHit(): ThreePanelHit | null {
    return latestHit ? { ...latestHit } : null;
  }

  function ensureParent(frame: ThreePanelHostFrame): void {
    const nextParent =
      typeof options.parent === "function"
        ? options.parent(frame)
        : options.parent ?? frame.parent ?? frame.scene;
    if (nextParent === currentParent) {
      return;
    }

    if (currentParent) {
      currentParent.remove(mesh);
    }
    currentParent = nextParent;
    currentParent?.add(mesh);
  }

  function applyPlacement(frame: ThreePanelHostFrame): boolean {
    if (options.updatePlacement) {
      const result = options.updatePlacement(mesh, frame, {
        applyStaticTransform,
        runtime
      });
      return result !== false;
    }

    applyStaticTransform(mesh, options);
    return true;
  }

  function updateWorldMatrices(frame: ThreePanelHostFrame): void {
    frame.scene?.updateMatrixWorld(true);
    frame.camera?.updateMatrixWorld(true);
    currentParent?.updateMatrixWorld(true);
    mesh.updateMatrixWorld(true);
  }

  function dispatchHostEvent(frame: ThreePanelHostFrame, event: ThreePanelHostInputEvent): void {
    const hit = resolveSurfaceHit(frame, event);
    const pointerId = event.pointerId ?? "default";

    if (!hit) {
      dispatchMissedEvent(event, pointerId);
      if (!capturedPointers.has(pointerId)) {
        latestHit = null;
      }
      return;
    }

    const result = runtime.dispatchInput(createRuntimeInputEvent(event, pointerId, hit.surfaceX, hit.surfaceY));
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

    if (!hasTargetHit && !hasCapturedPress) {
      latestHit = null;
    }
  }

  function dispatchMissedEvent(event: ThreePanelHostInputEvent, pointerId: string): void {
    const hasCapturedPress = updateCapturedPointerState(capturedPointers, pointerId, event.type, false);
    if ((!latestHit || latestHit.pointerId !== pointerId) && !hasCapturedPress) {
      return;
    }

    if (event.type === "pointer-move") {
      runtime.dispatchInput(createRuntimeInputEvent(event, pointerId, -1, -1));
      if (hasCapturedPress && latestHit?.pointerId === pointerId) {
        latestHit = {
          ...latestHit,
          blocked: resolvePointerBlocking(options.pointerClaimPolicy ?? "block-on-hit", false, true)
        };
      } else {
        latestHit = null;
      }
      return;
    }

    runtime.dispatchInput(createCancelInputEvent(event, pointerId));
    latestHit = null;
  }

  function resolveSurfaceHit(
    frame: ThreePanelHostFrame,
    event: ThreePanelHostInputEvent
  ): { surfaceX: number; surfaceY: number; distance: number } | null {
    if (event.source === "surface") {
      if (!isSurfacePointInBounds(event.surfaceX, event.surfaceY, surfaceMetrics)) {
        return null;
      }

      return {
        surfaceX: event.surfaceX,
        surfaceY: event.surfaceY,
        distance: 0
      };
    }

    if (event.source === "screen") {
      const camera = frame.camera;
      if (!camera) {
        return null;
      }

      raycaster.setFromCamera(new THREE.Vector2(event.ndcX, event.ndcY), camera);
      const hit = raycaster.intersectObject(mesh, false)[0];
      return hit ? toSurfaceHit(hit, surfaceMetrics) : null;
    }

    raycaster.ray.origin.set(event.origin.x, event.origin.y, event.origin.z);
    raycaster.ray.direction.set(event.direction.x, event.direction.y, event.direction.z).normalize();
    const hit = raycaster.intersectObject(mesh, false)[0];
    return hit ? toSurfaceHit(hit, surfaceMetrics) : null;
  }

  return {
    mesh,
    texture,
    material,
    get canvas() {
      return canvas;
    },
    getSurfaceMetrics() {
      return resolveSurfaceMetrics(surfaceMetrics);
    },
    attach,
    update(frame) {
      update(frame);
    },
    detach,
    render,
    getHit,
    getCompositeSurfaces() {
      return compositeSurfaces.map((command) => ({ ...command }));
    }
  };
}

export function resolveCompositeSurfacePlacements(
  host: Pick<ThreePanelHost, "mesh" | "getSurfaceMetrics" | "getCompositeSurfaces">
): readonly ThreeCompositeSurfacePlacement[] {
  const metrics = host.getSurfaceMetrics();
  if (metrics.width <= 0 || metrics.height <= 0) {
    return [];
  }

  const geometry = host.mesh.geometry.parameters;
  const panelWidth = geometry.width ?? 1;
  const panelHeight = geometry.height ?? 1;
  const halfWidth = panelWidth / 2;
  const halfHeight = panelHeight / 2;

  return host.getCompositeSurfaces().map((command) => {
    const panelRect: Rect = {
      x: (command.rect.x / metrics.width) * panelWidth,
      y: (command.rect.y / metrics.height) * panelHeight,
      width: (command.rect.width / metrics.width) * panelWidth,
      height: (command.rect.height / metrics.height) * panelHeight
    };
    const localCenter = {
      x: -halfWidth + panelRect.x + panelRect.width / 2,
      y: halfHeight - panelRect.y - panelRect.height / 2,
      z: 0
    };

    return {
      componentId: command.componentId,
      sourceId: command.sourceId,
      compositionMode: "composite" as const,
      mirrorX: command.mirrorX ?? false,
      command: { ...command },
      panelRect,
      localCenter,
      size: {
        width: panelRect.width,
        height: panelRect.height
      }
    };
  });
}

/** Create a panel host that follows an explicit pose supplied on each frame. */
export function createPoseAnchoredPanelHost(
  options: PoseAnchoredPanelHostOptions
): ThreePanelHost {
  return createAnchoredPanelHost({
    ...options,
    anchor(frame) {
      const pose = frame.anchorPose;
      return pose
        ? {
            position: pose.position,
            quaternion: pose.orientation
          }
        : undefined;
    },
    anchorOffset: options.offset ?? { x: 0, y: 0.08, z: -0.02 },
    tiltRadians: options.tiltRadians ?? -Math.PI * 0.35
  });
}

export function createHudHost(options: HudHostOptions): ThreePanelHost {
  const distance = options.distance ?? 0.6;
  const offset = options.offset ?? {};

  return createAnchoredPanelHost({
    ...options,
    anchor(frame) {
      return frame.camera ? toWorldTransform(frame.camera) : undefined;
    },
    anchorOffset: {
      x: offset.x ?? 0,
      y: offset.y ?? 0,
      z: -distance
    },
    sizing: options.sizing ?? "fixed",
    depthTest: options.depthTest ?? false,
    renderOrder: options.renderOrder ?? 10
  });
}

function createAnchoredPanelHost(options: AnchoredPanelHostOptions): ThreePanelHost {
  const sizing = options.sizing ?? "fixed";
  const anchorOffset = options.anchorOffset ?? { x: 0, y: 0, z: 0 };
  const viewportDistance = Math.abs(anchorOffset.z ?? 0);

  return createScenePanelHost({
    ...options,
    ...(sizing === "viewport"
      ? {
          panelWidth: options.panelWidth ?? 1,
          panelHeight: options.panelHeight ?? 1
        }
      : {}),
    updatePlacement(mesh, frame, helpers) {
      const anchor = options.anchor(frame);
      if (!anchor) {
        return false;
      }

      helpers.applyStaticTransform(mesh, anchor);
      if (options.tiltRadians !== undefined) {
        mesh.rotateX(options.tiltRadians);
      }
      mesh.translateX(anchorOffset.x ?? 0);
      mesh.translateY(anchorOffset.y ?? 0);
      mesh.translateZ(anchorOffset.z ?? 0);

      if (sizing === "viewport") {
        if (!frame.camera || viewportDistance <= 0) {
          return false;
        }

        const viewPlane = getCameraViewPlane(frame.camera, viewportDistance);
        if (!viewPlane) {
          return false;
        }
        const geometry = mesh.geometry.parameters;
        const baseWidth = geometry.width ?? 1;
        const baseHeight = geometry.height ?? 1;
        mesh.scale.set(
          viewPlane.width / (baseWidth || 1),
          viewPlane.height / (baseHeight || 1),
          1
        );
      } else {
        mesh.scale.set(1, 1, 1);
      }

      return true;
    }
  });
}

export function createPanelInteractor(options: {
  runtime: DisplayRuntime;
  mesh: ThreePanelMesh;
  getSurfaceMetrics(): SurfaceMetrics;
  pointerClaimPolicy?: PointerClaimPolicy;
}): PanelInteractor {
  const raycaster = new THREE.Raycaster();
  const states = new Map<string, InteractorPointerState>();

  function resolveState(pointerId: string): InteractorPointerState {
    const existing = states.get(pointerId);
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

  function cancelState(state: InteractorPointerState): void {
    if (!state.dispatched) {
      return;
    }

    options.runtime.dispatchInput({
      type: "cancel",
      timestamp: state.timestamp,
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
        options.runtime.dispatchInput(
          sample.phase === "move"
            ? createRuntimeInputEvent(hostEvent, sample.pointerId, -1, -1)
            : createCancelInputEvent(hostEvent, sample.pointerId)
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
      state.hit =
        currentHit
          ? { ...currentHit, blocked }
          : hasCapturedPress && state.hit
            ? { ...state.hit, blocked }
            : null;

      if (sample.phase === "up" || sample.phase === "cancel") {
        states.delete(sample.pointerId);
      } else if (!state.active && !state.pressed && !state.dispatched && !state.hit) {
        states.delete(sample.pointerId);
      } else {
        states.set(sample.pointerId, state);
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
    clear(pointerId) {
      if (pointerId) {
        const state = states.get(pointerId);
        if (state) {
          cancelState(state);
        }
        states.delete(pointerId);
        return;
      }
      for (const state of states.values()) {
        cancelState(state);
      }
      states.clear();
    }
  };
}

export function createScreenPointerSource(
  resolve: ThreePointerSourceResolver
): ThreePointerSource {
  return createTransportPointerSource("screen", resolve);
}

export function createXrRayPointerSource(
  resolve: ThreePointerSourceResolver
): ThreePointerSource {
  return createTransportPointerSource("ray", resolve);
}

export function createDirectTouchPointerSource(
  resolve: ThreePointerSourceResolver
): ThreePointerSource {
  return createTransportPointerSource("contact", resolve);
}

export function createScenePanelDriver(options: ScenePanelDriverOptions): ThreePanelDriver {
  return createPanelDriver(
    createScenePanelHost({
      ...options,
      renderOnUpdate: false
    }),
    options.runtime,
    options.pointerClaimPolicy,
    options.pointerSources,
    options.pointerPresenter
  );
}

/** Create a panel driver that follows an explicit pose supplied on each frame. */
export function createPoseAnchoredPanelDriver(
  options: PoseAnchoredPanelDriverOptions
): ThreePanelDriver {
  return createPanelDriver(
    createPoseAnchoredPanelHost({
      ...options,
      renderOnUpdate: false
    }),
    options.runtime,
    options.pointerClaimPolicy,
    options.pointerSources,
    options.pointerPresenter
  );
}

export function createHudPanelDriver(options: HudPanelDriverOptions): ThreePanelDriver {
  return createPanelDriver(
    createHudHost({
      ...options,
      renderOnUpdate: false
    }),
    options.runtime,
    options.pointerClaimPolicy,
    options.pointerSources,
    options.pointerPresenter
  );
}

function resolveSurfaceMetrics(
  initial: Partial<SurfaceMetrics> | undefined,
  override?: Partial<SurfaceMetrics>
): SurfaceMetrics {
  const width = override?.width ?? initial?.width ?? 320;
  const height = override?.height ?? initial?.height ?? 240;
  const pixelDensity = override?.pixelDensity ?? initial?.pixelDensity ?? 1;
  return {
    width,
    height,
    pixelDensity,
    orientation:
      override?.orientation ??
      initial?.orientation ??
      (width === height ? "square" : width > height ? "landscape" : "portrait"),
    safeArea: override?.safeArea ?? initial?.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 }
  };
}

function createDefaultCanvas(metrics: SurfaceMetrics): CanvasLike {
  const width = metrics.width * metrics.pixelDensity;
  const height = metrics.height * metrics.pixelDensity;
  const scope = globalThis as {
    document?: { createElement(tag: "canvas"): HTMLCanvasElement };
    OffscreenCanvas?: new (width: number, height: number) => OffscreenCanvas;
  };

  if (typeof scope.OffscreenCanvas === "function") {
    const canvas = new scope.OffscreenCanvas(width, height);
    return canvas as unknown as CanvasLike;
  }

  if (scope.document?.createElement) {
    const canvas = scope.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as CanvasLike;
  }

  throw new Error("No canvas implementation is available. Provide createCanvas in host options.");
}

function createCanvasSurfaceRenderer(canvas: CanvasLike, metrics: SurfaceMetrics) {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to acquire a 2D rendering context for the Three host surface.");
  }

  canvas.width = metrics.width * metrics.pixelDensity;
  canvas.height = metrics.height * metrics.pixelDensity;

  return {
    draw(snapshot: RenderSnapshot) {
      context.setTransform(metrics.pixelDensity, 0, 0, metrics.pixelDensity, 0, 0);
      context.clearRect(0, 0, metrics.width, metrics.height);
      for (const command of snapshot.commands) {
        drawCommand(context, command);
      }
    }
  };
}

function drawCommand(context: CanvasContextLike, command: DrawCommand): void {
  context.save();
  if (command.clipRect) {
    context.beginPath();
    context.rect(
      command.clipRect.x,
      command.clipRect.y,
      command.clipRect.width,
      command.clipRect.height
    );
    context.clip();
  }

  switch (command.type) {
    case "rect":
      drawRectCommand(context, command);
      break;
    case "text":
      drawTextCommand(context, command);
      break;
    case "line":
      drawLineCommand(context, command);
      break;
    case "circle":
      drawCircleCommand(context, command);
      break;
    case "bitmap":
      drawBitmapCommand(context, command);
      break;
    case "surface":
      drawSurfaceCommand(context, command);
      break;
  }

  context.restore();
}

function drawRectCommand(context: CanvasContextLike, command: RectDrawCommand): void {
  if (command.radius && context.roundRect) {
    context.beginPath();
    context.roundRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height, command.radius);
    if (command.fill) {
      context.fillStyle = command.fill;
      context.fill();
    }
    if (command.stroke) {
      context.strokeStyle = command.stroke;
      context.lineWidth = command.strokeWidth ?? 1;
      context.stroke();
    }
    return;
  }

  if (command.fill) {
    context.fillStyle = command.fill;
    context.fillRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
  }
  if (command.stroke) {
    context.strokeStyle = command.stroke;
    context.lineWidth = command.strokeWidth ?? 1;
    context.strokeRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
  }
}

function drawTextCommand(context: CanvasContextLike, command: TextDrawCommand): void {
  context.fillStyle = command.color;
  context.font = `${command.fontWeight ?? 400} ${command.fontSize ?? 14}px sans-serif`;
  context.textAlign = command.align ?? "left";
  context.textBaseline =
    command.verticalAlign === "middle"
      ? "middle"
      : command.verticalAlign === "bottom"
        ? "bottom"
        : "top";

  const x =
    command.align === "center"
      ? command.rect.x + command.rect.width / 2
      : command.align === "right"
        ? command.rect.x + command.rect.width
        : command.rect.x;
  const y =
    command.verticalAlign === "middle"
      ? command.rect.y + command.rect.height / 2
      : command.verticalAlign === "bottom"
        ? command.rect.y + command.rect.height
        : command.rect.y;
  context.fillText(command.text, x, y);
}

function drawLineCommand(context: CanvasContextLike, command: LineDrawCommand): void {
  context.beginPath();
  context.moveTo(command.x1, command.y1);
  context.lineTo(command.x2, command.y2);
  context.strokeStyle = command.stroke;
  context.lineWidth = command.strokeWidth ?? 1;
  context.stroke();
}

function drawCircleCommand(context: CanvasContextLike, command: CircleDrawCommand): void {
  context.beginPath();
  context.arc(command.cx, command.cy, command.radius, 0, Math.PI * 2);
  if (command.fill) {
    context.fillStyle = command.fill;
    context.fill();
  }
  if (command.stroke) {
    context.strokeStyle = command.stroke;
    context.lineWidth = command.strokeWidth ?? 1;
    context.stroke();
  }
}

function drawBitmapCommand(context: CanvasContextLike, command: BitmapDrawCommand): void {
  if (typeof context.drawImage !== "function") {
    context.fillStyle = "#111827";
    context.fillRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
    return;
  }

  const fit = command.fit ?? "stretch";
  const opacity = command.opacity ?? 1;
  const sampling = command.sampling ?? "linear";
  const previousAlpha = context.globalAlpha;
  const previousSmoothing = context.imageSmoothingEnabled;
  context.globalAlpha = previousAlpha * opacity;

  if (typeof context.imageSmoothingEnabled === "boolean") {
    context.imageSmoothingEnabled = sampling === "linear";
  }

  const imageWidth = command.handle.width;
  const imageHeight = command.handle.height;
  if (imageWidth <= 0 || imageHeight <= 0 || fit === "stretch") {
    context.drawImage(
      command.handle.image,
      command.rect.x,
      command.rect.y,
      command.rect.width,
      command.rect.height
    );
  } else {
    const scale =
      fit === "contain"
        ? Math.min(command.rect.width / imageWidth, command.rect.height / imageHeight)
        : Math.max(command.rect.width / imageWidth, command.rect.height / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const drawX = command.rect.x + (command.rect.width - drawWidth) / 2;
    const drawY = command.rect.y + (command.rect.height - drawHeight) / 2;

    if (fit === "cover") {
      context.beginPath();
      context.rect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
      context.clip();
    }

    context.drawImage(command.handle.image, drawX, drawY, drawWidth, drawHeight);
  }

  context.globalAlpha = previousAlpha;
  if (typeof previousSmoothing === "boolean") {
    context.imageSmoothingEnabled = previousSmoothing;
  }
}

function drawSurfaceCommand(context: CanvasContextLike, command: SurfaceDrawCommand): void {
  if ((command.compositionMode ?? "copy") === "composite") {
    return;
  }

  const drawRect = command.mirrorX
    ? { x: 0, y: 0, width: command.rect.width, height: command.rect.height }
    : command.rect;

  if (command.mirrorX) {
    context.save();
    context.translate(command.rect.x + command.rect.width, command.rect.y);
    context.scale(-1, 1);
  }

  if (isThreeSurfaceRenderHandle(command.handle)) {
    command.handle.draw(context, drawRect);
    if (command.mirrorX) {
      context.restore();
    }
    return;
  }

  if (typeof context.drawImage === "function" && isDrawImageHandle(command.handle)) {
    context.drawImage(
      command.handle.image,
      drawRect.x,
      drawRect.y,
      drawRect.width,
      drawRect.height
    );
    if (command.mirrorX) {
      context.restore();
    }
    return;
  }

  context.fillStyle = "#111827";
  context.fillRect(drawRect.x, drawRect.y, drawRect.width, drawRect.height);
  if (command.mirrorX) {
    context.restore();
  }
}

function isThreeSurfaceRenderHandle(handle: unknown): handle is ThreeSurfaceRenderHandle {
  return typeof handle === "object" && handle !== null && "draw" in handle && typeof handle.draw === "function";
}

function isDrawImageHandle(handle: unknown): handle is { image: unknown } {
  return typeof handle === "object" && handle !== null && "image" in handle;
}

function createPanelDriver(
  host: ThreePanelHost,
  runtime: DisplayRuntime,
  pointerClaimPolicy: PointerClaimPolicy | undefined,
  pointerSources: readonly ThreePointerSource[] | undefined,
  pointerPresenter: PointerPresenter | readonly PointerPresenter[] | undefined
): ThreePanelDriver {
  const interactor = createPanelInteractor({
    runtime,
    mesh: host.mesh,
    getSurfaceMetrics: () => host.getSurfaceMetrics(),
    ...(pointerClaimPolicy === undefined ? {} : { pointerClaimPolicy })
  });
  const sources = pointerSources ?? [];
  const presenters = Array.isArray(pointerPresenter)
    ? [...pointerPresenter]
    : pointerPresenter
      ? [pointerPresenter]
      : [];
  let latestHit: ThreePanelHit | null = null;

  return {
    host,
    interactor,
    attach() {
      host.attach();
    },
    update(frame) {
      if (sources.length > 0 && (frame.events?.length ?? 0) > 0) {
        throw new Error(
          "Panel drivers accept either frame.events or pointerSources in a given frame, not both."
        );
      }

      host.update(frame);
      latestHit = host.getHit();

      for (const source of sources) {
        for (const sample of source.sample(frame)) {
          const result = interactor.process(sample, frame);
          latestHit = result.hit;
          const state = interactor.getPointerState(sample.pointerId) ?? {
            pointerId: sample.pointerId,
            claimed: false,
            blocked: false,
            hit: null,
            active: false
          };
          for (const presenter of presenters) {
            presenter.update(state);
          }
        }
      }

      host.render();
    },
    detach() {
      interactor.clear();
      for (const source of sources) {
        source.clear?.();
      }
      for (const presenter of presenters) {
        presenter.dispose();
      }
      host.detach();
    },
    render() {
      return host.render();
    },
    getHit() {
      return latestHit ? { ...latestHit } : null;
    },
    getCompositeSurfaces() {
      return host.getCompositeSurfaces();
    },
    getPointerState(pointerId) {
      return interactor.getPointerState(pointerId);
    },
    clearPointer(pointerId) {
      interactor.clear(pointerId);
    }
  };
}

function createTransportPointerSource(
  transport: ThreePointerTransport,
  resolve: ThreePointerSourceResolver
): ThreePointerSource {
  return {
    sample(frame) {
      const next = resolve(frame);
      if (!next) {
        return [];
      }

      const entries = Array.isArray(next) ? next : [next];
      return entries.map((entry) => ({
        ...entry,
        transport
      }));
    }
  };
}

function updateCapturedPointerState(
  capturedPointers: Set<string>,
  pointerId: string,
  type: ThreePanelHostInputEvent["type"],
  hasTargetHit: boolean
): boolean {
  let hasCapturedPress = capturedPointers.has(pointerId);
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

function resolvePointerBlocking(
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

function hasResolvedRuntimeTarget(
  componentId: string | undefined,
  targetId: string | undefined
): boolean {
  return typeof componentId === "string" && typeof targetId === "string";
}

function getCameraViewPlane(
  camera: THREE.Camera,
  distance: number
): { width: number; height: number } | undefined {
  const projectionCamera = resolveProjectionCamera(camera);
  const elements = projectionCamera.projectionMatrix.elements;
  const scaleX = Math.abs(elements[0] ?? 0);
  const scaleY = Math.abs(elements[5] ?? 0);
  if (scaleX <= 0 || scaleY <= 0) {
    return undefined;
  }

  const isOrthographic =
    "isOrthographicCamera" in projectionCamera && projectionCamera.isOrthographicCamera === true;
  if (isOrthographic) {
    return {
      width: 2 / scaleX,
      height: 2 / scaleY
    };
  }

  return {
    width: (2 * distance) / scaleX,
    height: (2 * distance) / scaleY
  };
}

function resolveProjectionCamera(camera: THREE.Camera): THREE.Camera {
  const arrayCamera = camera as THREE.Camera & {
    isArrayCamera?: boolean;
    cameras?: THREE.Camera[];
  };

  if (arrayCamera.isArrayCamera === true && Array.isArray(arrayCamera.cameras)) {
    const viewCamera = arrayCamera.cameras[0];
    if (viewCamera) {
      return viewCamera;
    }
  }

  return camera;
}

function toWorldTransform(object: THREE.Object3D): ThreeStaticTransform {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  object.getWorldPosition(position);
  object.getWorldQuaternion(quaternion);
  return {
    position: {
      x: position.x,
      y: position.y,
      z: position.z
    },
    quaternion: {
      x: quaternion.x,
      y: quaternion.y,
      z: quaternion.z,
      w: quaternion.w
    }
  };
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
  const localPoint = mesh.worldToLocal(new THREE.Vector3(contactPoint.x, contactPoint.y, contactPoint.z));
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
    Math.max(Math.min(panelWidth, panelHeight) * CONTACT_PLANE_TOLERANCE_RATIO, CONTACT_PLANE_TOLERANCE_MIN),
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
  const panelNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
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

function toSurfaceHit(
  hit: THREE.Intersection<THREE.Object3D>,
  metrics: SurfaceMetrics
): { surfaceX: number; surfaceY: number; distance: number } {
  return {
    surfaceX: (hit.uv?.x ?? 0) * metrics.width,
    surfaceY: (1 - (hit.uv?.y ?? 0)) * metrics.height,
    distance: hit.distance
  };
}

function isSurfacePointInBounds(surfaceX: number, surfaceY: number, metrics: SurfaceMetrics): boolean {
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

function applyStaticTransform(mesh: ThreePanelMesh, transform: ThreeStaticTransform): void {
  mesh.position.set(
    transform.position?.x ?? mesh.position.x,
    transform.position?.y ?? mesh.position.y,
    transform.position?.z ?? mesh.position.z
  );

  if (transform.quaternion) {
    mesh.quaternion.set(
      transform.quaternion.x,
      transform.quaternion.y,
      transform.quaternion.z,
      transform.quaternion.w
    );
  }
}

function createRuntimeInputEvent(
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

function createCancelInputEvent(event: ThreePanelHostInputEvent, pointerId: string): InputEvent {
  return {
    ...createInputEventBase(event, pointerId, -1, -1),
    type: "cancel"
  };
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
