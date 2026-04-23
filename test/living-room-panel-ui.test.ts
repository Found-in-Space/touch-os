import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import type { TextDrawCommand } from "../src/core/draw.js";
import {
  createRoomPanelRoot,
  getRoomPanelSurface,
  getRoomPanelTheme
} from "../examples/three-living-room/src/panel-ui.js";
import { createRoomDemoStore } from "../examples/three-living-room/src/store.js";

describe("living room panel ui", () => {
  it("renders TV and HUD from shared XR state", () => {
    const state = createRoomDemoStore({
      xrActive: true
    }).getState();

    const tvRuntime = createRuntime({
      root: createRoomPanelRoot("tv", state),
      surface: getRoomPanelSurface("tv"),
      theme: getRoomPanelTheme("tv")
    });
    const hudRuntime = createRuntime({
      root: createRoomPanelRoot("hud", state),
      surface: getRoomPanelSurface("hud"),
      theme: getRoomPanelTheme("hud")
    });

    const tvTexts = collectTexts(tvRuntime.render().commands);
    const hudTexts = collectTexts(hudRuntime.render().commands);

    expect(tvTexts).toContain("XR");
    expect(hudTexts).not.toContain("Touch OS Living Room");
    expect(hudTexts).not.toContain("Desktop");
  });

  it("reconciles the HUD from desktop layout to XR layout when XR state changes", () => {
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

    const xrTexts = collectTexts(runtime.render().commands);
    expect(xrTexts).not.toContain("Touch OS Living Room");
    expect(xrTexts).not.toContain("Desktop");
    expect(xrTexts).not.toContain("Move");
    expect(xrTexts).toContain("Mirror offline");
  });
});

function collectTexts(commands: readonly { type: string }[]): string[] {
  return commands
    .filter((command): command is TextDrawCommand => command.type === "text")
    .map((command) => command.text);
}
