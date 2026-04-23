import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import { createButtonFixture, createSliderFixture } from "../src/examples/reference-fixtures.js";
import {
  createDPad,
  createHoldButton,
  createRepeatButton,
  createTextLabel,
  createToggle
} from "../src/components/index.js";

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

  it("emits hold-button start and stop actions exactly once", () => {
    const runtime = createRuntime({
      root: createHoldButton("hold-test", {
        label: "Forward",
        actionId: "movement.set",
        startPayload: { intent: "forward", active: true },
        stopPayload: { intent: "forward", active: false }
      }),
      surface: { width: 220, height: 80 }
    });

    runtime.render();
    const bounds = runtime.getBounds("hold-test");
    expect(bounds).toBeDefined();

    const downResult = runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 10
    });
    expect(downResult.outputs).toContainEqual({
      type: "action",
      actionId: "movement.set",
      componentId: "hold-test",
      payload: { intent: "forward", active: true }
    });

    const upResult = runtime.dispatchInput({
      type: "pointer-up",
      surfaceX: (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 11
    });
    expect(upResult.outputs).toContainEqual({
      type: "action",
      actionId: "movement.set",
      componentId: "hold-test",
      payload: { intent: "forward", active: false }
    });
  });

  it("stops an active hold-button on cancel, disable, and unmount", () => {
    const startRoot = createHoldButton("hold-test", {
      label: "Forward",
      actionId: "movement.set",
      startPayload: { intent: "forward", active: true },
      stopPayload: { intent: "forward", active: false }
    });
    const runtime = createRuntime({
      root: startRoot,
      surface: { width: 220, height: 80 }
    });

    runtime.render();
    const bounds = runtime.getBounds("hold-test");
    expect(bounds).toBeDefined();

    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 10
    });
    runtime.takeOutputs();

    const cancelResult = runtime.dispatchInput({
      type: "cancel",
      surfaceX: -1,
      surfaceY: -1,
      timestamp: 11
    });
    expect(cancelResult.outputs).toContainEqual({
      type: "action",
      actionId: "movement.set",
      componentId: "hold-test",
      payload: { intent: "forward", active: false }
    });

    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 20
    });
    runtime.takeOutputs();

    runtime.setRoot(
      createHoldButton("hold-test", {
        label: "Forward",
        actionId: "movement.set",
        startPayload: { intent: "forward", active: true },
        stopPayload: { intent: "forward", active: false },
        disabled: true
      })
    );
    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "movement.set",
      componentId: "hold-test",
      payload: { intent: "forward", active: false }
    });

    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 30
    });
    expect(runtime.takeOutputs()).toHaveLength(0);

    runtime.setRoot(startRoot);
    runtime.render();
    const refreshedBounds = runtime.getBounds("hold-test");
    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (refreshedBounds?.x ?? 0) + (refreshedBounds?.width ?? 0) / 2,
      surfaceY: (refreshedBounds?.y ?? 0) + (refreshedBounds?.height ?? 0) / 2,
      timestamp: 40
    });
    runtime.takeOutputs();

    runtime.setRoot(
      createTextLabel("replacement", {
        text: "Done"
      })
    );
    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "movement.set",
      componentId: "hold-test",
      payload: { intent: "forward", active: false }
    });
  });

  it("repeats using runtime ticks and stops immediately on release", () => {
    const runtime = createRuntime({
      root: createRepeatButton("repeat-test", {
        label: "Faster",
        actionId: "moveSpeed.adjust",
        payload: { delta: 0.2 }
      }),
      surface: { width: 220, height: 80 }
    });

    runtime.render();
    const bounds = runtime.getBounds("repeat-test");
    expect(bounds).toBeDefined();

    const downResult = runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 1
    });
    expect(downResult.outputs).toContainEqual({
      type: "action",
      actionId: "moveSpeed.adjust",
      componentId: "repeat-test",
      payload: { delta: 0.2 }
    });
    runtime.takeOutputs();

    runtime.tick(250);
    expect(runtime.takeOutputs()).toHaveLength(0);

    runtime.tick(301);
    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "moveSpeed.adjust",
      componentId: "repeat-test",
      payload: { delta: 0.2 }
    });

    runtime.tick(481);
    const repeatOutputs = runtime.takeOutputs();
    expect(repeatOutputs).toHaveLength(2);
    expect(repeatOutputs.every((output) => output.type === "action")).toBe(true);

    runtime.dispatchInput({
      type: "pointer-up",
      surfaceX: (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 482
    });
    runtime.tick(700);
    expect(runtime.takeOutputs()).toHaveLength(0);
  });

  it("keeps D-pad input discrete and does not drag-switch directions", () => {
    const runtime = createRuntime({
      root: createDPad("move-dpad", {
        up: {
          label: "Fwd",
          actionId: "movement.set",
          startPayload: { intent: "forward", active: true },
          stopPayload: { intent: "forward", active: false }
        },
        left: {
          label: "Left",
          actionId: "movement.set",
          startPayload: { intent: "strafeLeft", active: true },
          stopPayload: { intent: "strafeLeft", active: false }
        }
      }),
      surface: { width: 180, height: 180 }
    });

    runtime.render();
    const bounds = runtime.getBounds("move-dpad");
    if (!bounds) {
      throw new Error("Expected D-pad bounds.");
    }

    const downResult = runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: bounds.x + bounds.width / 6,
      surfaceY: bounds.y + bounds.height / 2,
      timestamp: 1
    });
    expect(downResult.outputs).toContainEqual({
      type: "action",
      actionId: "movement.set",
      componentId: "move-dpad",
      payload: { intent: "strafeLeft", active: true }
    });

    const moveResult = runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: bounds.x + bounds.width / 2,
      surfaceY: bounds.y + bounds.height / 6,
      timestamp: 2
    });
    expect(moveResult.outputs).toHaveLength(0);

    const upResult = runtime.dispatchInput({
      type: "pointer-up",
      surfaceX: bounds.x + bounds.width / 2,
      surfaceY: bounds.y + bounds.height / 6,
      timestamp: 3
    });
    expect(upResult.outputs).toContainEqual({
      type: "action",
      actionId: "movement.set",
      componentId: "move-dpad",
      payload: { intent: "strafeLeft", active: false }
    });
  });
});
