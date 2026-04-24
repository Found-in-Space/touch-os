import { describe, expect, it } from "vitest";
import {
  createMovableWindow,
  createRuntime,
  createTextLabel
} from "../src/index.js";

describe("movable window", () => {
  it("moves by drag-handle drag and clamps inside the surface bounds", () => {
    const runtime = createRuntime({
      root: createMovableWindow("window", {
        initialRect: { x: 20, y: 20, width: 120, height: 80 },
        child: createTextLabel("window-body", {
          text: "Body"
        })
      }),
      surface: { width: 200, height: 120 }
    });

    runtime.render();

    runtime.dispatchInput({
      type: "pointer-down",
      timestamp: 1,
      pointerId: "p1",
      pointerType: "mouse",
      surfaceX: 40,
      surfaceY: 30
    });
    runtime.dispatchInput({
      type: "pointer-move",
      timestamp: 2,
      pointerId: "p1",
      pointerType: "mouse",
      surfaceX: 180,
      surfaceY: 90
    });
    runtime.dispatchInput({
      type: "pointer-up",
      timestamp: 3,
      pointerId: "p1",
      pointerType: "mouse",
      surfaceX: 180,
      surfaceY: 90
    });

    runtime.render();
    expect(runtime.getBounds("window-body")).toEqual({
      x: 80,
      y: 66,
      width: 120,
      height: 54
    });
  });
});
