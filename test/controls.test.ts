import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import { createButtonFixture, createSliderFixture } from "../src/examples/reference-fixtures.js";
import { createToggle } from "../src/components/index.js";

describe("built-in controls", () => {
  it("emits button actions through one-way output flow", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 180, height: 100 }
    });

    runtime.render();
    const bounds = runtime.getBounds("fixture-button");
    expect(bounds).toBeDefined();

    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 1
    });

    const result = runtime.dispatchInput({
      type: "pointer-up",
      surfaceX: (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 2
    });

    expect(runtime.getInteraction().focusedComponentId).toBe("fixture-button");
    expect(result.outputs).toContainEqual({
      type: "action",
      actionId: "fixture.confirm",
      componentId: "fixture-button"
    });
  });

  it("emits slider change requests during drag without mutating application props", () => {
    const runtime = createRuntime({
      root: createSliderFixture(50),
      surface: { width: 260, height: 120 }
    });

    runtime.render();
    const bounds = runtime.getBounds("fixture-slider");
    expect(bounds).toBeDefined();

    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (bounds?.x ?? 0) + 24,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) - 8,
      timestamp: 1
    });

    const dragResult = runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: (bounds?.x ?? 0) + (bounds?.width ?? 0) - 24,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) - 8,
      timestamp: 2
    });

    const request = dragResult.outputs.find((output) => output.type === "change-request");
    expect(request).toBeDefined();
    expect(request).toMatchObject({
      type: "change-request",
      componentId: "fixture-slider",
      field: "value"
    });
    if (request?.type === "change-request") {
      expect(request.value).toBeGreaterThan(50);
    }
  });

  it("emits toggle change requests as controlled updates", () => {
    const runtime = createRuntime({
      root: createToggle("test-toggle", {
        label: "Show Labels",
        value: false,
        field: "showLabels"
      }),
      surface: { width: 220, height: 80 }
    });

    runtime.render();
    const bounds = runtime.getBounds("test-toggle");
    expect(bounds).toBeDefined();

    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (bounds?.x ?? 0) + 20,
      surfaceY: (bounds?.y ?? 0) + 20,
      timestamp: 1
    });
    const result = runtime.dispatchInput({
      type: "pointer-up",
      surfaceX: (bounds?.x ?? 0) + 20,
      surfaceY: (bounds?.y ?? 0) + 20,
      timestamp: 2
    });

    expect(result.outputs).toContainEqual({
      type: "change-request",
      componentId: "test-toggle",
      field: "showLabels",
      value: true
    });
  });
});
