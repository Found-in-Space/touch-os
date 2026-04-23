import { createInsets, createRect, type Insets, type Rect, type Size } from "../core/geometry.js";

export interface ChildCollection {
  getChildren(): readonly { id: string }[];
}

export interface ChildMeasureCollection extends ChildCollection {
  measureChild(childId: string): Size;
}

export interface ChildLayoutCollection extends ChildCollection {
  getMeasuredSize(childId: string): Size;
  setChildBounds(childId: string, rect: Rect): void;
}

export function resolvePadding(
  padding: number | Partial<Insets> | undefined,
  fallback: number
): Insets {
  return createInsets(padding ?? fallback);
}

export function measureVerticalChildren(
  collection: ChildMeasureCollection,
  padding: Insets,
  gap: number
): Size {
  let width = 0;
  let height = 0;
  let first = true;
  for (const child of collection.getChildren()) {
    const size = collection.measureChild(child.id);
    width = Math.max(width, size.width);
    height += size.height;
    if (!first) {
      height += gap;
    }
    first = false;
  }

  return {
    width: width + padding.left + padding.right,
    height: height + padding.top + padding.bottom
  };
}

export function layoutVerticalChildren(
  collection: ChildLayoutCollection,
  bounds: Rect,
  padding: Insets,
  gap: number,
  offsetY = 0
): Rect {
  const inner = createRect(
    bounds.x + padding.left,
    bounds.y + padding.top - offsetY,
    Math.max(0, bounds.width - padding.left - padding.right),
    Math.max(0, bounds.height - padding.top - padding.bottom)
  );

  let nextY = inner.y;
  let totalHeight = 0;
  let first = true;

  for (const child of collection.getChildren()) {
    const size = collection.getMeasuredSize(child.id);
    if (!first) {
      nextY += gap;
      totalHeight += gap;
    }
    collection.setChildBounds(child.id, createRect(inner.x, nextY, inner.width, size.height));
    nextY += size.height;
    totalHeight += size.height;
    first = false;
  }

  return createRect(inner.x, bounds.y + padding.top, inner.width, totalHeight);
}

export function measureHorizontalChildren(
  collection: ChildMeasureCollection,
  padding: Insets,
  gap: number
): Size {
  let width = 0;
  let height = 0;
  let first = true;
  for (const child of collection.getChildren()) {
    const size = collection.measureChild(child.id);
    height = Math.max(height, size.height);
    width += size.width;
    if (!first) {
      width += gap;
    }
    first = false;
  }

  return {
    width: width + padding.left + padding.right,
    height: height + padding.top + padding.bottom
  };
}

export function layoutHorizontalChildren(
  collection: ChildLayoutCollection,
  bounds: Rect,
  padding: Insets,
  gap: number
): Rect {
  const inner = createRect(
    bounds.x + padding.left,
    bounds.y + padding.top,
    Math.max(0, bounds.width - padding.left - padding.right),
    Math.max(0, bounds.height - padding.top - padding.bottom)
  );

  let nextX = inner.x;
  let totalWidth = 0;
  let first = true;

  for (const child of collection.getChildren()) {
    const size = collection.getMeasuredSize(child.id);
    if (!first) {
      nextX += gap;
      totalWidth += gap;
    }
    collection.setChildBounds(
      child.id,
      createRect(nextX, inner.y, Math.min(size.width, Math.max(0, inner.x + inner.width - nextX)), inner.height)
    );
    nextX += size.width;
    totalWidth += size.width;
    first = false;
  }

  return createRect(inner.x, inner.y, totalWidth, inner.height);
}

export function measureStackChildren(
  collection: ChildMeasureCollection,
  padding: Insets
): Size {
  let width = 0;
  let height = 0;
  for (const child of collection.getChildren()) {
    const size = collection.measureChild(child.id);
    width = Math.max(width, size.width);
    height = Math.max(height, size.height);
  }

  return {
    width: width + padding.left + padding.right,
    height: height + padding.top + padding.bottom
  };
}

export function layoutFillChildren(
  collection: ChildLayoutCollection,
  bounds: Rect,
  padding: Insets
): Rect {
  const inner = createRect(
    bounds.x + padding.left,
    bounds.y + padding.top,
    Math.max(0, bounds.width - padding.left - padding.right),
    Math.max(0, bounds.height - padding.top - padding.bottom)
  );

  for (const child of collection.getChildren()) {
    collection.setChildBounds(child.id, inner);
  }

  return inner;
}
