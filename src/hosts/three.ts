import * as THREE from "three";
import type { DisplayRuntime } from "../core/runtime.js";
import type { DrawCommand, RenderSnapshot, SurfaceDrawCommand } from "../core/draw.js";
import type { ModifierState, PointerType } from "../core/events.js";
import type { Rect } from "../core/geometry.js";
import type { SurfaceMetrics } from "../services/contracts.js";
import { drawRenderSnapshotToCanvasContext } from "../rendering/canvas-snapshot-renderer.js";
import type { HostAdapter } from "./contracts.js";
import {
  createPanelInteractorInternal,
  isSurfacePointInBounds,
  toSurfaceHit
} from "./three-panel-interactor.js";
import {
  createPanelDriver,
  type ThreePanelDriverCompositeServices,
  type ThreePanelHostInternal
} from "./three-panel-driver.js";
import { createThreeHostPointerLifecycle } from "./three-host-pointer-lifecycle.js";
export { createThreePanelSession } from "./three-panel-session.js";
export type {
  ThreePanelSession,
  ThreePanelSessionOptions,
  ThreePanelSessionOutputHandler
} from "./three-panel-session.js";

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
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
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
  clear(pointerId?: string, timestamp?: number): void;
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
  /** Monotonic frame time in milliseconds. Equal timestamps are allowed. */
  timestamp: number;
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
  /** Baseline metrics overridden by per-frame metrics; defaults to runtime metrics at creation. */
  surface?: Partial<SurfaceMetrics>;
  panelWidth?: number;
  panelHeight?: number;
  renderOnUpdate?: boolean;
  renderOrder?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  transparent?: boolean;
  toneMapped?: boolean;
  /** Persistent texture settings reapplied when a resize replaces the canvas texture. */
  textureQuality?: ThreeTextureQualityPolicy;
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
  clearPointer(pointerId?: string, timestamp?: number): void;
  dispose(): void;
}

export interface ThreeTextureQualityPolicy {
  /** Texture anisotropy retained across backing-canvas replacements. */
  anisotropy?: number;
  /** Canvas texture color space. Defaults to `THREE.SRGBColorSpace`. */
  colorSpace?: THREE.ColorSpace;
}

export interface ThreeCompositeSurfaceUv {
  /** U coordinate sampled at the left edge of the visible geometry. */
  left: number;
  /** U coordinate sampled at the right edge of the visible geometry. */
  right: number;
  /** V coordinate sampled at the top edge of the visible geometry. */
  top: number;
  /** V coordinate sampled at the bottom edge of the visible geometry. */
  bottom: number;
}

export interface ThreeCompositeSurfacePlacement {
  componentId: string;
  sourceId: string | undefined;
  compositionMode: "composite";
  mirrorX: boolean;
  command: SurfaceDrawCommand;
  /** Visible command rectangle after all panel-space clipping. */
  visibleRect: Rect;
  panelRect: Rect;
  /** Texture coordinates corresponding to the visible rectangle. */
  uv: ThreeCompositeSurfaceUv;
  localCenter: Vector3Like;
  size: {
    width: number;
    height: number;
  };
}

export interface ThreeTextureSurfaceHandle {
  kind: "three-texture";
  texture: THREE.Texture;
}

interface TouchRuntimeSurfaceSnapshotHandle {
  kind: "touch-os-render-snapshot";
  width: number;
  height: number;
  snapshot: RenderSnapshot;
}

export interface ThreeTextureCompositePresenterOptions {
  componentId?: string;
  sourceId?: string;
  zOffset?: number;
  renderOrderOffset?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  transparent?: boolean;
  toneMapped?: boolean;
}

export interface ThreeTextureCompositePresenter {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  update(host?: Pick<ThreePanelHost, "mesh" | "getSurfaceMetrics" | "getCompositeSurfaces">): void;
  dispose(): void;
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
  /** Return the complete per-frame snapshot of pointer ids currently owned by this source. */
  sample(frame: ThreePanelHostFrame): readonly ThreePointerSample[];
  clear?(): void;
}

