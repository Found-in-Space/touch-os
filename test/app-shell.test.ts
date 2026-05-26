import { describe, expect, it } from "vitest";
import {
  createAppShell,
  createRuntime,
  createTabletHomePresentation,
  createTextLabel,
  createTouchAppRegistry,
  createWindowManager,
  defineTouchApp,
  type DrawCommand,
  type TouchIconDescriptor
} from "../src/index.js";
import {
  clickComponentCenter,
  findCommandByRole,
  pressAt
} from "./helpers/runtime-helpers.js";

describe("app shell presentations", () => {
  it("starts tablet shells at home and launches apps full-screen without desktop chrome", () => {
    const registry = createTouchAppRegistry([
      createTextApp("space.test.room", "Room", [], {
        kind: "symbol",
        value: "RM"
      })
    ]);
    const runtime = createRuntime({
      root: createAppShell("tablet-os", {
        registry,
        presentation: createTabletHomePresentation(),
        appHostMode: "same-runtime",
        homeKey: true
      }),
      surface: { width: 600, height: 400 }
    });

    const homeSnapshot = runtime.render();
    expect(hasText(homeSnapshot.commands, "Apps")).toBe(true);
    const iconSymbol = findCommandByRole<DrawCommand>(homeSnapshot.commands, "tablet-app-icon-symbol");
    if (iconSymbol.type !== "text") {
      throw new Error("Expected app icon symbol to be a text command.");
    }
    expect(iconSymbol.text).toBe("RM");

    clickComponentCenter(runtime, "tablet-os:home:open:space-test-room");
    runtime.takeOutputs();
    const snapshot = runtime.render();

    expect(hasText(snapshot.commands, "Room")).toBe(true);
    expect(snapshot.commands.some((command) => command.role === "window-frame")).toBe(false);
    expect(runtime.getBounds("space.test.room:space-test-room-1:space-test-room-1-window:room-root")).toEqual({
      x: 0,
      y: 0,
      width: 600,
      height: 366
    });
  });

  it("applies safe area and shell chrome to tablet foreground app metrics", () => {
    const registry = createTouchAppRegistry([createTextApp("space.test.safe", "Safe")]);
    const runtime = createRuntime({
      root: createAppShell("tablet-os", {
        registry,
        presentation: createTabletHomePresentation(),
        appHostMode: "same-runtime",
        homeKey: true
      }),
      surface: {
        width: 600,
        height: 400,
        safeArea: { top: 10, right: 20, bottom: 30, left: 40 }
      }
    });

    runtime.render();
    clickComponentCenter(runtime, "tablet-os:home:open:space-test-safe");
    runtime.takeOutputs();

    expect(runtime.getBounds("space.test.safe:space-test-safe-1:space-test-safe-1-window:safe-root")).toEqual({
      x: 40,
      y: 10,
      width: 540,
      height: 326
    });
  });

  it("handles tablet home and task-switcher system commands", () => {
    const lifecycle: string[] = [];
    const registry = createTouchAppRegistry([createTextApp("space.test.room", "Room", lifecycle)]);
    const runtime = createRuntime({
      root: createAppShell("tablet-os", {
        registry,
        presentation: createTabletHomePresentation(),
        appHostMode: "same-runtime",
        homeKey: true
      }),
      surface: { width: 600, height: 400 }
    });

    runtime.render();
    clickComponentCenter(runtime, "tablet-os:home:open:space-test-room");
    runtime.takeOutputs();
    expect(lifecycle).toEqual(["launch", "activate"]);

    runtime.dispatchInput({
      type: "system-command",
      command: "home",
      timestamp: 10,
      source: "keyboard"
    });
    runtime.takeOutputs();
    expect(hasText(runtime.render().commands, "Apps")).toBe(true);
    expect(lifecycle).toEqual(["launch", "activate", "deactivate", "suspend"]);

    runtime.dispatchInput({
      type: "system-command",
      command: "app-switcher",
      timestamp: 11,
      source: "keyboard"
    });
    runtime.takeOutputs();
    const taskSnapshot = runtime.render();
    expect(hasText(taskSnapshot.commands, "Running")).toBe(true);
    expect(taskSnapshot.commands.some((command) => command.role === "tablet-task-card")).toBe(true);
  });

  it("can keep tablet foreground apps alive when returning home", () => {
    const lifecycle: string[] = [];
    const registry = createTouchAppRegistry([createTextApp("space.test.keep-alive", "Alive", lifecycle)]);
    const runtime = createRuntime({
      root: createAppShell("tablet-os", {
        registry,
        presentation: createTabletHomePresentation(),
        appHostMode: "same-runtime",
        homeKey: true,
        keepAlive: true
      }),
      surface: { width: 600, height: 400 }
    });

    runtime.render();
    clickComponentCenter(runtime, "tablet-os:home:open:space-test-keep-alive");
    runtime.takeOutputs();
    runtime.dispatchInput({
      type: "system-command",
      command: "home",
      timestamp: 20,
      source: "keyboard"
    });
    runtime.takeOutputs();

    expect(hasText(runtime.render().commands, "Apps")).toBe(true);
    expect(lifecycle).toEqual(["launch", "activate", "deactivate"]);
  });

  it("can close tablet task-switcher sessions when close controls are enabled", () => {
    const lifecycle: string[] = [];
    const registry = createTouchAppRegistry([createTextApp("space.test.close", "Close", lifecycle)]);
    const runtime = createRuntime({
      root: createAppShell("tablet-os", {
        registry,
        presentation: createTabletHomePresentation({ taskCloseControl: "button" }),
        appHostMode: "same-runtime",
        homeKey: true
      }),
      surface: { width: 600, height: 400 }
    });

    runtime.render();
    clickComponentCenter(runtime, "tablet-os:home:open:space-test-close");
    runtime.takeOutputs();
    runtime.dispatchInput({
      type: "system-command",
      command: "app-switcher",
      timestamp: 30,
      source: "keyboard"
    });
    runtime.takeOutputs();

    const closeCommand = findCommandByRole<DrawCommand>(runtime.render().commands, "tablet-task-close");
    if (closeCommand.type !== "rect") {
      throw new Error("Expected tablet task close command to be a rect command.");
    }
    pressAt(
      runtime,
      closeCommand.rect.x + closeCommand.rect.width / 2,
      closeCommand.rect.y + closeCommand.rect.height / 2,
      31
    );
    runtime.takeOutputs();

    expect(hasText(runtime.render().commands, "No running apps")).toBe(true);
    expect(lifecycle).toEqual(["launch", "activate", "deactivate", "close"]);
  });

  it("soft tablet home control emits and consumes a system-command event", () => {
    const registry = createTouchAppRegistry([createTextApp("space.test.soft-home", "Soft")]);
    const runtime = createRuntime({
      root: createAppShell("tablet-os", {
        registry,
        presentation: createTabletHomePresentation({ homeControl: "button" }),
        appHostMode: "same-runtime",
        homeKey: true
      }),
      surface: { width: 500, height: 320 }
    });

    runtime.render();
    clickComponentCenter(runtime, "tablet-os:home:open:space-test-soft-home");
    runtime.takeOutputs();
    clickComponentCenter(runtime, "tablet-os:tablet-screen:home-control", 20);
    const outputs = runtime.takeOutputs();

    expect(outputs).toContainEqual({
      type: "system-command",
      command: "home",
      timestamp: 21,
      source: "touch"
    });
    expect(hasText(runtime.render().commands, "Apps")).toBe(true);
  });

  it("lets createWindowManager use the tablet presentation compatibility path", () => {
    const registry = createTouchAppRegistry([createTextApp("space.test.compat", "Compat")]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        presentation: createTabletHomePresentation(),
        appHostMode: "same-runtime",
        homeKey: true
      }),
      surface: { width: 500, height: 320 }
    });

    runtime.render();
    clickComponentCenter(runtime, "tablet-os:home:open:space-test-compat");
    runtime.takeOutputs();
    expect(hasText(runtime.render().commands, "Compat")).toBe(true);
  });

  it("desktop home and app-switcher commands toggle utility surfaces", () => {
    const registry = createTouchAppRegistry([createTextApp("space.test.desktop", "Desktop")]);
    const runtime = createRuntime({
      root: createWindowManager("desktop-os", {
        registry,
        launcher: true,
        taskSwitcher: true,
        homeKey: true
      }),
      surface: { width: 500, height: 320 }
    });

    expect(runtime.getBounds("desktop-os:launcher-window")).toBeDefined();
    runtime.dispatchInput({
      type: "system-command",
      command: "home",
      timestamp: 1,
      source: "keyboard"
    });
    expect(runtime.getBounds("desktop-os:launcher-window")).toBeUndefined();
    runtime.dispatchInput({
      type: "system-command",
      command: "home",
      timestamp: 2,
      source: "keyboard"
    });
    expect(runtime.getBounds("desktop-os:launcher-window")).toBeDefined();

    expect(runtime.getBounds("desktop-os:task-switcher-window")).toBeDefined();
    runtime.dispatchInput({
      type: "system-command",
      command: "app-switcher",
      timestamp: 3,
      source: "keyboard"
    });
    expect(runtime.getBounds("desktop-os:task-switcher-window")).toBeUndefined();
  });
});

function createTextApp(
  appId: string,
  label: string,
  lifecycle: string[] = [],
  icon?: TouchIconDescriptor
) {
  return defineTouchApp({
    manifest: {
      id: appId,
      name: label,
      version: "1.0.0",
      ...(icon ? { icon } : {})
    },
    createApp() {
      return {
        render() {
          return createTextLabel(`${label.toLowerCase()}-root`, {
            text: label
          });
        },
        onLaunch() {
          lifecycle.push("launch");
        },
        onActivate() {
          lifecycle.push("activate");
        },
        onDeactivate() {
          lifecycle.push("deactivate");
        },
        onSuspend() {
          lifecycle.push("suspend");
        },
        onClose() {
          lifecycle.push("close");
        }
      };
    }
  });
}

function hasText(commands: readonly DrawCommand[], text: string): boolean {
  return commands.some((command) => command.type === "text" && command.text === text);
}
