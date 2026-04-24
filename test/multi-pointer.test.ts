import { describe, expect, it } from "vitest";
import { createButton, createColumn, createRuntime } from "../src/index.js";

describe("runtime multi-pointer dispatch", () => {
  it("keeps concurrent pointer presses independent", () => {
    const runtime = createRuntime({
      root: createColumn("multi-pointer-root", {
        children: [
          createButton("left-button", {
            label: "Left",
            actionId: "left.run"
          }),
          createButton("right-button", {
            label: "Right",
            actionId: "right.run"
          })
        ]
      }),
      surface: { width: 260, height: 140 }
    });

    runtime.render();
    const leftBounds = runtime.getBounds("left-button");
    const rightBounds = runtime.getBounds("right-button");
    expect(leftBounds).toBeDefined();
    expect(rightBounds).toBeDefined();

    runtime.dispatchInput({
      type: "pointer-down",
      pointerId: "pointer-left",
      surfaceX: (leftBounds?.x ?? 0) + (leftBounds?.width ?? 0) / 2,
      surfaceY: (leftBounds?.y ?? 0) + (leftBounds?.height ?? 0) / 2,
      timestamp: 1
    });
    runtime.dispatchInput({
      type: "pointer-down",
      pointerId: "pointer-right",
      surfaceX: (rightBounds?.x ?? 0) + (rightBounds?.width ?? 0) / 2,
      surfaceY: (rightBounds?.y ?? 0) + (rightBounds?.height ?? 0) / 2,
      timestamp: 2
    });

    const rightRelease = runtime.dispatchInput({
      type: "pointer-up",
      pointerId: "pointer-right",
      surfaceX: (rightBounds?.x ?? 0) + (rightBounds?.width ?? 0) / 2,
      surfaceY: (rightBounds?.y ?? 0) + (rightBounds?.height ?? 0) / 2,
      timestamp: 3
    });
    const leftRelease = runtime.dispatchInput({
      type: "pointer-up",
      pointerId: "pointer-left",
      surfaceX: (leftBounds?.x ?? 0) + (leftBounds?.width ?? 0) / 2,
      surfaceY: (leftBounds?.y ?? 0) + (leftBounds?.height ?? 0) / 2,
      timestamp: 4
    });

    expect(rightRelease.outputs).toContainEqual({
      type: "action",
      actionId: "right.run",
      componentId: "right-button"
    });
    expect(leftRelease.outputs).toContainEqual({
      type: "action",
      actionId: "left.run",
      componentId: "left-button"
    });
  });
});
