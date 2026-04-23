export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutConstraints {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

export interface MeasureResult extends Size {}

export const ZERO_POINT: Point = { x: 0, y: 0 };
export const ZERO_SIZE: Size = { width: 0, height: 0 };
export const ZERO_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };
export const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export function createPoint(x: number, y: number): Point {
  return { x, y };
}

export function createSize(width: number, height: number): Size {
  return { width, height };
}

export function createRect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function createInsets(value: number | Partial<Insets> = 0): Insets {
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }

  return {
    top: value.top ?? 0,
    right: value.right ?? 0,
    bottom: value.bottom ?? 0,
    left: value.left ?? 0
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clampSize(size: Size, constraints: LayoutConstraints): Size {
  return {
    width: clamp(size.width, constraints.minWidth, constraints.maxWidth),
    height: clamp(size.height, constraints.minHeight, constraints.maxHeight)
  };
}

export function insetRect(rect: Rect, value: number | Partial<Insets>): Rect {
  const insets = createInsets(value);
  return {
    x: rect.x + insets.left,
    y: rect.y + insets.top,
    width: Math.max(0, rect.width - insets.left - insets.right),
    height: Math.max(0, rect.height - insets.top - insets.bottom)
  };
}

export function translateRect(rect: Rect, dx: number, dy: number): Rect {
  return {
    x: rect.x + dx,
    y: rect.y + dy,
    width: rect.width,
    height: rect.height
  };
}

export function intersectsRect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function intersectRect(a: Rect | undefined, b: Rect | undefined): Rect | undefined {
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

  if (right <= x || bottom <= y) {
    return undefined;
  }

  return {
    x,
    y,
    width: right - x,
    height: bottom - y
  };
}

export function rectContainsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function copyRect(rect: Rect): Rect {
  return { ...rect };
}

export function copySize(size: Size): Size {
  return { ...size };
}

export function copyInsets(insets: Insets): Insets {
  return { ...insets };
}
