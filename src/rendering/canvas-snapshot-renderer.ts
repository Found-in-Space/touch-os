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
import type { Rect } from "../core/geometry.js";

export interface CanvasSurfaceContextLike {
  save?(): void;
  restore?(): void;
  translate?(x: number, y: number): void;
  scale?(x: number, y: number): void;

  beginPath?(): void;
  closePath?(): void;
  rect?(x: number, y: number, width: number, height: number): void;
  roundRect?(x: number, y: number, width: number, height: number, radii: number): void;
  clip?(): void;

  fill?(): void;
  stroke?(): void;
  fillRect?(x: number, y: number, width: number, height: number): void;
  strokeRect?(x: number, y: number, width: number, height: number): void;

  arc?(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  moveTo?(x: number, y: number): void;
  lineTo?(x: number, y: number): void;

  fillText?(text: string, x: number, y: number, maxWidth?: number): void;
  drawImage?(image: unknown, x: number, y: number, width: number, height: number): void;

  fillStyle?: unknown;
  strokeStyle?: unknown;
  lineWidth?: number;
  font?: string;
  textAlign?: string;
  textBaseline?: string;
  globalAlpha?: number;
  imageSmoothingEnabled?: boolean;
}

export interface DrawRenderSnapshotOptions {
  sourceWidth: number;
  sourceHeight: number;
  targetRect?: Rect;
}

interface TouchRuntimeSurfaceSnapshotHandle {
  kind: "touch-os-render-snapshot";
  width: number;
  height: number;
  snapshot: RenderSnapshot;
}

export function drawRenderSnapshotToCanvasContext(
  context: CanvasSurfaceContextLike,
  snapshot: RenderSnapshot,
  options: DrawRenderSnapshotOptions
): void {
  context.save?.();
  const targetRect = options.targetRect;
  if (targetRect) {
    context.translate?.(targetRect.x, targetRect.y);
    context.scale?.(
      options.sourceWidth > 0 ? targetRect.width / options.sourceWidth : 1,
      options.sourceHeight > 0 ? targetRect.height / options.sourceHeight : 1
    );
  }

  for (const command of snapshot.commands) {
    drawCommandToCanvasContext(context, command);
  }

  context.restore?.();
}

export function drawCommandToCanvasContext(
  context: CanvasSurfaceContextLike,
  command: DrawCommand
): void {
  context.save?.();
  applyCommandClip(context, command);

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

  context.restore?.();
}

function applyCommandClip(context: CanvasSurfaceContextLike, command: DrawCommand): void {
  if (!command.clipRect || !context.beginPath || !context.rect || !context.clip) {
    return;
  }

  context.beginPath();
  context.rect(
    command.clipRect.x,
    command.clipRect.y,
    command.clipRect.width,
    command.clipRect.height
  );
  context.clip();
}

function drawRectCommand(
  context: CanvasSurfaceContextLike,
  command: RectDrawCommand
): void {
  const radius = Math.max(0, command.radius ?? 0);
  if (radius > 0 && beginRoundedRectPath(context, command.rect, radius)) {
    fillAndStrokeCurrentPath(context, command.fill, command.stroke, command.strokeWidth);
    return;
  }

  drawSquareRectCommand(context, command);
}

function beginRoundedRectPath(
  context: CanvasSurfaceContextLike,
  rect: Rect,
  radius: number
): boolean {
  if (!context.beginPath) {
    return false;
  }

  if (context.roundRect) {
    context.beginPath();
    context.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
    return true;
  }

  if (!context.moveTo || !context.lineTo || !context.arc) {
    return false;
  }

  const resolvedRadius = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  context.beginPath();
  context.moveTo(rect.x + resolvedRadius, rect.y);
  context.lineTo(right - resolvedRadius, rect.y);
  context.arc(right - resolvedRadius, rect.y + resolvedRadius, resolvedRadius, -Math.PI / 2, 0);
  context.lineTo(right, bottom - resolvedRadius);
  context.arc(right - resolvedRadius, bottom - resolvedRadius, resolvedRadius, 0, Math.PI / 2);
  context.lineTo(rect.x + resolvedRadius, bottom);
  context.arc(rect.x + resolvedRadius, bottom - resolvedRadius, resolvedRadius, Math.PI / 2, Math.PI);
  context.lineTo(rect.x, rect.y + resolvedRadius);
  context.arc(rect.x + resolvedRadius, rect.y + resolvedRadius, resolvedRadius, Math.PI, Math.PI * 1.5);
  context.closePath?.();
  return true;
}

function drawSquareRectCommand(
  context: CanvasSurfaceContextLike,
  command: RectDrawCommand
): void {
  if (command.fill) {
    context.fillStyle = command.fill;
    if (context.fillRect) {
      context.fillRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
    } else if (beginSquareRectPath(context, command.rect) && context.fill) {
      context.fill();
    }
  }

  if (command.stroke) {
    context.strokeStyle = command.stroke;
    context.lineWidth = command.strokeWidth ?? 1;
    if (context.strokeRect) {
      context.strokeRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
    } else if (beginSquareRectPath(context, command.rect) && context.stroke) {
      context.stroke();
    }
  }
}

function beginSquareRectPath(context: CanvasSurfaceContextLike, rect: Rect): boolean {
  if (!context.beginPath || !context.rect) {
    return false;
  }

  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  return true;
}

function fillAndStrokeCurrentPath(
  context: CanvasSurfaceContextLike,
  fill: string | undefined,
  stroke: string | undefined,
  strokeWidth: number | undefined
): void {
  if (fill && context.fill) {
    context.fillStyle = fill;
    context.fill();
  }
  if (stroke && context.stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = strokeWidth ?? 1;
    context.stroke();
  }
}

function drawTextCommand(
  context: CanvasSurfaceContextLike,
  command: TextDrawCommand
): void {
  if (!context.fillText) {
    return;
  }

  context.fillStyle = command.color;
  context.font = `${command.fontWeight ?? 400} ${command.fontSize ?? 14}px sans-serif`;
  context.textAlign = command.align ?? "left";
  context.textBaseline = resolveTextBaseline(command.verticalAlign);
  context.fillText(
    command.text,
    resolveTextX(command),
    resolveTextY(command),
    command.rect.width
  );
}

function drawLineCommand(
  context: CanvasSurfaceContextLike,
  command: LineDrawCommand
): void {
  if (!context.beginPath || !context.moveTo || !context.lineTo || !context.stroke) {
    return;
  }

  context.beginPath();
  context.moveTo(command.x1, command.y1);
  context.lineTo(command.x2, command.y2);
  context.strokeStyle = command.stroke;
  context.lineWidth = command.strokeWidth ?? 1;
  context.stroke();
}

function drawCircleCommand(
  context: CanvasSurfaceContextLike,
  command: CircleDrawCommand
): void {
  if (!context.beginPath || !context.arc) {
    return;
  }

  context.beginPath();
  context.arc(command.cx, command.cy, command.radius, 0, Math.PI * 2);
  if (command.fill && context.fill) {
    context.fillStyle = command.fill;
    context.fill();
  }
  if (command.stroke && context.stroke) {
    context.strokeStyle = command.stroke;
    context.lineWidth = command.strokeWidth ?? 1;
    context.stroke();
  }
}

function drawBitmapCommand(
  context: CanvasSurfaceContextLike,
  command: BitmapDrawCommand
): void {
  if (!context.drawImage) {
    drawMissingBitmapPlaceholder(context, command);
    return;
  }

  const previousAlpha = context.globalAlpha;
  const previousSmoothing = context.imageSmoothingEnabled;
  const baseAlpha = previousAlpha ?? 1;
  const fit = command.fit ?? "stretch";
  const opacity = command.opacity ?? 1;

  context.globalAlpha = baseAlpha * opacity;
  if (typeof previousSmoothing === "boolean") {
    context.imageSmoothingEnabled = (command.sampling ?? "linear") === "linear";
  }

  try {
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
      return;
    }

    const scale =
      fit === "contain"
        ? Math.min(command.rect.width / imageWidth, command.rect.height / imageHeight)
        : Math.max(command.rect.width / imageWidth, command.rect.height / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const drawX = command.rect.x + (command.rect.width - drawWidth) / 2;
    const drawY = command.rect.y + (command.rect.height - drawHeight) / 2;

    if (fit === "cover" && context.beginPath && context.rect && context.clip) {
      context.beginPath();
      context.rect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
      context.clip();
    }

    context.drawImage(command.handle.image, drawX, drawY, drawWidth, drawHeight);
  } finally {
    if (previousAlpha === undefined) {
      delete context.globalAlpha;
    } else {
      context.globalAlpha = previousAlpha;
    }
    if (previousSmoothing === undefined) {
      delete context.imageSmoothingEnabled;
    } else {
      context.imageSmoothingEnabled = previousSmoothing;
    }
  }
}

function drawMissingBitmapPlaceholder(
  context: CanvasSurfaceContextLike,
  command: BitmapDrawCommand
): void {
  if (!context.fillRect) {
    return;
  }

  context.fillStyle = "#111827";
  context.fillRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height);
}

