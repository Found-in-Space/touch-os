import { describe, expect, it } from "vitest";
import {
  clamp,
  clampSize,
  copyInsets,
  copyRect,
  copySize,
  createInsets,
  createPoint,
  createRect,
  createSize,
  insetRect,
  intersectRect,
  intersectsRect,
  rectContainsPoint,
  translateRect
} from "../src/core/index.js";

describe("geometry contracts", () => {
  it("creates and copies values without sharing mutable records", () => {
    const point = createPoint(1, 2);
    const size = createSize(3, 4);
    const rect = createRect(1, 2, 3, 4);
    const insets = createInsets({ top: 1, left: 2 });

    expect(point).toEqual({ x: 1, y: 2 });
    expect(size).toEqual({ width: 3, height: 4 });
    expect(createInsets(5)).toEqual({ top: 5, right: 5, bottom: 5, left: 5 });
    expect(insets).toEqual({ top: 1, right: 0, bottom: 0, left: 2 });
    expect(copyRect(rect)).toEqual(rect);
    expect(copyRect(rect)).not.toBe(rect);
    expect(copySize(size)).not.toBe(size);
    expect(copyInsets(insets)).not.toBe(insets);
  });

  it("clamps scalar, size, inset, and translated geometry", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clampSize(
      { width: -1, height: 20 },
      { minWidth: 2, maxWidth: 8, minHeight: 3, maxHeight: 12 }
    )).toEqual({ width: 2, height: 12 });
    expect(insetRect(createRect(10, 20, 30, 40), 5)).toEqual({
      x: 15,
      y: 25,
      width: 20,
      height: 30
    });
    expect(insetRect(createRect(0, 0, 4, 4), { left: 3, right: 3, top: 3, bottom: 3 }))
      .toEqual({ x: 3, y: 3, width: 0, height: 0 });
    expect(translateRect(createRect(1, 2, 3, 4), 5, -2)).toEqual({
      x: 6,
      y: 0,
      width: 3,
      height: 4
    });
  });

  it("distinguishes overlaps, separation, and edge contact", () => {
    const center = createRect(10, 10, 10, 10);
    expect(intersectsRect(center, createRect(15, 15, 10, 10))).toBe(true);
    expect(intersectsRect(center, createRect(0, 10, 5, 5))).toBe(false);
    expect(intersectsRect(center, createRect(25, 10, 5, 5))).toBe(false);
    expect(intersectsRect(center, createRect(10, 0, 5, 5))).toBe(false);
    expect(intersectsRect(center, createRect(10, 25, 5, 5))).toBe(false);
    expect(intersectsRect(center, createRect(20, 10, 5, 5))).toBe(false);

    expect(intersectRect(undefined, undefined)).toBeUndefined();
    expect(intersectRect(undefined, center)).toEqual(center);
    expect(intersectRect(center, undefined)).toEqual(center);
    expect(intersectRect(center, createRect(15, 12, 10, 20))).toEqual({
      x: 15,
      y: 12,
      width: 5,
      height: 8
    });
    expect(intersectRect(center, createRect(20, 10, 5, 5))).toBeUndefined();
    expect(intersectRect(center, createRect(10, 20, 5, 5))).toBeUndefined();
  });

  it("includes rectangle edges in point containment", () => {
    const rect = createRect(10, 20, 30, 40);
    expect(rectContainsPoint(rect, createPoint(10, 20))).toBe(true);
    expect(rectContainsPoint(rect, createPoint(40, 60))).toBe(true);
    expect(rectContainsPoint(rect, createPoint(9, 30))).toBe(false);
    expect(rectContainsPoint(rect, createPoint(41, 30))).toBe(false);
    expect(rectContainsPoint(rect, createPoint(20, 19))).toBe(false);
    expect(rectContainsPoint(rect, createPoint(20, 61))).toBe(false);
  });
});