export interface ThreePanelDriverOptions {
  pointerClaimPolicy?: PointerClaimPolicy;
  pointerSources?: readonly ThreePointerSource[];
  pointerPresenter?: PointerPresenter | readonly PointerPresenter[];
  /** Dispose supplied pointer presenters with the driver. Presenters are borrowed by default. */
  ownsPointerPresenter?: boolean;
}

export interface ScenePanelDriverOptions extends ThreePanelHostOptions, ThreePanelDriverOptions {}

export interface PoseAnchoredPanelDriverOptions
  extends PoseAnchoredPanelHostOptions, ThreePanelDriverOptions {}

export interface HudPanelDriverOptions extends HudHostOptions, ThreePanelDriverOptions {}

export interface ThreePanelDriver extends HostAdapter<ThreePanelHostFrame> {
  readonly host: ThreePanelHost;
  readonly interactor: PanelInteractor;
  processPointer(sample: ThreePointerSample, frame: ThreePanelHostFrame): PanelInteractionResult;
  render(): RenderSnapshot;
  getHit(): ThreePanelHit | null;
  getCompositeSurfaces(): readonly SurfaceDrawCommand[];
  getPointerState(pointerId: string): PointerPresentationState | undefined;
  clearPointer(pointerId?: string, timestamp?: number): void;
  dispose(): void;
}

export type ThreePanelMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

export function createScenePanelHost(options: ThreePanelHostOptions): ThreePanelHost {
  return createScenePanelHostInternal(options);
}

