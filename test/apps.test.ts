import { describe, expect, it } from "vitest";
import {
  createTextLabel,
  createThemeService,
  createTouchAppInstance,
  createTouchAppRegistry,
  defineTouchApp,
  type RuntimeOutput,
  type TouchAppEvent,
  type TouchAppStorage
} from "../src/index.js";

describe("touch apps", () => {
  it("defines apps, registers them, and rejects duplicate app ids", () => {
    const app = createSettingsApp();
    const registry = createTouchAppRegistry([app]);

    expect(registry.get("space.found.settings")).toBe(app);
    expect(registry.list()).toEqual([app.manifest]);
    expect(() => registry.register(app)).toThrow(/already registered/);
  });

  it("validates required manifest fields and preferred window sizes", () => {
    expect(() =>
      defineTouchApp({
        manifest: {
          id: "",
          name: "Broken",
          version: "1.0.0"
        },
        createApp() {
          return {
            render() {
              return createTextLabel("broken", { text: "Broken" });
            }
          };
        }
      })
    ).toThrow(/manifest id/);

    expect(() =>
      defineTouchApp({
        manifest: {
          id: "space.found.broken",
          name: "Broken",
          version: "1.0.0",
          preferredWindow: {
            width: 0,
            height: 200
          }
        },
        createApp() {
          return {
            render() {
              return createTextLabel("broken", { text: "Broken" });
            }
          };
        }
      })
    ).toThrow(/preferred window width/);
  });

  it("creates app instances with a narrow context and lifecycle wrapper", () => {
    const lifecycle: string[] = [];
    const emitted: TouchAppEvent[] = [];
    const windowCalls: string[] = [];
    const storage = createMemoryStorage();
    const sourceUpdates: string[] = [];
    const surface = {
      width: 320,
      height: 240,
      pixelDensity: 2,
      safeArea: { top: 1, right: 2, bottom: 3, left: 4 }
    };
    const app = createSettingsApp(lifecycle);

    const runtimeApp = createTouchAppInstance(app, {
      instanceId: "settings-1",
      windowId: "settings-window",
      surface,
      theme: createThemeService(),
      actions: {
        emit(event) {
          emitted.push(event);
        }
      },
      windows: {
        setTitle(title) {
          windowCalls.push(`title:${title}`);
        },
        requestClose() {
          windowCalls.push("close");
        },
        requestResize(size) {
          windowCalls.push(`resize:${size.width}x${size.height}`);
        },
        openApp(appId) {
          windowCalls.push(`open:${appId}`);
        }
      },
      storage,
      surfaces: {
        publish(sourceId) {
          sourceUpdates.push(`publish:${sourceId}`);
        },
        unpublish(sourceId) {
          sourceUpdates.push(`unpublish:${sourceId}`);
        }
      }
    });

    surface.safeArea.top = 99;
    expect(runtimeApp.context).toMatchObject({
      appId: "space.found.settings",
      instanceId: "settings-1",
      windowId: "settings-window",
      surface: {
        width: 320,
        height: 240,
        pixelDensity: 2,
        safeArea: { top: 1, right: 2, bottom: 3, left: 4 }
      }
    });

    expect(lifecycle).toEqual(["launch"]);
    expect(runtimeApp.render({ title: "Settings" })).toMatchObject({
      id: "settings-title"
    });

    runtimeApp.activate();
    runtimeApp.handleOutput({
      type: "action",
      actionId: "settings.sync",
      componentId: "sync"
    });
    runtimeApp.deactivate();
    runtimeApp.suspend();
    runtimeApp.resume();
    runtimeApp.close();

    expect(lifecycle).toEqual([
      "launch",
      "activate",
      "output:settings.sync",
      "deactivate",
      "suspend",
      "resume",
      "close"
    ]);
    expect(emitted).toEqual([
      {
        type: "app-action",
        appId: "space.found.settings",
        instanceId: "settings-1",
        windowId: "settings-window",
        name: "sync"
      }
    ]);
    expect(windowCalls).toEqual([
      "title:Settings",
      "resize:360x260",
      "open:space.found.diagnostics",
      "close"
    ]);
    expect(storage.get("lastAction")).toBe("settings.sync");
    expect(sourceUpdates).toEqual(["publish:settings.preview", "unpublish:settings.preview"]);
  });
});

function createSettingsApp(lifecycle: string[] = []) {
  return defineTouchApp<{ title: string }>({
    manifest: {
      id: "space.found.settings",
      name: "Settings",
      version: "1.0.0",
      preferredWindow: {
        width: 360,
        height: 260,
        minWidth: 280,
        minHeight: 200,
        resizable: true
      },
      capabilities: ["storage", "surfaces"]
    },
    createApp(ctx) {
      return {
        render(state) {
          return createTextLabel("settings-title", { text: state.title });
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
        },
        handleOutput(output: RuntimeOutput) {
          lifecycle.push(`output:${output.type === "action" ? output.actionId : output.type}`);
          ctx.storage?.set("lastAction", output.type === "action" ? output.actionId : output.type);
          ctx.actions.emit({
            type: "app-action",
            appId: ctx.appId,
            instanceId: ctx.instanceId,
            windowId: ctx.windowId,
            name: "sync"
          });
          ctx.windows.setTitle("Settings");
          ctx.windows.requestResize({ width: 360, height: 260 });
          ctx.windows.openApp("space.found.diagnostics");
          ctx.windows.requestClose();
          ctx.surfaces?.publish("settings.preview", {
            available: true,
            sourceWidth: 100,
            sourceHeight: 100
          });
          ctx.surfaces?.unpublish("settings.preview");
        }
      };
    }
  });
}

function createMemoryStorage(): TouchAppStorage {
  const entries = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      return entries.get(key) as T | undefined;
    },
    set<T>(key: string, value: T) {
      entries.set(key, value);
    },
    delete(key: string) {
      entries.delete(key);
    }
  };
}
