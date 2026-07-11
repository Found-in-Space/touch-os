import { describe, expect, it } from "vitest";
import {
  createAppShell,
  createRuntime,
  createTabletHomePresentation,
  createTouchAppRegistry,
  createTouchAppRuntime,
  createWindowManager,
  defineControlsApp,
  type DrawCommand,
  type TouchAppEvent
} from "../src/index.js";
import { clickComponentCenter } from "./helpers/runtime-helpers.js";

interface RoomState {
  lightOn: boolean;
  xrActive: boolean;
  moveSpeed: number;
}

describe("simple controls apps", () => {
  it("supports explicit metadata, control options, callbacks, sections, and status tones", () => {
    const callbackEvents: TouchAppEvent[] = [];
    const app = defineControlsApp<RoomState>({
      id: "space.found.explicit-controls",
      name: "Explicit Controls",
      version: "2.0.0",
      icon: { kind: "emoji", value: "🎛️", label: "Controls" },
      preferredSurface: {
        width: 500,
        height: 300,
        minWidth: 300,
        minHeight: 200,
        resizable: false
      },
      controls: ({ toggle, status, slider, button, section }) => [
        toggle("Lamp", "lightOn", { id: "explicit-toggle", disabled: false }),
        status("Muted", () => "Muted", { id: "muted", tone: "muted" }),
        status("Accent", () => "Accent", { id: "accent", tone: "accent" }),
        status("Warning", () => "Warning", { id: "warning", tone: "warning" }),
        status("Danger", () => "Danger", { id: "danger", tone: "danger" }),
        slider("Speed", "moveSpeed", {
          id: "explicit-slider",
          min: 0,
          max: 4,
          valueText: (state) => `${state.moveSpeed}x`,
          disabled: false
        }),
        button("Reset", "explicit.reset", {
          id: "explicit-button",
          payload: { source: "test" },
          disabled: false
        }),
        section("Details", [status("Normal", () => "Normal")], { id: "details" })
      ],
      onChange(event) {
        callbackEvents.push(event);
      },
      onAction(event) {
        callbackEvents.push(event);
      }
    });
    const runtime = createTouchAppRuntime({
      app,
      state: { lightOn: false, xrActive: false, moveSpeed: 2 },
      surface: { width: 500, height: 600 }
    });

    const texts = runtime.render().commands
      .filter((command): command is Extract<DrawCommand, { type: "text" }> => command.type === "text")
      .map((command) => command.text);
    expect(texts).toEqual(expect.arrayContaining(["Muted", "Accent", "Warning", "Danger", "2x"]));
    clickComponentCenter(runtime, "explicit-toggle");
    clickComponentCenter(runtime, "explicit-button", 10);
    expect(callbackEvents.map((event) => event.type)).toEqual(["app-change", "app-action"]);
  });

  it("defines a toggle/status/slider app without manual layout", () => {
    const app = createRoomControlsApp();
    const runtime = createTouchAppRuntime({
      app,
      state: {
        lightOn: true,
        xrActive: false,
        moveSpeed: 1.4
      },
      surface: { width: 320, height: 180 }
    });

    const snapshot = runtime.render();
    expect(hasRole(snapshot.commands, "toggle-switch")).toBe(true);
    expect(hasRole(snapshot.commands, "controls-status-value")).toBe(true);
    expect(hasRole(snapshot.commands, "slider-track")).toBe(true);
  });

  it("uses a two-column control layout on wide unsectioned surfaces", () => {
    const runtime = createTouchAppRuntime({
      app: createRoomControlsApp(),
      state: {
        lightOn: true,
        xrActive: false,
        moveSpeed: 1.4
      },
      surface: { width: 760, height: 260 }
    });

    runtime.render();
    const toggleBounds = runtime.getBounds("lightOn-toggle");
    const statusBounds = runtime.getBounds("Mode-status");

    expect(toggleBounds).toBeDefined();
    expect(statusBounds).toBeDefined();
    expect(statusBounds?.y).toBe(toggleBounds?.y);
    expect(statusBounds?.x).toBeGreaterThan(toggleBounds?.x ?? 0);
  });

  it("updates single-app runtime output when app state changes", () => {
    const runtime = createTouchAppRuntime({
      app: createRoomControlsApp(),
      state: {
        lightOn: false,
        xrActive: false,
        moveSpeed: 1
      },
      surface: { width: 360, height: 240 }
    });

    expect(hasText(runtime.render().commands, "Desktop")).toBe(true);

    runtime.setAppState({
      lightOn: true,
      xrActive: true,
      moveSpeed: 2
    });

    expect(runtime.getAppState().xrActive).toBe(true);
    expect(hasText(runtime.render().commands, "XR")).toBe(true);
  });

  it("emits app-change for field controls and app-action for buttons", () => {
    const events: TouchAppEvent[] = [];
    const app = createRoomControlsApp();
    const runtime = createTouchAppRuntime({
      app,
      state: {
        lightOn: false,
        xrActive: true,
        moveSpeed: 1
      },
      surface: { width: 360, height: 240 },
      onAppEvent(event) {
        events.push(event);
      }
    });

    runtime.render();
    clickComponentCenter(runtime, "lightOn-toggle");
    clickComponentCenter(runtime, "room-reset-button", 10);
    const outputs = runtime.takeOutputs();

    expect(outputs.some((output) => output.type === "change-request" || output.type === "action")).toBe(false);
    expect(events).toContainEqual({
      type: "app-change",
      appId: "space.found.room.controls",
      instanceId: "space-found-room-controls-1",
      windowId: "space-found-room-controls-surface",
      name: "lightOn.change",
      payload: {
        field: "lightOn",
        value: true
      },
      state: {
        lightOn: false,
        xrActive: true,
        moveSpeed: 1
      }
    });
    expect(outputs).toContainEqual({
      type: "app-event",
      componentId: "space-found-room-controls-surface",
      appId: "space.found.room.controls",
      instanceId: "space-found-room-controls-1",
      windowId: "space-found-room-controls-surface",
      event: {
        type: "app-change",
        appId: "space.found.room.controls",
        instanceId: "space-found-room-controls-1",
        windowId: "space-found-room-controls-surface",
        name: "lightOn.change",
        payload: {
          field: "lightOn",
          value: true
        },
        state: {
          lightOn: false,
          xrActive: true,
          moveSpeed: 1
        }
      }
    });
    expect(events).toContainEqual({
      type: "app-action",
      appId: "space.found.room.controls",
      instanceId: "space-found-room-controls-1",
      windowId: "space-found-room-controls-surface",
      name: "room.reset",
      state: {
        lightOn: false,
        xrActive: true,
        moveSpeed: 1
      }
    });
  });

  it("returns routed app events from dispatch without leaking default raw outputs", () => {
    const runtime = createTouchAppRuntime({
      app: createRoomControlsApp(),
      state: {
        lightOn: false,
        xrActive: true,
        moveSpeed: 1
      },
      surface: { width: 360, height: 240 }
    });

    runtime.render();
    const bounds = runtime.getBounds("lightOn-toggle");
    if (!bounds) {
      throw new Error("Expected the generated toggle to have bounds.");
    }
    const surfaceX = bounds.x + bounds.width / 2;
    const surfaceY = bounds.y + bounds.height / 2;
    runtime.dispatchInput({ type: "pointer-down", surfaceX, surfaceY, timestamp: 1 });
    const result = runtime.dispatchInput({
      type: "pointer-up",
      surfaceX,
      surfaceY,
      timestamp: 2
    });

    expect(result.outputs.map((output) => output.type)).toEqual(["app-event"]);
    expect(runtime.takeOutputs().map((output) => output.type)).toEqual(["app-event"]);
  });

  it("can opt the single-app runtime into raw runtime output forwarding", () => {
    const runtime = createTouchAppRuntime({
      app: createRoomControlsApp(),
      state: {
        lightOn: false,
        xrActive: true,
        moveSpeed: 1
      },
      surface: { width: 360, height: 240 },
      forwardRuntimeOutputs: true
    });

    runtime.render();
    clickComponentCenter(runtime, "lightOn-toggle");
    const outputs = runtime.takeOutputs();

    expect(outputs).toContainEqual({
      type: "change-request",
      componentId: "lightOn-toggle",
      field: "lightOn",
      value: true
    });
    expect(outputs).toContainEqual({
      type: "app-event",
      componentId: "space-found-room-controls-surface",
      appId: "space.found.room.controls",
      instanceId: "space-found-room-controls-1",
      windowId: "space-found-room-controls-surface",
      event: expect.objectContaining({
        type: "app-change",
        name: "lightOn.change"
      })
    });
  });

  it("runs the same generated app in desktop and tablet shells", () => {
    const app = createRoomControlsApp();
    const registry = createTouchAppRegistry([app]);
    const state: RoomState = {
      lightOn: true,
      xrActive: false,
      moveSpeed: 2
    };

    const desktopRuntime = createRuntime({
      root: createWindowManager("desktop-os", {
        registry,
        appStates: {
          [app.manifest.id]: state
        },
        initialWindows: [
          {
            id: "room-window",
            appId: app.manifest.id,
            instanceId: "room-1",
            title: "Room",
            rect: { x: 20, y: 20, width: 320, height: 220 },
            zIndex: 1,
            mode: "normal",
            focused: true,
            movable: true,
            resizable: true
          }
        ]
      }),
      surface: { width: 500, height: 360 }
    });
    expect(hasRole(desktopRuntime.render().commands, "toggle-switch")).toBe(true);

    const tabletRuntime = createRuntime({
      root: createAppShell("tablet-os", {
        registry,
        presentation: createTabletHomePresentation(),
        appStates: {
          [app.manifest.id]: state
        }
      }),
      surface: { width: 500, height: 360 }
    });
    tabletRuntime.render();
    clickComponentCenter(tabletRuntime, "tablet-os:home:open:space-found-room-controls");
    tabletRuntime.takeOutputs();
    expect(hasRole(tabletRuntime.render().commands, "toggle-switch")).toBe(true);
  });
});

function createRoomControlsApp() {
  return defineControlsApp<RoomState>({
    id: "space.found.room.controls",
    name: "Room",
    controls: ({ toggle, status, slider, button }) => [
      toggle("Lamp", "lightOn"),
      status("Mode", (state) => state.xrActive ? "XR" : "Desktop"),
      slider("Speed", "moveSpeed", { min: 0.2, max: 4, step: 0.2 }),
      button("Reset", "room.reset")
    ]
  });
}

function hasRole(commands: readonly DrawCommand[], role: string): boolean {
  return commands.some((command) => command.role === role);
}

function hasText(commands: readonly DrawCommand[], text: string): boolean {
  return commands.some((command) => command.type === "text" && command.text === text);
}