function createScenePanelHostInternal(options: ThreePanelHostOptions): ThreePanelHostInternal {
  const runtime = options.runtime;
  const configuredSurfaceMetrics = resolveSurfaceMetrics(
    runtime.getServices().surface.getMetrics(),
    options.surface
  );
  let surfaceMetrics = copySurfaceMetrics(configuredSurfaceMetrics);
  let canvas = (options.createCanvas ?? createDefaultCanvas)(surfaceMetrics);
  let renderer = createCanvasSurfaceRenderer(canvas, surfaceMetrics);
  let texture = createPanelCanvasTexture(canvas, options.textureQuality);
  const transparent = options.transparent ?? true;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent,
    depthTest: options.depthTest ?? true,
    depthWrite: options.depthWrite ?? !transparent,
    toneMapped: options.toneMapped ?? false,
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
  let lastRenderSnapshot: RenderSnapshot | null = null;
  let lastCompositeSurfaceRevision = -1;
  let lastRenderedSharedSurfaceRevision = -1;
  let compositeSurfaces: SurfaceDrawCommand[] = [];
  let attached = false;
  let disposed = false;
  let latestFrameTimestamp = 0;
  const pointerLifecycle = createThreeHostPointerLifecycle({
    runtime,
    resolveHit: resolveSurfaceHit,
    ...(options.pointerClaimPolicy === undefined
      ? {}
      : { pointerClaimPolicy: options.pointerClaimPolicy })
  });

  function attach(): void {
    assertNotDisposed("attach");
    if (attached) {
      return;
    }
    attached = true;
    resizeRuntimeIfChanged(surfaceMetrics);
  }

  function updateFrame(
    frame: ThreePanelHostFrame,
    advanceRuntime: boolean,
    renderAfterUpdate: boolean
  ): void {
    assertNotDisposed("update");
    if (!attached) {
      throw new Error("Cannot update a detached Three panel host. Call attach() first.");
    }
    validateFrameTimestamp(frame.timestamp, latestFrameTimestamp);
    latestFrameTimestamp = frame.timestamp;

    updateSurfaceMetrics(resolveSurfaceMetrics(configuredSurfaceMetrics, frame.surfaceMetrics));

    ensureParent(frame);
    mesh.visible = applyPlacement(frame);
    updateWorldMatrices(frame);

    if (mesh.visible) {
      for (const event of frame.events ?? []) {
        pointerLifecycle.process(frame, event);
      }
    } else {
      pointerLifecycle.clear(undefined, frame.timestamp);
    }

    if (advanceRuntime) {
      runtime.tick(frame.timestamp);
    }
    if (renderAfterUpdate) {
      render();
    }
  }

  function detach(): void {
    if (disposed || !attached) {
      return;
    }
    pointerLifecycle.clear(undefined, latestFrameTimestamp);
    if (currentParent) {
      currentParent.remove(mesh);
      currentParent = undefined;
    }
    mesh.visible = false;
    attached = false;
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    detach();
    pointerLifecycle.clear(undefined, latestFrameTimestamp);
    mesh.geometry.dispose();
    material.dispose();
    texture.dispose();
    compositeSurfaces = [];
    lastRenderSnapshot = null;
    disposed = true;
  }

  function render(): RenderSnapshot {
    assertNotDisposed("render");
    if (
      !runtime.isRenderDirty() &&
      lastRenderSnapshot &&
      lastRenderedSharedSurfaceRevision === lastRenderSnapshot.sharedSurfaceRevision
    ) {
      return lastRenderSnapshot;
    }
    const snapshot = runtime.render();
    lastRenderSnapshot = snapshot;
    if (snapshot.revision !== lastCompositeSurfaceRevision) {
      compositeSurfaces = collectCompositeSurfaceCommands(snapshot.commands);
      lastCompositeSurfaceRevision = snapshot.revision;
    }
    if (snapshot.sharedSurfaceRevision !== lastRenderedSharedSurfaceRevision) {
      renderer.draw(snapshot);
      texture.needsUpdate = true;
      lastRenderedSharedSurfaceRevision = snapshot.sharedSurfaceRevision;
    }
    return snapshot;
  }

  function getHit(): ThreePanelHit | null {
    return pointerLifecycle.getHit();
  }

  function updateSurfaceMetrics(nextMetrics: SurfaceMetrics): void {
    if (equalSurfaceMetrics(surfaceMetrics, nextMetrics)) {
      return;
    }

    surfaceMetrics = copySurfaceMetrics(nextMetrics);
    resizeRuntimeIfChanged(surfaceMetrics);
    const backingSize = getSurfaceBackingSize(surfaceMetrics);
    if (canvas.width !== backingSize.width || canvas.height !== backingSize.height) {
      canvas = (options.createCanvas ?? createDefaultCanvas)(surfaceMetrics);
      renderer = createCanvasSurfaceRenderer(canvas, surfaceMetrics);
      texture.dispose();
      texture = createPanelCanvasTexture(canvas, options.textureQuality);
      material.map = texture;
      material.needsUpdate = true;
    } else {
      renderer = createCanvasSurfaceRenderer(canvas, surfaceMetrics);
    }
    lastRenderedSharedSurfaceRevision = -1;
  }

  function resizeRuntimeIfChanged(metrics: SurfaceMetrics): void {
    if (!equalSurfaceMetrics(runtime.getServices().surface.getMetrics(), metrics)) {
      runtime.resize(metrics);
    }
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

  function assertNotDisposed(operation: string): void {
    if (disposed) {
      throw new Error(`Cannot ${operation} a disposed Three panel host.`);
    }
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
    get texture() {
      return texture;
    },
    material,
    get canvas() {
      return canvas;
    },
    getSurfaceMetrics() {
      return resolveSurfaceMetrics(surfaceMetrics);
    },
    attach,
    update(frame) {
      updateFrame(frame, true, options.renderOnUpdate ?? true);
    },
    updateForDriver(frame) {
      updateFrame(frame, false, false);
    },
    detach,
    dispose,
    render,
    getHit,
    getCompositeSurfaces() {
      return compositeSurfaces.map((command) => ({ ...command }));
    },
    clearPointer(pointerId, timestamp = latestFrameTimestamp) {
      pointerLifecycle.clear(pointerId, timestamp);
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

  const placements: ThreeCompositeSurfacePlacement[] = [];
  for (const command of host.getCompositeSurfaces()) {
    const visibleRect = intersectVisibleRect(command.rect, command.clipRect);
    if (!visibleRect || command.rect.width <= 0 || command.rect.height <= 0) {
      continue;
    }
    const panelRect: Rect = {
      x: (visibleRect.x / metrics.width) * panelWidth,
      y: (visibleRect.y / metrics.height) * panelHeight,
      width: (visibleRect.width / metrics.width) * panelWidth,
      height: (visibleRect.height / metrics.height) * panelHeight
    };
    const localCenter = {
      x: -halfWidth + panelRect.x + panelRect.width / 2,
      y: halfHeight - panelRect.y - panelRect.height / 2,
      z: 0
    };

    const leftRatio = clampUnit((visibleRect.x - command.rect.x) / command.rect.width);
    const rightRatio = clampUnit(
      (visibleRect.x + visibleRect.width - command.rect.x) / command.rect.width
    );
    const topRatio = clampUnit((visibleRect.y - command.rect.y) / command.rect.height);
    const bottomRatio = clampUnit(
      (visibleRect.y + visibleRect.height - command.rect.y) / command.rect.height
    );
    const mirrorX = command.mirrorX ?? false;

    placements.push({
      componentId: command.componentId,
      sourceId: command.sourceId,
      compositionMode: "composite" as const,
      mirrorX,
      command: { ...command },
      visibleRect,
      panelRect,
      uv: {
        left: mirrorX ? 1 - leftRatio : leftRatio,
        right: mirrorX ? 1 - rightRatio : rightRatio,
        top: 1 - topRatio,
        bottom: 1 - bottomRatio
      },
      localCenter,
      size: {
        width: panelRect.width,
        height: panelRect.height
      }
    });
  }
  return placements;
}

export function createThreeTextureCompositePresenter(
  host: Pick<ThreePanelHost, "mesh" | "getSurfaceMetrics" | "getCompositeSurfaces">,
  options: ThreeTextureCompositePresenterOptions = {}
): ThreeTextureCompositePresenter {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const transparent = options.transparent ?? true;
  const material = new THREE.MeshBasicMaterial({
    transparent,
    depthTest: options.depthTest ?? host.mesh.material.depthTest,
    depthWrite: options.depthWrite ?? (transparent ? false : host.mesh.material.depthWrite),
    side: THREE.DoubleSide,
    toneMapped: options.toneMapped ?? host.mesh.material.toneMapped
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "touch-os-composite-three-texture";
  mesh.visible = false;
  mesh.frustumCulled = false;
  host.mesh.add(mesh);

  return {
    mesh,
    update(nextHost = host) {
      const placement = resolveCompositeSurfacePlacements(nextHost).find((candidate) => {
        if (options.componentId && candidate.componentId !== options.componentId) {
          return false;
        }
        if (options.sourceId && candidate.sourceId !== options.sourceId) {
          return false;
        }
        return isThreeTextureSurfaceHandle(candidate.command.handle);
      });

      if (!placement || !isThreeTextureSurfaceHandle(placement.command.handle)) {
        mesh.visible = false;
        return;
      }

      const nextTexture = placement.command.handle.texture;
      if (material.map !== nextTexture) {
        material.map = nextTexture;
        material.needsUpdate = true;
      }
      mesh.position.set(
        placement.localCenter.x,
        placement.localCenter.y,
        options.zOffset ?? 0.001
      );
      mesh.scale.set(
        placement.size.width,
        placement.size.height,
        1
      );
      updateCompositeGeometryUv(geometry, placement.uv);
      mesh.renderOrder = nextHost.mesh.renderOrder + (options.renderOrderOffset ?? 1);
      mesh.visible = nextHost.mesh.visible;
    },
    dispose() {
      mesh.parent?.remove(mesh);
      material.map = null;
      geometry.dispose();
      material.dispose();
    }
  };
}

function updateCompositeGeometryUv(
  geometry: THREE.PlaneGeometry,
  uv: ThreeCompositeSurfaceUv
): void {
  const attribute = geometry.getAttribute("uv");
  attribute.setXY(0, uv.left, uv.top);
  attribute.setXY(1, uv.right, uv.top);
  attribute.setXY(2, uv.left, uv.bottom);
  attribute.setXY(3, uv.right, uv.bottom);
  attribute.needsUpdate = true;
}

export function isThreeTextureSurfaceHandle(handle: unknown): handle is ThreeTextureSurfaceHandle {
  return Boolean(handle) &&
    typeof handle === "object" &&
    (handle as { kind?: unknown }).kind === "three-texture" &&
    isThreeTextureLike((handle as { texture?: unknown }).texture);
}

function isThreeTextureLike(texture: unknown): texture is THREE.Texture {
  return Boolean(texture) &&
    typeof texture === "object" &&
    (
      texture instanceof THREE.Texture ||
      (texture as { isTexture?: unknown }).isTexture === true
    );
}

function collectCompositeSurfaceCommands(
  commands: readonly DrawCommand[],
  viewport?: {
    rect: Rect;
    clipRect?: Rect;
    sourceWidth: number;
    sourceHeight: number;
    mirrorX: boolean;
    componentPrefix: string;
  }
): SurfaceDrawCommand[] {
  const collected: SurfaceDrawCommand[] = [];

  for (const command of commands) {
    if (command.type !== "surface") {
      continue;
    }

    const transformed = viewport
      ? transformNestedSurfaceCommand(command, viewport)
      : { ...command };
    if ((transformed.compositionMode ?? "copy") === "composite") {
      collected.push(transformed);
    }

    const handle = getTouchRuntimeSurfaceSnapshotHandle(command.handle);
    if (!handle) {
      continue;
    }

    const visibleViewport = intersectVisibleRect(transformed.rect, transformed.clipRect);
    if (!visibleViewport) {
      continue;
    }

    collected.push(...collectCompositeSurfaceCommands(handle.snapshot.commands, {
      rect: transformed.rect,
      clipRect: visibleViewport,
      sourceWidth: handle.width,
      sourceHeight: handle.height,
      mirrorX: transformed.mirrorX ?? false,
      componentPrefix: transformed.componentId
    }));
  }

  return collected;
}

function transformNestedSurfaceCommand(
  command: SurfaceDrawCommand,
  viewport: {
    rect: Rect;
    clipRect?: Rect;
    sourceWidth: number;
    sourceHeight: number;
    mirrorX: boolean;
    componentPrefix: string;
  }
): SurfaceDrawCommand {
  const scaleX = viewport.sourceWidth > 0 ? viewport.rect.width / viewport.sourceWidth : 1;
  const scaleY = viewport.sourceHeight > 0 ? viewport.rect.height / viewport.sourceHeight : 1;
  const rect = transformNestedRect(command.rect, viewport, scaleX, scaleY);
  const localClip = command.clipRect
    ? transformNestedRect(command.clipRect, viewport, scaleX, scaleY)
    : undefined;
  const clipRect = intersectClipRects(viewport.clipRect, localClip);
  const mirrorX = viewport.mirrorX ? !(command.mirrorX ?? false) : command.mirrorX;

  return {
    ...command,
    componentId: `${viewport.componentPrefix}:${command.componentId}`,
    rect,
    ...(clipRect === undefined ? {} : { clipRect }),
    ...(mirrorX === undefined ? {} : { mirrorX })
  };
}

function transformNestedRect(
  rect: Rect,
  viewport: {
    rect: Rect;
    mirrorX: boolean;
  },
  scaleX: number,
  scaleY: number
): Rect {
  return {
    x: viewport.mirrorX
      ? viewport.rect.x + viewport.rect.width - (rect.x + rect.width) * scaleX
      : viewport.rect.x + rect.x * scaleX,
    y: viewport.rect.y + rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY
  };
}

function intersectClipRects(a: Rect | undefined, b: Rect | undefined): Rect | undefined {
  if (!a) {
    return b ? { ...b } : undefined;
  }
  if (!b) {
    return { ...a };
  }

  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y)
  };
}

function intersectVisibleRect(rect: Rect, clipRect: Rect | undefined): Rect | undefined {
  if (rect.width <= 0 || rect.height <= 0) {
    return undefined;
  }
  if (!clipRect) {
    return { ...rect };
  }
  const intersection = intersectClipRects(rect, clipRect);
  return intersection && intersection.width > 0 && intersection.height > 0
    ? intersection
    : undefined;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function getTouchRuntimeSurfaceSnapshotHandle(
  handle: unknown
): TouchRuntimeSurfaceSnapshotHandle | undefined {
  if (typeof handle !== "object" || handle === null) {
    return undefined;
  }

  const candidate = handle as {
    kind?: unknown;
    width?: unknown;
    height?: unknown;
    snapshot?: unknown;
  };
  if (
    candidate.kind !== "touch-os-render-snapshot" ||
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number" ||
    !isRenderSnapshot(candidate.snapshot)
  ) {
    return undefined;
  }

  return {
    kind: "touch-os-render-snapshot",
    width: candidate.width,
    height: candidate.height,
    snapshot: candidate.snapshot
  };
}

function isRenderSnapshot(value: unknown): value is RenderSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { commands?: unknown }).commands)
  );
}

