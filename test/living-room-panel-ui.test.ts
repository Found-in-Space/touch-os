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

  it("keeps the wrist panel controls reachable on its compact surface", () => {
    const surface = getRoomPanelSurface("arm");
    const runtime = createRuntime({
      root: createRoomPanelRoot("arm", createRoomDemoStore().getState()),
      surface,
      theme: getRoomPanelTheme("arm")
    });

    runtime.render();
    const scrollBounds = runtime.getBounds("arm-root:scroll");
    expect(scrollBounds).toBeDefined();
    expect((scrollBounds?.y ?? 0) + (scrollBounds?.height ?? 0)).toBeLessThanOrEqual(surface.height ?? 0);
    expect(runtime.getServices().scroll.getState("arm-root:scroll").maxOffsetY).toBeGreaterThan(0);

    const scroll = runtime.getServices().scroll;
    scroll.setOffset("arm-root:scroll", 0, scroll.getState("arm-root:scroll").maxOffsetY);

    const finalControl = runtime.getBounds("arm-motion-readout");
    expect(finalControl).toBeDefined();
    expect((finalControl?.y ?? 0) + (finalControl?.height ?? 0)).toBeLessThanOrEqual(surface.height ?? 0);
  });
});

function collectTexts(commands: readonly { type: string }[]): string[] {
  return commands
    .filter((command): command is TextDrawCommand => command.type === "text")
    .map((command) => command.text);
}
