import { describe, expect, it } from "vitest";
import {
  createButton,
  createNode,
  createRuntime,
  createWindow,
  createWindowLayer,
  type DisplayComponent,
  type DrawCommand,
  type Rect,
  type RuntimeOutput,
  type WindowStateChangeEvent
} from "../src/index.js";
import { pressAt } from "./helpers/runtime-helpers.js";

describe("window layer", () => {
  it("lays out fixed window rects and renders higher z-index windows last", () => {
    const runtime = createRuntime({
      root: createWindowLayer("windows", {
        windows: [
          createWindow("back-window", {
            title: "Back",
            rect: { x: 8, y: 10, width: 90, height: 70 },
            zIndex: 1,
            child: createProbeNode("back-content")
          }),
          createWindow("front-window", {
            title: "Front",
            rect: { x: 24, y: 22, width: 90, height: 70 },
            zIndex: 2,
            child: createProbeNode("front-content")
          })
        ]
      }),
      surface: { width: 180, height: 120 }
    });

    const snapshot = runtime.render();

    expect(runtime.getBounds("back-window")).toEqual({
      x: 8,
      y: 10,
      width: 90,
      height: 70
    });
    expect(runtime.getBounds("front-window")).toEqual({
      x: 24,
      y: 22,
      width: 90,
      height: 70
    });
    expect(getFrameOrder(snapshot.commands)).toEqual(["back-window", "front-window"]);
  });

  it("raises and focuses a pressed window", () => {
    const runtime = createRuntime({
      root: createWindowLayer("windows", {
        windows: [
          createWindow("back-window", {
            title: "Back",
            rect: { x: 8, y: 10, width: 90, height: 70 },
            zIndex: 1,
            child: createProbeNode("back-content")
          }),
          createWindow("front-window", {
            title: "Front",
            rect: { x: 24, y: 22, width: 90, height: 70 },
            zIndex: 2,
            child: createProbeNode("front-content")
          })
        ]
      }),
      surface: { width: 180, height: 120 }
    });

    runtime.render();
    pressAt(runtime, 12, 16);
    const outputs = runtime.takeOutputs();
    const snapshot = runtime.render();

    expect(getFrameOrder(snapshot.commands)).toEqual(["front-window", "back-window"]);
    expect(outputs).toContainEqual({
      type: "window-state-change",
      componentId: "windows",
      windowId: "back-window",
      change: "focus",
      rect: { x: 8, y: 10, width: 90, height: 70 },
      zIndex: 3,
      focused: true,
      mode: "normal",
      previousZIndex: 1
    });
  });

  it("renders compact line icons for window controls", () => {
    const runtime = createRuntime({
      root: createWindowLayer("windows", {
        windows: [
          createWindow("tool-window", {
            title: "Tool",
            rect: { x: 10, y: 8, width: 130, height: 70 },
            controls: ["close", "minimize", "maximize", "fullscreen"],
            child: createProbeNode("tool-content")
          })
        ]
      }),
      surface: { width: 200, height: 120 }
    });

    let snapshot = runtime.render();
    const fullscreenControl = getSingleRectByRole(snapshot.commands, "window-control-fullscreen");
    expect(fullscreenControl.rect.width).toBeLessThanOrEqual(18);
    expect(snapshot.commands.some((command) => command.role?.endsWith("-label"))).toBe(false);
    expect(getLinesByRole(snapshot.commands, "window-control-close-icon")).toHaveLength(2);
    expect(getLinesByRole(snapshot.commands, "window-control-minimize-icon")).toHaveLength(1);
    expect(getLinesByRole(snapshot.commands, "window-control-maximize-icon")).toHaveLength(4);
    expect(getLinesByRole(snapshot.commands, "window-control-fullscreen-expand-icon")).toHaveLength(8);

    runtime.setRoot(
      createWindowLayer("windows", {
        windows: [
          createWindow("tool-window", {
            title: "Tool",
            rect: { x: 10, y: 8, width: 130, height: 70 },
            mode: "fullscreen",
            controls: ["fullscreen"],
            child: createProbeNode("tool-content")
          })
        ]
      })
    );

    snapshot = runtime.render();
    expect(getLinesByRole(snapshot.commands, "window-control-fullscreen-restore-icon")).toHaveLength(7);
    expect(getLinesByRole(snapshot.commands, "window-control-fullscreen-expand-icon")).toHaveLength(0);
  });

  it("drags the handle and clamps the window inside the layer bounds", () => {
    const runtime = createRuntime({
      root: createWindowLayer("windows", {
        constraintPadding: 5,
        windows: [
          createWindow("tool-window", {
            title: "Tool",
            rect: { x: 10, y: 8, width: 80, height: 50 },
            child: createProbeNode("tool-content")
          })
        ]
      }),
      surface: { width: 200, height: 120 },
      dragThreshold: 1
    });

    runtime.render();
    runtime.dispatchInput({
      type: "pointer-down",
      pointerId: "mouse",
      surfaceX: 20,
      surfaceY: 18,
      timestamp: 1
    });
    runtime.dispatchInput({
      type: "pointer-move",
      pointerId: "mouse",
      surfaceX: 500,
      surfaceY: 500,
      timestamp: 2
    });
    runtime.dispatchInput({
      type: "pointer-up",
      pointerId: "mouse",
      surfaceX: 500,
      surfaceY: 500,
      timestamp: 3
    });
    const outputs = runtime.takeOutputs().filter(isWindowStateChange);
    runtime.render();

    expect(runtime.getBounds("tool-window")).toEqual({
      x: 115,
      y: 65,
      width: 80,
      height: 50
    });
    expect(outputs.at(-1)).toMatchObject({
      type: "window-state-change",
      componentId: "windows",
      windowId: "tool-window",
      change: "move",
      rect: { x: 115, y: 65, width: 80, height: 50 },
      previousRect: { x: 10, y: 8, width: 80, height: 50 },
      mode: "normal"
    });
  });

  it("does not drag from window content", () => {
    const runtime = createRuntime({
      root: createWindowLayer("windows", {
        windows: [
          createWindow("tool-window", {
            title: "Tool",
            rect: { x: 10, y: 8, width: 90, height: 70 },
            child: createButton("content-button", {
              label: "Run",
              actionId: "run"
            })
          })
        ]
      }),
      surface: { width: 200, height: 120 },
      dragThreshold: 1
    });

    runtime.render();
    runtime.dispatchInput({
      type: "pointer-down",
      pointerId: "mouse",
      surfaceX: 20,
      surfaceY: 50,
      timestamp: 1
    });
    runtime.dispatchInput({
      type: "pointer-move",
      pointerId: "mouse",
      surfaceX: 100,
      surfaceY: 90,
      timestamp: 2
    });
    runtime.dispatchInput({
      type: "pointer-up",
      pointerId: "mouse",
      surfaceX: 100,
      surfaceY: 90,
      timestamp: 3
    });
    runtime.render();

    expect(runtime.getBounds("tool-window")).toEqual({
      x: 10,
      y: 8,
      width: 90,
      height: 70
    });
    expect(runtime.takeOutputs().some(isMoveChange)).toBe(false);
  });

  it("emits close control changes and removes the closed window from layout", () => {
    const runtime = createRuntime({
      root: createWindowLayer("windows", {
        windows: [
          createWindow("closable-window", {
            title: "Closable",
            rect: { x: 10, y: 8, width: 90, height: 70 },
            controls: ["close"],
            child: createProbeNode("closable-content")
          })
        ]
      }),
      surface: { width: 200, height: 120 }
    });

    runtime.render();
    pressAt(runtime, 90, 21);
    const outputs = runtime.takeOutputs();
    runtime.render();

    expect(runtime.getBounds("closable-window")).toBeUndefined();
    expect(outputs).toContainEqual({
      type: "window-state-change",
      componentId: "windows",
      windowId: "closable-window",
      change: "close",
      rect: { x: 10, y: 8, width: 0, height: 0 },
      zIndex: 0,
      focused: false,
      mode: "closed",
      previousRect: { x: 10, y: 8, width: 90, height: 70 },
      previousMode: "normal"
    });
  });

  it("supports minimize and maximize controls", () => {
    const runtime = createRuntime({
      root: createWindowLayer("windows", {
        windows: [
          createWindow("tool-window", {
            title: "Tool",
            rect: { x: 10, y: 8, width: 90, height: 70 },
            controls: ["minimize", "maximize"],
            child: createProbeNode("tool-content")
          })
        ]
      }),
      surface: { width: 200, height: 120 }
    });

    runtime.render();
    pressAt(runtime, 90, 21);
    runtime.render();
    expect(runtime.getBounds("tool-window")).toEqual({
      x: 10,
      y: 8,
      width: 90,
      height: 27
    });

    pressAt(runtime, 64, 21);
    runtime.takeOutputs();
    runtime.render();
    pressAt(runtime, 90, 21);
    runtime.render();

    expect(runtime.getBounds("tool-window")).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 120
    });
  });
});