/** Create a panel host that follows an explicit pose supplied on each frame. */
export function createPoseAnchoredPanelHost(
  options: PoseAnchoredPanelHostOptions
): ThreePanelHost {
  return createPoseAnchoredPanelHostInternal(options);
}

function createPoseAnchoredPanelHostInternal(
  options: PoseAnchoredPanelHostOptions
): ThreePanelHostInternal {
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
  return createHudHostInternal(options);
}

function createHudHostInternal(options: HudHostOptions): ThreePanelHostInternal {
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

function createAnchoredPanelHost(options: AnchoredPanelHostOptions): ThreePanelHostInternal {
  const sizing = options.sizing ?? "fixed";
  const anchorOffset = options.anchorOffset ?? { x: 0, y: 0, z: 0 };
  const viewportDistance = Math.abs(anchorOffset.z ?? 0);

  return createScenePanelHostInternal({
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
  const interactor = createPanelInteractorInternal(options);
  return {
    process: interactor.process,
    getPointerState: interactor.getPointerState,
    clear: interactor.clear
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
  return createPanelDriver({
    host: createScenePanelHostInternal({
      ...options,
      renderOnUpdate: false
    }),
    runtime: options.runtime,
    pointerClaimPolicy: options.pointerClaimPolicy,
    pointerSources: options.pointerSources,
    pointerPresenter: options.pointerPresenter,
    ownsPointerPresenter: options.ownsPointerPresenter ?? false,
    compositeServices: THREE_PANEL_DRIVER_COMPOSITE_SERVICES
  });
}

/** Create a panel driver that follows an explicit pose supplied on each frame. */
export function createPoseAnchoredPanelDriver(
  options: PoseAnchoredPanelDriverOptions
): ThreePanelDriver {
  return createPanelDriver({
    host: createPoseAnchoredPanelHostInternal({
      ...options,
      renderOnUpdate: false
    }),
    runtime: options.runtime,
    pointerClaimPolicy: options.pointerClaimPolicy,
    pointerSources: options.pointerSources,
    pointerPresenter: options.pointerPresenter,
    ownsPointerPresenter: options.ownsPointerPresenter ?? false,
    compositeServices: THREE_PANEL_DRIVER_COMPOSITE_SERVICES
  });
}

export function createHudPanelDriver(options: HudPanelDriverOptions): ThreePanelDriver {
  return createPanelDriver({
    host: createHudHostInternal({
      ...options,
      renderOnUpdate: false
    }),
    runtime: options.runtime,
    pointerClaimPolicy: options.pointerClaimPolicy,
    pointerSources: options.pointerSources,
    pointerPresenter: options.pointerPresenter,
    ownsPointerPresenter: options.ownsPointerPresenter ?? false,
    compositeServices: THREE_PANEL_DRIVER_COMPOSITE_SERVICES
  });
}

const THREE_PANEL_DRIVER_COMPOSITE_SERVICES: ThreePanelDriverCompositeServices = {
  resolvePlacements: resolveCompositeSurfacePlacements,
  isTextureHandle: isThreeTextureSurfaceHandle,
  createPresenter: createThreeTextureCompositePresenter
};

function resolveSurfaceMetrics(
  initial: Partial<SurfaceMetrics>,
  override?: Partial<SurfaceMetrics>
): SurfaceMetrics {
  const width = override?.width ?? initial?.width ?? 320;
  const height = override?.height ?? initial?.height ?? 240;
  const pixelDensity = override?.pixelDensity ?? initial?.pixelDensity ?? 1;
  const dimensionsOverridden = override?.width !== undefined || override?.height !== undefined;
  return {
    width,
    height,
    pixelDensity,
    orientation:
      override?.orientation ??
      (!dimensionsOverridden && initial.orientation
        ? initial.orientation
        : deriveOrientation(width, height)),
    safeArea: {
      ...(override?.safeArea ?? initial.safeArea ?? { top: 0, right: 0, bottom: 0, left: 0 })
    }
  };
}

function deriveOrientation(width: number, height: number): SurfaceMetrics["orientation"] {
  return width === height ? "square" : width > height ? "landscape" : "portrait";
}

function copySurfaceMetrics(metrics: SurfaceMetrics): SurfaceMetrics {
  return {
    ...metrics,
    safeArea: { ...metrics.safeArea }
  };
}

function equalSurfaceMetrics(a: SurfaceMetrics, b: SurfaceMetrics): boolean {
  return a.width === b.width &&
    a.height === b.height &&
    a.pixelDensity === b.pixelDensity &&
    a.orientation === b.orientation &&
    a.safeArea.top === b.safeArea.top &&
    a.safeArea.right === b.safeArea.right &&
    a.safeArea.bottom === b.safeArea.bottom &&
    a.safeArea.left === b.safeArea.left;
}

function validateFrameTimestamp(timestamp: number, previousTimestamp: number): void {
  if (!Number.isFinite(timestamp)) {
    throw new TypeError("Three panel frame timestamps must be finite monotonic milliseconds.");
  }
  if (timestamp < previousTimestamp) {
    throw new RangeError("Three panel frame timestamps must be monotonic.");
  }
}

function createDefaultCanvas(metrics: SurfaceMetrics): CanvasLike {
  const { width, height } = getSurfaceBackingSize(metrics);
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

function createPanelCanvasTexture(
  canvas: CanvasLike,
  quality: ThreeTextureQualityPolicy | undefined
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas as never);
  texture.colorSpace = quality?.colorSpace ?? THREE.SRGBColorSpace;
  texture.anisotropy = Math.max(1, quality?.anisotropy ?? 1);
  return texture;
}

function createCanvasSurfaceRenderer(canvas: CanvasLike, metrics: SurfaceMetrics) {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to acquire a 2D rendering context for the Three host surface.");
  }

  const { width, height } = getSurfaceBackingSize(metrics);
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }

  return {
    draw(snapshot: RenderSnapshot) {
      context.setTransform(metrics.pixelDensity, 0, 0, metrics.pixelDensity, 0, 0);
      context.clearRect(0, 0, metrics.width, metrics.height);
      drawRenderSnapshotToCanvasContext(context, snapshot, {
        sourceWidth: metrics.width,
        sourceHeight: metrics.height
      });
    }
  };
}

function getSurfaceBackingSize(metrics: SurfaceMetrics): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(metrics.width * metrics.pixelDensity)),
    height: Math.max(1, Math.round(metrics.height * metrics.pixelDensity))
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
