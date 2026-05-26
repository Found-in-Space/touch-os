import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import type { TextDrawCommand } from "../src/core/draw.js";
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

    const texts = collectTexts(runtime.render().commands);
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

    const texts = collectTexts(runtime.render().commands);
    expect(texts).toContain("Movement");
    expect(texts).toContain("Settings");
    expect(texts).toContain("Rear View");
    expect(texts).toContain("Diagnostics");

    const layerBounds = runtime.getBounds("arm-os:windows");
    expect(layerBounds).toEqual({
      x: 0,
      y: 0,
      width: surface.width,
      height: surface.height
    });

    const movementWindowBounds = runtime.getBounds("arm-movement-window");
    expect(movementWindowBounds).toBeDefined();
    expect((movementWindowBounds?.x ?? 0) + (movementWindowBounds?.width ?? 0)).toBeLessThanOrEqual(surface.width ?? 0);
    expect((movementWindowBounds?.y ?? 0) + (movementWindowBounds?.height ?? 0)).toBeLessThanOrEqual(surface.height ?? 0);

    const movementDpadId =
      "space.found.living-room.movement:movement:arm-movement-window:movement-dpad";
    const movementDpadBounds = runtime.getBounds(movementDpadId);
    expect(movementDpadBounds).toBeDefined();
    expect(
      runtime.getBounds(
        "space.found.living-room.rear-view:rear-view:arm-rear-view-window:rear-view-surface"
      )
    ).toBeDefined();

    if (!movementDpadBounds) {
      throw new Error("Expected the arm movement d-pad to be mounted.");
    }
    pressAt(
      runtime,
      movementDpadBounds.x + movementDpadBounds.width / 2,
      movementDpadBounds.y + movementDpadBounds.height / 6
    );

    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "movement.set",
      componentId: movementDpadId,
      payload: {
        intent: "forward",
        active: true
      }
    });
  });
});

function collectTexts(commands: readonly { type: string }[]): string[] {
  return commands
    .filter((command): command is TextDrawCommand => command.type === "text")
    .map((command) => command.text);
}