function drawSurfaceCommand(
  context: CanvasSurfaceContextLike,
  command: SurfaceDrawCommand
): void {
  if ((command.compositionMode ?? "copy") === "composite") {
    return;
  }

  const drawRect = command.mirrorX
    ? { x: 0, y: 0, width: command.rect.width, height: command.rect.height }
    : command.rect;

  if (command.mirrorX) {
    context.save?.();
    context.translate?.(command.rect.x + command.rect.width, command.rect.y);
    context.scale?.(-1, 1);
  }

  try {
    drawSurfaceHandle(context, command.handle, drawRect);
  } finally {
    if (command.mirrorX) {
      context.restore?.();
    }
  }
}

function drawSurfaceHandle(
  context: CanvasSurfaceContextLike,
  handle: unknown,
  rect: Rect
): void {
  if (isTouchRuntimeSurfaceSnapshotHandle(handle)) {
    drawRenderSnapshotToCanvasContext(context, handle.snapshot, {
      sourceWidth: handle.width,
      sourceHeight: handle.height,
      targetRect: rect
    });
    return;
  }

  if (isDrawableSurfaceHandle(handle)) {
    handle.draw(context, rect);
    return;
  }

  if (context.drawImage && isImageHandle(handle)) {
    context.drawImage(handle.image, rect.x, rect.y, rect.width, rect.height);
    return;
  }

  if (context.fillRect) {
    context.fillStyle = "#111827";
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
}

function resolveTextX(command: TextDrawCommand): number {
  switch (command.align) {
    case "center":
      return command.rect.x + command.rect.width / 2;
    case "right":
      return command.rect.x + command.rect.width;
    case "left":
    default:
      return command.rect.x;
  }
}

function resolveTextY(command: TextDrawCommand): number {
  switch (command.verticalAlign) {
    case "middle":
      return command.rect.y + command.rect.height / 2;
    case "bottom":
      return command.rect.y + command.rect.height;
    case "top":
    default:
      return command.rect.y;
  }
}

function resolveTextBaseline(
  verticalAlign: TextDrawCommand["verticalAlign"]
): string {
  switch (verticalAlign) {
    case "middle":
      return "middle";
    case "bottom":
      return "bottom";
    case "top":
    default:
      return "top";
  }
}

function isTouchRuntimeSurfaceSnapshotHandle(
  handle: unknown
): handle is TouchRuntimeSurfaceSnapshotHandle {
  if (typeof handle !== "object" || handle === null) {
    return false;
  }

  const candidate = handle as {
    kind?: unknown;
    width?: unknown;
    height?: unknown;
    snapshot?: unknown;
  };
  return (
    candidate.kind === "touch-os-render-snapshot" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    isRenderSnapshot(candidate.snapshot)
  );
}

function isRenderSnapshot(value: unknown): value is RenderSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { commands?: unknown }).commands)
  );
}

function isDrawableSurfaceHandle(
  handle: unknown
): handle is { draw(context: CanvasSurfaceContextLike, rect: Rect): void } {
  return (
    typeof handle === "object" &&
    handle !== null &&
    typeof (handle as { draw?: unknown }).draw === "function"
  );
}

function isImageHandle(handle: unknown): handle is { image: unknown } {
  return typeof handle === "object" && handle !== null && "image" in handle;
}
