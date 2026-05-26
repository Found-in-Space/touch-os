import { describe, expect, it } from "vitest";
import {
  createButton,
  createEmbeddedSurfaceService,
  createRepeatButton,
  createRuntime,
  createTextLabel,
  createTouchAppRegistry,
  createWindowManager,
  defineTouchApp,
  type DrawCommand,
  type RuntimeOutput,
  type TouchAppEvent,
  type TouchRuntimeSurfaceHandle,
  type TouchWindowState
} from "../src/index.js";
import {
  clickComponentCenter,
  findCommandByRole,
  pressAt
} from "./helpers/runtime-helpers.js";

describe("window manager", () => {
  it("hosts app roots in one runtime with scoped component ids", () => {
    const registry = createTouchAppRegistry([
      createButtonApp("space.test.one", "One"),
      createButtonApp("space.test.two", "Two")
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        initialWindows: [
          createManagedWindow("one-window", "space.test.one", "one-1", 1),
          createManagedWindow("two-window", "space.test.two", "two-1", 2)
        ]
      }),
      surface: { width: 560, height: 320 }
    });

    expect(() => runtime.render()).not.toThrow();
    expect(runtime.getBounds("space.test.one:one-1:one-window:shared-button")).toBeDefined();
    expect(runtime.getBounds("space.test.two:two-1:two-window:shared-button")).toBeDefined();
  });

  it("hosts two same-runtime windows for the same app without local id collisions", () => {
    const registry = createTouchAppRegistry([
      createButtonApp("space.test.duplicate", "Duplicate")
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        initialWindows: [
          createManagedWindow("first-window", "space.test.duplicate", "duplicate-1", 1),
          createManagedWindow("second-window", "space.test.duplicate", "duplicate-2", 2)
        ]
      }),
      surface: { width: 560, height: 320 }
    });

    expect(() => runtime.render()).not.toThrow();
    expect(
      runtime.getBounds("space.test.duplicate:duplicate-1:first-window:shared-button")
    ).toBeDefined();
    expect(
      runtime.getBounds("space.test.duplicate:duplicate-2:second-window:shared-button")
    ).toBeDefined();
  });

  it("forwards scoped app outputs to app instances without the namespace", () => {
    const handledOutputs: RuntimeOutput[] = [];
    const appEvents: TouchAppEvent[] = [];
    const registry = createTouchAppRegistry([
      defineTouchApp({
        manifest: {
          id: "space.test.settings",
          name: "Settings",
          version: "1.0.0"
        },
        createApp(ctx) {
          return {
            render() {
              return createButton("shared-button", {
                label: "Sync",
                actionId: "settings.sync"
              });
            },
            handleOutput(output) {
              handledOutputs.push(output);
              if (output.type === "action") {
                ctx.actions.emit({
                  type: "app-action",
                  name: output.componentId
                });
              }
            }
          };
        }
      })
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        onAppEvent(event) {
          appEvents.push(event);
        },
        initialWindows: [
          createManagedWindow("settings-window", "space.test.settings", "settings-1", 1)
        ]
      }),
      surface: { width: 420, height: 280 }
    });

    runtime.render();
    clickComponentCenter(runtime, "space.test.settings:settings-1:settings-window:shared-button");
    const outputs = runtime.takeOutputs();

    expect(handledOutputs).toContainEqual({
      type: "action",
      actionId: "settings.sync",
      componentId: "shared-button"
    });
    expect(appEvents).toContainEqual({
      type: "app-action",
      appId: "space.test.settings",
      instanceId: "settings-1",
      windowId: "settings-window",
      name: "shared-button"
    });
    expect(outputs).toContainEqual({
      type: "app-event",
      componentId: "tablet-os",
      appId: "space.test.settings",
      instanceId: "settings-1",
      windowId: "settings-window",
      event: {
        type: "app-action",
        appId: "space.test.settings",
        instanceId: "settings-1",
        windowId: "settings-window",
        name: "shared-button"
      }
    });
  });

  it("updates app lifecycle and emits manager changes when focus moves", () => {
    const firstLifecycle: string[] = [];
    const secondLifecycle: string[] = [];
    const registry = createTouchAppRegistry([
      createLifecycleApp("space.test.first", firstLifecycle),
      createLifecycleApp("space.test.second", secondLifecycle)
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        initialWindows: [
          {
            ...createManagedWindow("first-window", "space.test.first", "first-1", 1),
            focused: true
          },
          {
            ...createManagedWindow("second-window", "space.test.second", "second-1", 2),
            rect: { x: 240, y: 20, width: 180, height: 130 }
          }
        ]
      }),
      surface: { width: 520, height: 260 }
    });

    runtime.render();
    pressAt(runtime, 250, 30);
    const outputs = runtime.takeOutputs();

    expect(firstLifecycle).toEqual(["launch", "activate", "deactivate"]);
    expect(secondLifecycle).toEqual(["launch", "activate"]);
    expect(outputs).toContainEqual({
      type: "window-manager-change",
      componentId: "tablet-os",
      change: "window-state",
      windowId: "second-window",
      appId: "space.test.second",
      instanceId: "second-1",
      rect: { x: 240, y: 20, width: 180, height: 130 },
      zIndex: 4,
      focused: true,
      mode: "normal"
    });
  });

  it("lets apps request window title changes through the app context", () => {
    const registry = createTouchAppRegistry([
      defineTouchApp({
        manifest: {
          id: "space.test.title",
          name: "Title",
          version: "1.0.0"
        },
        createApp(ctx) {
          return {
            render() {
              return createButton("rename-button", {
                label: "Rename",
                actionId: "title.rename"
              });
            },
            handleOutput(output) {
              if (output.type === "action") {
                ctx.windows.setTitle("Renamed");
              }
            }
          };
        }
      })
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        initialWindows: [createManagedWindow("title-window", "space.test.title", "title-1", 1)]
      }),
      surface: { width: 420, height: 280 }
    });

    runtime.render();
    clickComponentCenter(runtime, "space.test.title:title-1:title-window:rename-button");
    const outputs = runtime.takeOutputs();
    const snapshot = runtime.render();

    expect(outputs).toContainEqual({
      type: "window-manager-change",
      componentId: "tablet-os",
      change: "set-title",
      windowId: "title-window",
      appId: "space.test.title",
      instanceId: "title-1",
      title: "Renamed"
    });
    expect(
      snapshot.commands.some(
        (command) =>
          command.type === "text" &&
          command.role === "window-title" &&
          command.componentId === "title-window" &&
          command.text === "Renamed"
      )
    ).toBe(true);
  });

  it("hosts app content in child runtimes through embedded surfaces", () => {
    const handledOutputs: RuntimeOutput[] = [];
    const surfaces = createEmbeddedSurfaceService();
    const registry = createTouchAppRegistry([
      defineTouchApp({
        manifest: {
          id: "space.test.child",
          name: "Child",
          version: "1.0.0"
        },
        createApp(ctx) {
          return {
            render() {
              return createButton("shared-button", {
                label: "Run",
                actionId: "child.run"
              });
            },
            handleOutput(output) {
              handledOutputs.push(output);
              if (output.type === "action") {
                ctx.actions.emit({
                  type: "app-action",
                  name: output.componentId
                });
              }
            }
          };
        }
      })
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        appHostMode: "child-runtime",
        initialWindows: [createManagedWindow("child-window", "space.test.child", "child-1", 1)]
      }),
      surface: { width: 420, height: 280 },
      services: { surfaces }
    });

    const snapshot = runtime.render();
    const viewport = findCommandByRole(snapshot.commands, "embedded-surface-viewport");
    if (viewport.type !== "surface") {
      throw new Error("Expected the hosted app viewport to render as a surface command.");
    }

    expect(runtime.getBounds("shared-button")).toBeUndefined();
    expect(runtime.getBounds("space.test.child:child-1:child-window:surface")).toBeDefined();
    expect(viewport.sourceId).toBe("space.test.child:child-1:child-window:surface-source");
    expect(viewport.handle).toMatchObject({
      kind: "touch-os-render-snapshot",
      width: 180
    });
    if (
      typeof viewport.handle !== "object" ||
      viewport.handle === null ||
      (viewport.handle as { kind?: unknown }).kind !== "touch-os-render-snapshot"
    ) {
      throw new Error("Expected a drawable touch runtime snapshot handle.");
    }
    const drawOperations: string[] = [];
    (viewport.handle as TouchRuntimeSurfaceHandle).draw(
      createRecordingSurfaceContext(drawOperations),
      viewport.rect
    );
    expect(drawOperations).toContain("roundRect");
    expect(drawOperations).not.toContain("fillRect");
    expect(surfaces.getSource("space.test.child:child-1:child-window:surface-source")).toMatchObject({
      available: true,
      sourceType: "touch-os-runtime"
    });

    pressAt(
      runtime,
      viewport.rect.x + viewport.rect.width / 2,
      viewport.rect.y + viewport.rect.height / 2
    );
    const outputs = runtime.takeOutputs();

    expect(outputs).not.toContainEqual({
      type: "action",
      actionId: "child.run",
      componentId: "space.test.child:child-1:child-window:shared-button"
    });
    expect(handledOutputs).toContainEqual({
      type: "action",
      actionId: "child.run",
      componentId: "shared-button"
    });
    expect(outputs).toContainEqual({
      type: "app-event",
      componentId: "tablet-os",
      appId: "space.test.child",
      instanceId: "child-1",
      windowId: "child-window",
      event: {
        type: "app-action",
        appId: "space.test.child",
        instanceId: "child-1",
        windowId: "child-window",
        name: "shared-button"
      }
    });

    const minimizeControl = findCommandByRole<DrawCommand>(
      runtime.render().commands,
      "window-control-minimize"
    );
    if (minimizeControl.type !== "rect") {
      throw new Error("Expected a minimize control rect.");
    }
    pressAt(
      runtime,
      minimizeControl.rect.x + minimizeControl.rect.width / 2,
      minimizeControl.rect.y + minimizeControl.rect.height / 2,
      10
    );
    runtime.takeOutputs();
    runtime.render();
    expect(surfaces.getSource("space.test.child:child-1:child-window:surface-source")).toBeUndefined();

    const restoreControl = findCommandByRole<DrawCommand>(
      runtime.render().commands,
      "window-control-minimize"
    );
    if (restoreControl.type !== "rect") {
      throw new Error("Expected a restore control rect.");
    }
    pressAt(
      runtime,
      restoreControl.rect.x + restoreControl.rect.width / 2,
      restoreControl.rect.y + restoreControl.rect.height / 2,
      12
    );
    runtime.takeOutputs();
    runtime.render();
    expect(surfaces.getSource("space.test.child:child-1:child-window:surface-source")).toMatchObject({
      available: true,
      sourceType: "touch-os-runtime"
    });

    const closeControl = findCommandByRole<DrawCommand>(
      runtime.render().commands,
      "window-control-close"
    );
    if (closeControl.type !== "rect") {
      throw new Error("Expected a close control rect.");
    }
    pressAt(
      runtime,
      closeControl.rect.x + closeControl.rect.width / 2,
      closeControl.rect.y + closeControl.rect.height / 2,
      14
    );
    runtime.takeOutputs();
    runtime.render();
    expect(runtime.getBounds("space.test.child:child-1:child-window:surface")).toBeUndefined();
    expect(surfaces.getSource("space.test.child:child-1:child-window:surface-source")).toBeUndefined();
  });

  it("can opt child-runtime windows into raw scoped app output forwarding", () => {
    const surfaces = createEmbeddedSurfaceService();
    const registry = createTouchAppRegistry([
      defineTouchApp({
        manifest: {
          id: "space.test.forward",
          name: "Forward",
          version: "1.0.0"
        },
        createApp() {
          return {
            render() {
              return createButton("shared-button", {
                label: "Run",
                actionId: "forward.run"
              });
            }
          };
        }
      })
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        appHostMode: "child-runtime",
        forwardAppOutputs: true,
        initialWindows: [createManagedWindow("forward-window", "space.test.forward", "forward-1", 1)]
      }),
      surface: { width: 420, height: 280 },
      services: { surfaces }
    });

    const snapshot = runtime.render();
    const viewport = findCommandByRole(snapshot.commands, "embedded-surface-viewport");
    if (viewport.type !== "surface") {
      throw new Error("Expected the hosted app viewport to render as a surface command.");
    }

    pressAt(
      runtime,
      viewport.rect.x + viewport.rect.width / 2,
      viewport.rect.y + viewport.rect.height / 2
    );
    const outputs = runtime.takeOutputs();

    expect(outputs).toContainEqual({
      type: "action",
      actionId: "forward.run",
      componentId: "space.test.forward:forward-1:forward-window:shared-button"
    });
  });

  it("clears child-runtime hover when the pointer leaves an embedded app surface", () => {
    const surfaces = createEmbeddedSurfaceService();
    const sourceId = "space.test.leave:leave-1:leave-window:surface-source";
    const registry = createTouchAppRegistry([
      defineTouchApp({
        manifest: {
          id: "space.test.leave",
          name: "Leave",
          version: "1.0.0"
        },
        createApp() {
          return {
            render() {
              return createButton("leave-button", {
                label: "Hover",
                actionId: "leave.run"
              });
            }
          };
        }
      })
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        appHostMode: "child-runtime",
        initialWindows: [createManagedWindow("leave-window", "space.test.leave", "leave-1", 1)]
      }),
      surface: { width: 420, height: 280 },
      services: { surfaces }
    });

    const snapshot = runtime.render();
    const viewport = findCommandByRole(snapshot.commands, "embedded-surface-viewport");
    if (viewport.type !== "surface") {
      throw new Error("Expected the hosted app viewport to render as a surface command.");
    }

    const normalFill = getHostedButtonFill(surfaces, sourceId);
    runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: viewport.rect.x + viewport.rect.width / 2,
      surfaceY: viewport.rect.y + viewport.rect.height / 2,
      timestamp: 1
    });
    const hoverFill = getHostedButtonFill(surfaces, sourceId);
    expect(hoverFill).not.toBe(normalFill);

    runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: viewport.rect.x + viewport.rect.width + 12,
      surfaceY: viewport.rect.y + viewport.rect.height / 2,
      timestamp: 2
    });

    expect(getHostedButtonFill(surfaces, sourceId)).toBe(normalFill);
  });

  it("opens registered apps from the launcher with generated ids and preferred placement", () => {
    const registry = createTouchAppRegistry([
      defineTouchApp({
        manifest: {
          id: "space.test.launch",
          name: "Launch Me",
          version: "1.0.0",
          preferredWindow: {
            width: 360,
            height: 260,
            minWidth: 240,
            minHeight: 160,
            resizable: true
          }
        },
        createApp() {
          return {
            render() {
              return createTextLabel("launch-root", {
                text: "Launched"
              });
            }
          };
        }
      })
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        launcher: true,
        constraintPadding: 8
      }),
      surface: { width: 420, height: 300 }
    });

    runtime.render();
    clickComponentCenter(runtime, "tablet-os:launcher:open:space-test-launch");
    const outputs = runtime.takeOutputs();
    runtime.render();

    expect(outputs).toContainEqual({
      type: "window-manager-change",
      componentId: "tablet-os",
      change: "open-app",
      windowId: "space-test-launch-1-window",
      appId: "space.test.launch",
      instanceId: "space-test-launch-1",
      rect: { x: 8, y: 8, width: 360, height: 260 },
      zIndex: 0,
      focused: true,
      mode: "normal",
      targetAppId: "space.test.launch",
      options: {
        appId: "space.test.launch"
      }
    });
    expect(runtime.getBounds("space-test-launch-1-window")).toEqual({
      x: 8,
      y: 8,
      width: 360,
      height: 260
    });
  });

  it("resolves launcher-created app state by app id", () => {
    const registry = createTouchAppRegistry([
      defineTouchApp<{ title: string }>({
        manifest: {
          id: "space.test.state",
          name: "State",
          version: "1.0.0"
        },
        createApp() {
          return {
            render(state) {
              return createTextLabel("state-root", {
                text: state.title
              });
            }
          };
        }
      })
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        launcher: true,
        appStates: {
          "space.test.state": { title: "Shared app state" }
        }
      }),
      surface: { width: 420, height: 300 }
    });

    runtime.render();
    clickComponentCenter(runtime, "tablet-os:launcher:open:space-test-state");
    runtime.takeOutputs();
    const snapshot = runtime.render();

    expect(
      snapshot.commands.some(
        (command) =>
          command.type === "text" &&
          command.componentId === "space.test.state:space-test-state-1:space-test-state-1-window:state-root" &&
          command.text === "Shared app state"
      )
    ).toBe(true);
  });

  it("renders launcher and task switcher above app windows by default", () => {
    const registry = createTouchAppRegistry([
      createButtonApp("space.test.utility", "Utility")
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        launcher: true,
        taskSwitcher: true,
        initialWindows: [
          createManagedWindow("utility-window", "space.test.utility", "utility-1", 10)
        ]
      }),
      surface: { width: 560, height: 320 }
    });

    const frames = runtime.render().commands
      .filter((command) => command.type === "rect" && command.role === "window-frame")
      .map((command) => command.componentId);

    expect(frames).toEqual([
      "utility-window",
      "tablet-os:launcher-window",
      "tablet-os:task-switcher-window"
    ]);
  });

  it("restores and focuses minimized windows from the task switcher", () => {
    const lifecycle: string[] = [];
    const registry = createTouchAppRegistry([
      createLifecycleApp("space.test.tasks", lifecycle)
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        taskSwitcher: true,
        initialWindows: [
          {
            ...createManagedWindow("task-window", "space.test.tasks", "task-1", 1),
            mode: "minimized"
          }
        ]
      }),
      surface: { width: 520, height: 300 }
    });

    runtime.render();
    expect(lifecycle).toEqual(["launch", "suspend"]);

    clickComponentCenter(runtime, "tablet-os:tasks:focus:task-window");
    const outputs = runtime.takeOutputs();
    runtime.render();

    expect(lifecycle).toEqual(["launch", "suspend", "resume", "activate"]);
    expect(runtime.getBounds("task-window")).toEqual({
      x: 40,
      y: 30,
      width: 180,
      height: 130
    });
    expect(outputs).toContainEqual({
      type: "window-manager-change",
      componentId: "tablet-os",
      change: "window-state",
      windowId: "task-window",
      appId: "space.test.tasks",
      instanceId: "task-1",
      rect: { x: 40, y: 30, width: 180, height: 130 },
      zIndex: 1,
      focused: true,
      mode: "normal"
    });
  });

  it("honors resize constraints, app requestResize, and fullscreen window state", () => {
    const registry = createTouchAppRegistry([
      defineTouchApp({
        manifest: {
          id: "space.test.resize",
          name: "Resize",
          version: "1.0.0"
        },
        createApp(ctx) {
          return {
            render() {
              return createButton("resize-button", {
                label: "Resize",
                actionId: "resize.request"
              });
            },
            handleOutput(output) {
              if (output.type === "action") {
                ctx.windows.requestResize({ width: 500, height: 500 });
              }
            }
          };
        }
      })
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        windowControls: ["fullscreen"],
        initialWindows: [
          {
            ...createManagedWindow("resize-window", "space.test.resize", "resize-1", 1),
            minSize: { width: 160, height: 110 },
            maxSize: { width: 260, height: 180 }
          }
        ]
      }),
      surface: { width: 420, height: 300 },
      dragThreshold: 1
    });

    runtime.render();
    clickComponentCenter(runtime, "space.test.resize:resize-1:resize-window:resize-button");
    let outputs = runtime.takeOutputs();
    runtime.render();

    expect(outputs).toContainEqual({
      type: "window-manager-change",
      componentId: "tablet-os",
      change: "request-resize",
      windowId: "resize-window",
      appId: "space.test.resize",
      instanceId: "resize-1",
      rect: { x: 40, y: 30, width: 260, height: 180 },
      size: { width: 260, height: 180 },
      zIndex: 1,
      focused: true,
      mode: "normal"
    });
    expect(runtime.getBounds("resize-window")).toEqual({
      x: 40,
      y: 30,
      width: 260,
      height: 180
    });

    const resizeHandle = findCommandByRole<DrawCommand>(
      runtime.render().commands,
      "window-resize-handle"
    );
    if (resizeHandle.type !== "rect") {
      throw new Error("Expected a resize handle rect.");
    }
    runtime.dispatchInput({
      type: "pointer-down",
      pointerId: "mouse",
      surfaceX: resizeHandle.rect.x + resizeHandle.rect.width / 2,
      surfaceY: resizeHandle.rect.y + resizeHandle.rect.height / 2,
      timestamp: 3
    });
    runtime.dispatchInput({
      type: "pointer-move",
      pointerId: "mouse",
      surfaceX: 0,
      surfaceY: 0,
      timestamp: 4
    });
    runtime.dispatchInput({
      type: "pointer-up",
      pointerId: "mouse",
      surfaceX: 0,
      surfaceY: 0,
      timestamp: 5
    });
    outputs = runtime.takeOutputs();
    runtime.render();
    expect(outputs.some((output) =>
      output.type === "window-manager-change" &&
      output.change === "window-state" &&
      output.windowId === "resize-window" &&
      output.rect?.width === 160 &&
      output.rect.height === 110
    )).toBe(true);

    const fullscreenControl = findCommandByRole<DrawCommand>(
      runtime.render().commands,
      "window-control-fullscreen"
    );
    if (fullscreenControl.type !== "rect") {
      throw new Error("Expected a fullscreen control rect.");
    }
    pressAt(
      runtime,
      fullscreenControl.rect.x + fullscreenControl.rect.width / 2,
      fullscreenControl.rect.y + fullscreenControl.rect.height / 2,
      6
    );
    outputs = runtime.takeOutputs();
    runtime.render();
    expect(outputs).toContainEqual({
      type: "window-manager-change",
      componentId: "tablet-os",
      change: "window-state",
      windowId: "resize-window",
      appId: "space.test.resize",
      instanceId: "resize-1",
      rect: { x: 0, y: 0, width: 420, height: 300 },
      zIndex: 1,
      focused: true,
      mode: "fullscreen"
    });
  });

  it("keeps same-runtime app payload ids unscoped", () => {
    const handledOutputs: RuntimeOutput[] = [];
    const registry = createTouchAppRegistry([
      defineTouchApp({
        manifest: {
          id: "space.test.payload",
          name: "Payload",
          version: "1.0.0"
        },
        createApp() {
          return {
            render() {
              return createRepeatButton("payload-button", {
                label: "Payload",
                actionId: "payload.emit",
                payload: {
                  componentId: "raw-component",
                  targetId: "raw-target",
                  windowId: "raw-window",
                  pageId: "raw-page"
                }
              });
            },
            handleOutput(output) {
              handledOutputs.push(output);
            }
          };
        }
      })
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        initialWindows: [
          createManagedWindow("payload-window", "space.test.payload", "payload-1", 1)
        ]
      }),
      surface: { width: 420, height: 280 }
    });

    runtime.render();
    clickComponentCenter(runtime, "space.test.payload:payload-1:payload-window:payload-button");
    const outputs = runtime.takeOutputs();

    expect(outputs).toContainEqual({
      type: "action",
      actionId: "payload.emit",
      componentId: "space.test.payload:payload-1:payload-window:payload-button",
      payload: {
        componentId: "raw-component",
        targetId: "raw-target",
        windowId: "raw-window",
        pageId: "raw-page"
      }
    });
    expect(handledOutputs).toContainEqual({
      type: "action",
      actionId: "payload.emit",
      componentId: "payload-button",
      payload: {
        componentId: "raw-component",
        targetId: "raw-target",
        windowId: "raw-window",
        pageId: "raw-page"
      }
    });
  });
});

