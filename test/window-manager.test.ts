import { describe, expect, it } from "vitest";
import {
  createButton,
  createRuntime,
  createTextLabel,
  createTouchAppRegistry,
  createWindowManager,
  defineTouchApp,
  type RuntimeOutput,
  type TouchAppEvent,
  type TouchWindowState
} from "../src/index.js";
import { clickComponentCenter, pressAt } from "./helpers/runtime-helpers.js";

describe("window manager", () => {
  it("hosts app roots in one runtime with scoped component ids", () => {
    const registry = createTouchAppRegistry([
      createButtonApp("space.test.one", "One"),
      createButtonApp("space.test.two", "Two")
    ]);
    const runtime = createRuntime({
      root: createWindowManager("tablet-os", {
        registry,
        windows: [
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
        windows: [
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
        windows: [
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
      zIndex: 2,
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
        windows: [createManagedWindow("title-window", "space.test.title", "title-1", 1)]
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
