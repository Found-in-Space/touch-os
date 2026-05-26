import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import type { DrawCommand, SurfaceDrawCommand, TextDrawCommand } from "../src/core/draw.js";
import {
  createXrHudRoot,
  createWallPictureRoot,
  createRoomPanelRoot,
  getXrHudSurface,
  getXrHudTheme,
  getWallPictureSurface,
  getWallPictureTheme,
  getRoomPanelSurface,
  getRoomPanelTheme
} from "../examples/three-living-room/src/panel-ui.js";
import { createRoomDemoStore } from "../examples/three-living-room/src/store.js";
import { pressAt } from "./helpers/runtime-helpers.js";

describe("living room panel ui", () => {
  it("renders TV from shared XR state while XR HUD uses a separate root", () => {
    const state = createRoomDemoStore({
      xrActive: true
    }).getState();

    const tvRuntime = createRuntime({
      root: createRoomPanelRoot("tv", state),
      surface: getRoomPanelSurface("tv"),
      theme: getRoomPanelTheme("tv")
    });
    const xrHudRuntime = createRuntime({
      root: createXrHudRoot(),
      surface: getXrHudSurface(),
      theme: getXrHudTheme()
    });

    const tvTexts = collectTexts(tvRuntime.render().commands);
    const xrHudTexts = collectTexts(xrHudRuntime.render().commands);

    expect(tvTexts).toContain("XR");
    expect(xrHudTexts).toContain("Mirror offline");
    expect(xrHudTexts).not.toContain("Touch OS Living Room");
    expect(xrHudTexts).not.toContain("Desktop");
  });

  it("keeps the desktop HUD layout intact even when shared XR state changes", () => {
    const runtime = createRuntime({
      root: createRoomPanelRoot(
        "hud",
        createRoomDemoStore({
          xrActive: false
        }).getState()
      ),
      surface: getRoomPanelSurface("hud"),
      theme: getRoomPanelTheme("hud")
    });

    const desktopTexts = collectTexts(runtime.render().commands);
    expect(desktopTexts).toContain("Touch OS Living Room");
    expect(desktopTexts).toContain("Desktop");

    runtime.setRoot(
      createRoomPanelRoot(
        "hud",
        createRoomDemoStore({
          xrActive: true
        }).getState()
      )
    );

    const sharedStateTexts = collectTexts(runtime.render().commands);
    expect(sharedStateTexts).toContain("Touch OS Living Room");
    expect(sharedStateTexts).toContain("Move");
    expect(sharedStateTexts).toContain("XR");
    expect(sharedStateTexts).toContain("Rear View");
  });

  it("renders a separate wall-picture placeholder for the composite path", () => {
    const runtime = createRuntime({
      root: createWallPictureRoot(),
      surface: getWallPictureSurface(),
      theme: getWallPictureTheme()
    });

    const snapshot = runtime.render();
    const texts = collectTexts(snapshot.commands);
    expect(texts).toContain("Picture offline");
    expect(texts).not.toContain("Mirror offline");
  });

  it("hosts the wrist panel as a compact window-managed app surface", () => {
    const surface = getRoomPanelSurface("arm");
    const runtime = createRuntime({
      root: createRoomPanelRoot("arm", createRoomDemoStore().getState()),
      surface,
      theme: getRoomPanelTheme("arm")
    });

    const snapshot = runtime.render();
    const texts = collectTexts(snapshot.commands);
    expect(texts).toContain("Settings");
    expect(texts).toContain("Rear View");
    expect(texts).toContain("Diagnostics");
    expect(texts).not.toContain("Movement");

    const layerBounds = runtime.getBounds("arm-os:windows");
    expect(layerBounds).toEqual({
      x: 0,
      y: 0,
      width: surface.width,
      height: surface.height
    });

    const settingsWindowBounds = runtime.getBounds("arm-settings-window");
    expect(settingsWindowBounds).toBeDefined();
    expect((settingsWindowBounds?.x ?? 0) + (settingsWindowBounds?.width ?? 0)).toBeLessThanOrEqual(surface.width ?? 0);
    expect((settingsWindowBounds?.y ?? 0) + (settingsWindowBounds?.height ?? 0)).toBeLessThanOrEqual(surface.height ?? 0);

    const settingsSurface = findSurfaceCommand(
      snapshot.commands,
      "space.found.living-room.settings:settings:arm-settings-window:surface"
    );
    expect(settingsSurface).toBeDefined();
    const settingsHandle = settingsSurface ? getHostedSnapshotHandle(settingsSurface) : undefined;
    const lightToggle = settingsHandle?.snapshot.commands.find(
      (command): command is Extract<DrawCommand, { type: "rect" }> =>
        command.type === "rect" &&
        command.componentId === "settings-light-toggle" &&
        command.role === "toggle-switch"
    );
    expect(lightToggle).toBeDefined();
    expect(
      findSurfaceCommand(
        snapshot.commands,
        "space.found.living-room.rear-view:rear-view:arm-rear-view-window:surface"
      )
    ).toBeDefined();

    if (!settingsSurface || !settingsHandle || !lightToggle) {
      throw new Error("Expected the arm settings app to be hosted as an embedded child runtime.");
    }

    const lightToggleCenterX = lightToggle.rect.x + lightToggle.rect.width / 2;
    const lightToggleCenterY = lightToggle.rect.y + lightToggle.rect.height / 2;
    pressAt(
      runtime,
      settingsSurface.rect.x + (lightToggleCenterX / settingsHandle.width) * settingsSurface.rect.width,
      settingsSurface.rect.y + (lightToggleCenterY / settingsHandle.height) * settingsSurface.rect.height
    );

    expect(runtime.takeOutputs()).toContainEqual({
      type: "app-event",
      componentId: "arm-os",
      appId: "space.found.living-room.settings",
      instanceId: "settings",
      windowId: "arm-settings-window",
      event: {
        type: "app-action",
        appId: "space.found.living-room.settings",
        instanceId: "settings",
        windowId: "arm-settings-window",
        name: "light.set",
        payload: {
          value: false
        }
      }
    });
  });
});

function findSurfaceCommand(
  commands: readonly DrawCommand[],
  componentId: string
): SurfaceDrawCommand | undefined {
  return commands.find(
    (command): command is SurfaceDrawCommand =>
      command.type === "surface" &&
      command.role === "embedded-surface-viewport" &&
      command.componentId === componentId
  );
}

function getHostedSnapshotHandle(command: SurfaceDrawCommand): {
  width: number;
  height: number;
  snapshot: { commands: readonly DrawCommand[] };
} | undefined {
  if (
    typeof command.handle === "object" &&
    command.handle !== null &&
    (command.handle as { kind?: unknown }).kind === "touch-os-render-snapshot"
  ) {
    return command.handle as {
      width: number;
      height: number;
      snapshot: { commands: readonly DrawCommand[] };
    };
  }
  return undefined;
}

function collectTexts(commands: readonly { type: string }[]): string[] {
  return commands
    .filter((command): command is TextDrawCommand => command.type === "text")
    .map((command) => command.text);
}
