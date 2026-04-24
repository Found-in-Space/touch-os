import type { Rect } from "./geometry.js";

interface DrawCommandBase {
  type: string;
  componentId: string;
  role?: string;
  clipRect?: Rect;
}

export type BitmapFitMode = "stretch" | "contain" | "cover";

export type BitmapSampling = "linear" | "nearest";

export type SurfaceCompositionMode = "copy" | "composite";

export interface BitmapMetadata {
  width: number;
  height: number;
  revision: number;
}

export interface BitmapHandle extends BitmapMetadata {
  kind: "bitmap";
  image: unknown;
}

export interface RectDrawCommand extends DrawCommandBase {
  type: "rect";
  rect: Rect;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

export interface TextDrawCommand extends DrawCommandBase {
  type: "text";
  text: string;
  rect: Rect;
  color: string;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  fontSize?: number;
  fontWeight?: number;
}

export interface LineDrawCommand extends DrawCommandBase {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth?: number;
}

export interface CircleDrawCommand extends DrawCommandBase {
  type: "circle";
  cx: number;
  cy: number;
  radius: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface BitmapDrawCommand extends DrawCommandBase {
  type: "bitmap";
  rect: Rect;
  handle: BitmapHandle;
  fit?: BitmapFitMode;
  opacity?: number;
  sampling?: BitmapSampling;
}

export interface SurfaceDrawCommand extends DrawCommandBase {
  type: "surface";
  rect: Rect;
  handle: unknown;
  compositionMode?: SurfaceCompositionMode;
  mirrorX?: boolean;
}

export type DrawCommand =
  | RectDrawCommand
  | TextDrawCommand
  | LineDrawCommand
  | CircleDrawCommand
  | BitmapDrawCommand
  | SurfaceDrawCommand;

export interface RenderSnapshot {
  revision: number;
  commands: readonly DrawCommand[];
}