function createProbeNode(id: string) {
  const component: DisplayComponent<Record<string, never>> = {
    kind: "window-probe",
    measure(ctx) {
      return {
        width: ctx.constraints.maxWidth,
        height: ctx.constraints.maxHeight
      };
    },
    render() {
      return [];
    },
    hitTest() {
      return null;
    }
  };

  return createNode(id, component, {});
}

function getFrameOrder(commands: readonly DrawCommand[]): string[] {
  return commands
    .filter((command) => command.type === "rect" && command.role === "window-frame")
    .map((command) => command.componentId);
}

function getSingleRectByRole(commands: readonly DrawCommand[], role: string): Extract<DrawCommand, { type: "rect" }> {
  const command = commands.find(
    (entry): entry is Extract<DrawCommand, { type: "rect" }> =>
      entry.type === "rect" && entry.role === role
  );
  if (!command) {
    throw new Error(`Expected rect command with role "${role}".`);
  }
  return command;
}

function getLinesByRole(commands: readonly DrawCommand[], role: string): Array<Extract<DrawCommand, { type: "line" }>> {
  return commands.filter(
    (command): command is Extract<DrawCommand, { type: "line" }> =>
      command.type === "line" && command.role === role
  );
}

function isWindowStateChange(output: RuntimeOutput): output is WindowStateChangeEvent {
  return output.type === "window-state-change";
}

function isMoveChange(output: RuntimeOutput): boolean {
  return output.type === "window-state-change" && output.change === "move";
}
