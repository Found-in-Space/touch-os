import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import { createButtonFixture, createSliderFixture } from "../src/examples/reference-fixtures.js";
import {
  createDPad,
  createHoldButton,
  createRepeatButton,
  createSlider,
  createTextLabel,
  createToggle
} from "../src/components/index.js";
import { findCommandByRole } from "./helpers/runtime-helpers.js";

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

    const snapshot = runtime.render();
    const thumb = findCommandByRole(snapshot.commands, "slider-thumb");
    if (thumb.type !== "circle") {
      throw new Error("Expected the slider thumb to render as a circle.");
    }

    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: thumb.cx,
      surfaceY: thumb.cy,
      timestamp: 1
    });

    const dragResult = runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: thumb.cx + 90,
      surfaceY: thumb.cy,
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

  it("rejects invalid slider configuration", () => {
    expect(() =>
      createSlider("invalid-range", {
        label: "Bad",
        value: 5,
        min: 10,
        max: 10
      })
    ).toThrow(/max must be greater than min/i);

    expect(() =>
      createSlider("invalid-step", {
        label: "Bad",
        value: 5,
        min: 0,
        max: 10,
        step: 0
      })
    ).toThrow(/step must be greater than 0/i);

    expect(() =>
      createSlider("duplicate-labels", {
        label: "Bad",
        value: 5,
        min: 0,
        max: 10,
        valueLabels: [
          { value: 2, text: "Two" },
          { value: 2, text: "Deux" }
        ]
      })
    ).toThrow(/must not repeat/i);

    expect(() =>
      createSlider("out-of-range-label", {
        label: "Bad",
        value: 5,
        min: 0,
        max: 10,
        valueLabels: [{ value: 12, text: "Twelve" }]
      })
    ).toThrow(/stay within the slider range/i);
  });

  it("clamps and step-snaps slider values for rendering", () => {
    const snappedRuntime = createRuntime({
      root: createSlider("snapped-slider", {
        label: "Projection",
        value: 9,
        min: 0,
        max: 10,
        step: 4
      }),
      surface: { width: 260, height: 120 }
    });

    const snappedValue = findCommandByRole(snappedRuntime.render().commands, "slider-value");
    if (snappedValue.type !== "text") {
      throw new Error("Expected slider value text.");
    }
    expect(snappedValue.text).toBe("8");

    const clampedRuntime = createRuntime({
      root: createSlider("clamped-slider", {
        label: "Brightness",
        value: 200,
        min: 0,
        max: 10,
        step: 2
      }),
      surface: { width: 260, height: 120 }
    });

    const clampedValue = findCommandByRole(clampedRuntime.render().commands, "slider-value");
    if (clampedValue.type !== "text") {
      throw new Error("Expected slider value text.");
    }
    expect(clampedValue.text).toBe("10");
  });

  it("renders mapped and explicit slider value text", () => {
    const mappedRuntime = createRuntime({
      root: createSlider("mapped-slider", {
        label: "Projection",
        value: 2,
        min: 0,
        max: 4,
        step: 1,
        valueLabels: [{ value: 2, text: "Frustum" }]
      }),
      surface: { width: 260, height: 120 }
    });

    const mappedValue = findCommandByRole(mappedRuntime.render().commands, "slider-value");
    if (mappedValue.type !== "text") {
      throw new Error("Expected slider value text.");
    }
    expect(mappedValue.text).toBe("Frustum");

    const explicitRuntime = createRuntime({
      root: createSlider("explicit-slider", {
        label: "Zoom",
        value: 1.25,
        min: 1,
        max: 2,
        step: 0.25,
        valueText: "1.25x",
        valueLabels: [{ value: 1.25, text: "Mapped" }]
      }),
      surface: { width: 260, height: 120 }
    });

    const explicitValue = findCommandByRole(explicitRuntime.render().commands, "slider-value");
    if (explicitValue.type !== "text") {
      throw new Error("Expected slider value text.");
    }
    expect(explicitValue.text).toBe("1.25x");
  });

  it("jumps on track press and dedupes drag updates within the same step", () => {
    const runtime = createRuntime({
      root: createSlider("track-slider", {
        label: "Brightness",
        value: 50,
        min: 0,
        max: 100,
        step: 10
      }),
      surface: { width: 260, height: 120 }
    });

    const snapshot = runtime.render();
    const track = findCommandByRole(snapshot.commands, "slider-track");
    if (track.type !== "rect") {
      throw new Error("Expected the slider track to render as a rect.");
    }

    const startX = track.rect.x + track.rect.width * 0.8;
    const centerY = track.rect.y + track.rect.height / 2;
    const downResult = runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: startX,
      surfaceY: centerY,
      timestamp: 1
    });
    expect(downResult.outputs).toContainEqual({
      type: "change-request",
      componentId: "track-slider",
      field: "value",
      value: 80
    });

    const sameStepMove = runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: startX + 7,
      surfaceY: centerY,
      timestamp: 2
    });
    expect(
      sameStepMove.outputs.some((output) => output.type === "change-request")
    ).toBe(false);

    const nextStepMove = runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: startX + 30,
      surfaceY: centerY,
      timestamp: 3
    });
    expect(nextStepMove.outputs).toContainEqual({
      type: "change-request",
      componentId: "track-slider",
      field: "value",
      value: 90
    });
  });

  it("cleans up slider drag state on cancel and stays non-interactive when disabled", () => {
    const runtime = createRuntime({
      root: createSlider("cancel-slider", {
        label: "Brightness",
        value: 50,
        min: 0,
        max: 100,
        step: 10
      }),
      surface: { width: 260, height: 120 }
    });

    const snapshot = runtime.render();
    const thumb = findCommandByRole(snapshot.commands, "slider-thumb");
    const track = findCommandByRole(snapshot.commands, "slider-track");
    if (thumb.type !== "circle" || track.type !== "rect") {
      throw new Error("Expected slider thumb and track commands.");
    }

    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: thumb.cx,
      surfaceY: thumb.cy,
      timestamp: 1
    });
    runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: thumb.cx + 90,
      surfaceY: thumb.cy,
      timestamp: 2
    });
    runtime.takeOutputs();

    const cancelResult = runtime.dispatchInput({
      type: "cancel",
      surfaceX: -1,
      surfaceY: -1,
      timestamp: 3
    });
    expect(cancelResult.outputs).toHaveLength(0);

    const afterCancelMove = runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: thumb.cx + 100,
      surfaceY: thumb.cy,
      timestamp: 4
    });
    expect(
      afterCancelMove.outputs.some((output) => output.type === "change-request")
    ).toBe(false);

    runtime.setRoot(
      createSlider("cancel-slider", {
        label: "Brightness",
        value: 50,
        min: 0,
        max: 100,
        step: 10,
        disabled: true
      })
    );

    const disabledSnapshot = runtime.render();
    const disabledLabel = findCommandByRole(disabledSnapshot.commands, "slider-label");
    if (disabledLabel.type !== "text") {
      throw new Error("Expected slider label text.");
    }
    expect(disabledLabel.color).toBe(runtime.getServices().theme.getTokens().mutedTextColor);

    const disabledDown = runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: track.rect.x + track.rect.width / 2,
      surfaceY: track.rect.y + track.rect.height / 2,
      timestamp: 5
    });
    expect(disabledDown.handled).toBe(false);
    expect(disabledDown.outputs).toHaveLength(0);
    expect(runtime.getInteraction().focusedComponentId).toBeUndefined();
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
