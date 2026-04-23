import { describe, expect, it } from "vitest";
import { createBitmapPlot, createRuntime } from "../src/index.js";
import { createBitmapPlotFixture } from "../src/examples/reference-fixtures.js";
import { findCommandByRole, pressAt } from "./helpers/runtime-helpers.js";

describe("bitmap plot", () => {
  it("allocates a bitmap-backed body on the shared surface", () => {
    const runtime = createRuntime({
      root: createBitmapPlot("bitmap-plot", {
        points: [12, 18, 16, 24, 28, 21, 30],
        highlightedIndex: 2
      }),
      surface: { width: 320, height: 180 }
    });

    const snapshot = runtime.render();
    const body = findCommandByRole(snapshot.commands, "bitmap-plot-body");
    if (body.type !== "bitmap") {
      throw new Error("Expected the bitmap plot body to render as a bitmap command.");
    }

    expect(body.handle.kind).toBe("bitmap");
    expect(body.handle.width).toBeGreaterThan(0);
    expect(body.handle.height).toBeGreaterThan(0);
    expect(runtime.getServices().bitmaps.getMetadata("bitmap-plot:bitmap")).toEqual({
      width: body.handle.width,
      height: body.handle.height,
      revision: body.handle.revision
    });

    const highlight = findCommandByRole(snapshot.commands, "bitmap-plot-highlight-label");
    if (highlight.type !== "text") {
      throw new Error("Expected the highlighted plot label to be text.");
    }

    expect(highlight.text).toBe("16");
  });

  it("supports hover hit testing and releases its bitmap on dispose", () => {
    const runtime = createRuntime({
      root: createBitmapPlotFixture(),
      surface: { width: 320, height: 180 }
    });

    runtime.render();
    const bounds = runtime.getBounds("fixture-bitmap-plot");
    expect(bounds).toBeDefined();

    const pointX = (bounds?.x ?? 0) + (bounds?.width ?? 0) * 0.95;
    const pointY = (bounds?.y ?? 0) + (bounds?.height ?? 0) * 0.5;

    runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: pointX,
      surfaceY: pointY,
      timestamp: 1
    });

    const hoverSnapshot = runtime.render();
    const label = findCommandByRole(hoverSnapshot.commands, "bitmap-plot-highlight-label");
    if (label.type !== "text") {
      throw new Error("Expected the hovered plot label to be text.");
    }

    expect(label.text).toBe("30");

    const result = pressAt(runtime, pointX, pointY, 10);
    expect(result.outputs).toContainEqual({
      type: "action",
      actionId: "bitmap-plot.select-point",
      componentId: "fixture-bitmap-plot",
      payload: {
        index: 6
      }
    });

    runtime.dispose();
    expect(runtime.getServices().bitmaps.getHandle("fixture-bitmap-plot:bitmap")).toBeUndefined();
  });
});
