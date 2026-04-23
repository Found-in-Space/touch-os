import * as THREE from "three";
import type { DisplayRuntime } from "../core/runtime.js";
import type {
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
  textAlign: "left" | "center" | "right";
  textBaseline: "top" | "middle" | "bottom" | "alphabetic";
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
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
  xrPose?: ThreeHostPose;
}

export interface ThreePanelHit {
  blocked: boolean;
  length: number;
  surfaceX: number;
  surfaceY: number;
  componentId: string | undefined;
  targetId: string | undefined;
  pointerId: string;
  source: ThreePanelHostInputEvent["source"];
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
  renderOrder?: number;
  depthTest?: boolean;
  transparent?: boolean;
  parent?: ThreeParentResolver;
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
}

export interface XrTabletHostOptions extends ThreePanelHostOptions {
  tiltRadians?: number;
  offset?: Vector3Like;
}

export interface HudHostOptions extends ThreePanelHostOptions {
  distance?: number;
  offset?: { x?: number; y?: number };
}

type ThreePanelMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

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
  let lastRenderedRevision = -1;
  let latestHit: ThreePanelHit | null = null;

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

    render();
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
    if (snapshot.revision !== lastRenderedRevision) {
      renderer.draw(snapshot);
      texture.needsUpdate = true;
      lastRenderedRevision = snapshot.revision;
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
      latestHit = null;
      return;
    }

    const result = runtime.dispatchInput(createRuntimeInputEvent(event, pointerId, hit.surfaceX, hit.surfaceY));

    latestHit = {
      blocked: true,
      length: hit.distance,
      surfaceX: hit.surfaceX,
      surfaceY: hit.surfaceY,
      componentId: result.componentId,
      targetId: result.targetId,
      pointerId,
      source: event.source
    };
  }

  function dispatchMissedEvent(event: ThreePanelHostInputEvent, pointerId: string): void {
    if (!latestHit || latestHit.pointerId !== pointerId) {
      return;
    }

    if (event.type === "pointer-move") {
      runtime.dispatchInput(createRuntimeInputEvent(event, pointerId, -1, -1));
      return;
    }

    runtime.dispatchInput(createCancelInputEvent(event, pointerId));
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
    attach,
    update(frame) {
      update(frame);
    },
    detach,
    render,
    getHit
  };
}

export function createXrTabletHost(options: XrTabletHostOptions): ThreePanelHost {
  const offset = options.offset ?? { x: 0, y: 0.08, z: -0.02 };
  const tilt = options.tiltRadians ?? -Math.PI * 0.35;

  return createScenePanelHost({
    ...options,
    updatePlacement(mesh, frame, helpers) {
      if (!frame.xrPose) {
        return false;
      }

      helpers.applyStaticTransform(mesh, {
        position: frame.xrPose.position,
        quaternion: frame.xrPose.orientation
      });
      mesh.rotateX(tilt);
      mesh.translateX(offset.x);
      mesh.translateY(offset.y);
      mesh.translateZ(offset.z);
      return true;
    }
  });
}

export function createHudHost(options: HudHostOptions): ThreePanelHost {
  const distance = options.distance ?? 0.6;
  const offset = options.offset ?? {};

  return createScenePanelHost({
    ...options,
    parent(frame: ThreePanelHostFrame) {
      return frame.camera ?? (typeof options.parent === "function" ? options.parent(frame) : options.parent);
    },
    depthTest: options.depthTest ?? false,
    updatePlacement(mesh, frame: ThreePanelHostFrame) {
      if (!frame.camera) {
        return false;
      }

      mesh.position.set(offset.x ?? 0, offset.y ?? 0, -distance);
      mesh.quaternion.identity();
      return true;
    }
  });
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

function drawSurfaceCommand(context: CanvasContextLike, command: SurfaceDrawCommand): void {
  if (isThreeSurfaceRenderHandle(command.handle)) {
    command.handle.draw(context, command.rect);
    return;
  }

  if (typeof context.drawImage === "function" && isDrawImageHandle(command.handle)) {
    context.drawImage(command.handle.image, command.rect.x, command.rect.y, command.rect.width, command.rect.height);
    return;
  }

  context.fillStyle = "#111827";
  context.fillRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
}

function isThreeSurfaceRenderHandle(handle: unknown): handle is ThreeSurfaceRenderHandle {
  return typeof handle === "object" && handle !== null && "draw" in handle && typeof handle.draw === "function";
}

function isDrawImageHandle(handle: unknown): handle is { image: unknown } {
  return typeof handle === "object" && handle !== null && "image" in handle;
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
