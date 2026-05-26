import { describe, expect, it } from "vitest";
import { createEmbeddedSurfaceService, createRuntime } from "../src/index.js";
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
import { REAR_VIEW_SOURCE_ID } from "../examples/three-living-room/src/mirror.js";
import { WALL_PICTURE_SOURCE_ID } from "../examples/three-living-room/src/shader-picture.js";
import { clickComponentCenter, pressAt } from "./helpers/runtime-helpers.js";

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

  it("hosts the wrist panel as a compact tablet app surface", () => {
    const surface = getRoomPanelSurface("arm");
    const runtime = createRuntime({
      root: createRoomPanelRoot("arm", createRoomDemoStore().getState()),
      surface,
      theme: getRoomPanelTheme("arm")
    });

    const snapshot = runtime.render();
    const texts = collectTexts(snapshot.commands);
    expect(texts).toContain("Apps");
    expect(texts).toContain("Settings");
    expect(texts).toContain("Rear View");
    expect(texts).toContain("Fractal Art");
    expect(texts).toContain("Diagnostics");
    expect(texts).not.toContain("Movement");
    expect(
      snapshot.commands.some((command) => command.role === "scroll-container-scrollbar-thumb")
    ).toBe(false);

    const tabletBounds = runtime.getBounds("arm-os:tablet-screen");
    expect(tabletBounds).toEqual({
      x: surface.safeArea?.left,
      y: surface.safeArea?.top,
      width: (surface.width ?? 0) - (surface.safeArea?.left ?? 0) - (surface.safeArea?.right ?? 0),
      height: (surface.height ?? 0) - (surface.safeArea?.top ?? 0) - (surface.safeArea?.bottom ?? 0)
    });

    clickComponentCenter(runtime, "arm-os:home:open:space-found-living-room-settings");
    runtime.takeOutputs();
    const appSnapshot = runtime.render();

    const settingsSurface = findSurfaceCommand(
      appSnapshot.commands,
      "space.found.living-room.settings:"
    );
    expect(settingsSurface).toBeDefined();
    const settingsHandle = settingsSurface ? getHostedSnapshotHandle(settingsSurface) : undefined;
    const lightToggle = settingsHandle?.snapshot.commands.find(
      (command): command is Extract<DrawCommand, { type: "rect" }> =>
        command.type === "rect" &&
        command.componentId === "lightOn-toggle" &&
        command.role === "toggle-switch"
    );
    expect(lightToggle).toBeDefined();

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
      instanceId: "space-found-living-room-settings-1",
      windowId: "space-found-living-room-settings-1-window",
      event: expect.objectContaining({
        type: "app-change",
        appId: "space.found.living-room.settings",
        instanceId: "space-found-living-room-settings-1",
        windowId: "space-found-living-room-settings-1-window",
        name: "lightOn.change",
        payload: {
          field: "lightOn",
          value: false
        }
      })
    });
  });

  it("can re-enter the arm rear-view tablet app", () => {
    const surfaces = createEmbeddedSurfaceService();
    surfaces.publish(REAR_VIEW_SOURCE_ID, {
      available: true,
      handle: { kind: "test-rear-view" },
      sourceWidth: 320,
      sourceHeight: 180,
      sourceType: "test-camera"
    });
    const runtime = createRuntime({
      root: createRoomPanelRoot("arm", createRoomDemoStore().getState()),
      surface: getRoomPanelSurface("arm"),
      theme: getRoomPanelTheme("arm"),
      services: {
        surfaces
      }
    });

    runtime.render();
    clickComponentCenter(runtime, "arm-os:home:open:space-found-living-room-rear-view");
    runtime.takeOutputs();
    const firstEntry = runtime.render();
    expect(findHostedSurface(firstEntry.commands, "space.found.living-room.rear-view:")).toBeDefined();

    clickComponentCenter(runtime, "arm-os:tablet-screen:home-control", 20);
    runtime.takeOutputs();
    expect(collectTexts(runtime.render().commands)).toContain("Apps");

    clickComponentCenter(runtime, "arm-os:home:open:space-found-living-room-rear-view", 30);
    runtime.takeOutputs();
    const secondEntry = runtime.render();
    const rearViewSurface = findHostedSurface(
      secondEntry.commands,
      "space.found.living-room.rear-view:"
    );

    expect(rearViewSurface).toBeDefined();
    const handle = rearViewSurface ? getHostedSnapshotHandle(rearViewSurface) : undefined;
    expect(
      handle?.snapshot.commands.some(
        (command) =>
          command.type === "surface" &&
          command.componentId === "rear-view-surface" &&
          command.sourceId === REAR_VIEW_SOURCE_ID
      )
    ).toBe(true);
  });

  it("hosts the fractal art source as an arm tablet GPU composite test app", () => {
    const surfaces = createEmbeddedSurfaceService();
    surfaces.publish(WALL_PICTURE_SOURCE_ID, {
      available: true,
      handle: {
        kind: "three-texture",
        texture: { isTexture: true }
      },
      sourceWidth: 512,
      sourceHeight: 320,
      sourceType: "three-texture"
    });
    const runtime = createRuntime({
      root: createRoomPanelRoot("arm", createRoomDemoStore().getState()),
      surface: getRoomPanelSurface("arm"),
      theme: getRoomPanelTheme("arm"),
      services: {
        surfaces
      }
    });

    runtime.render();
    clickComponentCenter(runtime, "arm-os:home:open:space-found-living-room-fractal-art");
    runtime.takeOutputs();
    const snapshot = runtime.render();
    const hostedSurface = findHostedSurface(
      snapshot.commands,
      "space.found.living-room.fractal-art:"
    );
    expect(hostedSurface).toBeDefined();

    const handle = hostedSurface ? getHostedSnapshotHandle(hostedSurface) : undefined;
    const fractalSurface = handle?.snapshot.commands.find(
      (command): command is SurfaceDrawCommand =>
        command.type === "surface" && command.componentId === "fractal-art-surface"
    );

    expect(fractalSurface).toMatchObject({
      sourceId: WALL_PICTURE_SOURCE_ID,
      compositionMode: "composite"
    });
    expect(fractalSurface?.handle).toMatchObject({
      kind: "three-texture"
    });
    expect(fractalSurface?.surfaceRevision).toBe(1);
  });
});

function findHostedSurface(
  commands: readonly DrawCommand[],
  componentIdPrefix: string
): SurfaceDrawCommand | undefined {
  return commands.find(
    (command): command is SurfaceDrawCommand =>
      command.type === "surface" &&
      command.role === "embedded-surface-viewport" &&
      command.componentId.startsWith(componentIdPrefix) &&
      typeof command.sourceId === "string" &&
      command.sourceId.endsWith(":surface-source")
  );
}

function findSurfaceCommand(
  commands: readonly DrawCommand[],
  componentIdPrefix: string
): SurfaceDrawCommand | undefined {
  return commands.find(
    (command): command is SurfaceDrawCommand =>
      command.type === "surface" &&
      command.role === "embedded-surface-viewport" &&
      command.componentId.startsWith(componentIdPrefix)
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
