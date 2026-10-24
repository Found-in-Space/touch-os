import type { PointerType } from "../core/events.js";

export interface InteractionPoint { x: number; y: number; z: number }
/** World positions and distances are in scene metres. Local coordinates use target-defined units. */
export interface InteractionGeometry {
  point: InteractionPoint;
  distance: number;
  local: { x: number; y: number };
}
export interface InteractionSource {
  id: string;
  /** Interactors belonging to one physical input share a group. Capture wins over precedence. */
  group?: string;
  precedence?: number;
  pointerType: PointerType;
  tracked: boolean;
  space: "world-metres";
  ray?: { origin: InteractionPoint; direction: InteractionPoint };
  contact?: InteractionPoint;
  surface?: { targetId: string; x: number; y: number };
  capabilities?: readonly ("hover" | "haptics" | "audio")[];
}
export interface InteractionHit extends InteractionGeometry {
  targetId: string;
  subtargetId?: string;
  /** Independent semantic controls may share a target. Defaults to subtargetId or targetId. */
  editorId?: string;
  metadata?: unknown;
}
export type InteractionPhase = "move" | "begin" | "complete" | "cancel" | "scroll";
export interface InteractionInput {
  phase: InteractionPhase;
  timestamp: number;
  source: InteractionSource;
  delta?: { x: number; y: number };
}
export interface InteractionCapture {
  sourceId: string;
  targetId: string;
  subtargetId?: string;
  editorId: string;
  gesture: "press" | "drag";
  start: InteractionHit;
}
export interface ResolvedInteraction {
  source: InteractionSource;
  timestamp: number;
  trackingValid: boolean;
  hover: InteractionHit | undefined;
  pressed: InteractionHit | undefined;
  capture: InteractionCapture | undefined;
  /** Current bounded query, independent of capture. */
  hit: InteractionHit | undefined;
  /** Current unbounded manipulation geometry, never a cached hit. */
  projection: InteractionGeometry | undefined;
}
export interface InteractionDelivery {
  type: "hover" | "leave" | "begin" | "update" | "complete" | "cancel" | "activate" | "scroll";
  input: InteractionInput;
  hit: InteractionHit;
  geometry: InteractionGeometry;
  /** On complete, whether the resolved release still matches the pressed semantic target. */
  activationAllowed?: boolean;
}
export interface InteractionTarget {
  id: string;
  priority?: number;
  /** Three hosts default to scene occlusion. Overlays explicitly opt out. */
  occlusion?: "scene" | "none";
  enabled?(): boolean;
  /** A pure query. No dispatch, capture or application changes. Null means fallthrough. */
  query(source: InteractionSource): InteractionHit | null;
  /** Null cancels capture. Omit for non-surface aggregate targets. */
  project?(source: InteractionSource, capture: InteractionCapture): InteractionGeometry | null;
  validCapture?(capture: InteractionCapture): boolean;
  /** Single editor by default, scoped to editorId. */
  multipleEditors?: boolean;
  deliver(event: InteractionDelivery): void;
}
export interface InteractionContext {
  register(target: InteractionTarget): () => void;
  process(input: InteractionInput): ResolvedInteraction;
  /** Ordered edges first; current continuous samples afterwards. Missing sources are cancelled. */
  frame(timestamp: number, sources: readonly InteractionSource[], edges?: readonly InteractionInput[]): void;
  cancelSource(id: string, timestamp?: number): void;
  forgetSource(id: string): void;
  cancelTarget(id: string): void;
  getSnapshot(id: string): ResolvedInteraction | undefined;
  getSnapshots(): readonly ResolvedInteraction[];
  dispose(): void;
}
export interface InteractionResolver {
  resolve(source: InteractionSource, targets: readonly InteractionTarget[]): InteractionHit | undefined;
  releaseSource?(id: string): void;
  dispose?(): void;
}