function createButtonApp(appId: string, label: string) {
  return defineTouchApp({
    manifest: {
      id: appId,
      name: label,
      version: "1.0.0"
    },
    createApp() {
      return {
        render() {
          return createButton("shared-button", {
            label,
            actionId: `${appId}.run`
          });
        }
      };
    }
  });
}

function createLifecycleApp(appId: string, lifecycle: string[]) {
  return defineTouchApp({
    manifest: {
      id: appId,
      name: appId,
      version: "1.0.0"
    },
    createApp() {
      return {
        render() {
          return createTextLabel("content", {
            text: appId
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
        onResume() {
          lifecycle.push("resume");
        },
        onClose() {
          lifecycle.push("close");
        }
      };
    }
  });
}

function createManagedWindow(
  id: string,
  appId: string,
  instanceId: string,
  zIndex: number
): TouchWindowState {
  return {
    id,
    appId,
    instanceId,
    title: id,
    rect: { x: 20 + zIndex * 20, y: 20 + zIndex * 10, width: 180, height: 130 },
    zIndex,
    mode: "normal",
    focused: false,
    movable: true,
    resizable: true
  };
}

function getHostedButtonFill(
  surfaces: ReturnType<typeof createEmbeddedSurfaceService>,
  sourceId: string
): string | undefined {
  const handle = surfaces.getSource(sourceId)?.handle as TouchRuntimeSurfaceHandle | undefined;
  if (handle?.kind !== "touch-os-render-snapshot") {
    throw new Error(`Expected source "${sourceId}" to expose a touch runtime snapshot.`);
  }

  const buttonFace = findCommandByRole<DrawCommand>(handle.snapshot.commands, "button-face");
  if (buttonFace.type !== "rect") {
    throw new Error("Expected hosted button face to render as a rect.");
  }
  return buttonFace.fill;
}

function createRecordingSurfaceContext(operations: string[]) {
  return {
    save() {
      operations.push("save");
    },
    restore() {
      operations.push("restore");
    },
    translate() {
      operations.push("translate");
    },
    scale() {
      operations.push("scale");
    },
    beginPath() {
      operations.push("beginPath");
    },
    roundRect() {
      operations.push("roundRect");
    },
    fillRect() {
      operations.push("fillRect");
    },
    strokeRect() {
      operations.push("strokeRect");
    },
    fill() {
      operations.push("fill");
    },
    stroke() {
      operations.push("stroke");
    },
    fillText() {
      operations.push("fillText");
    },
    set fillStyle(_value: unknown) {},
    set strokeStyle(_value: unknown) {},
    set lineWidth(_value: number) {},
    set font(_value: string) {},
    set textAlign(_value: string) {},
    set textBaseline(_value: string) {}
  };
}
