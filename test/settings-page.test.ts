import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import { createSettingsPageFixture } from "../src/examples/reference-fixtures.js";
import {
  applyNavigationOutputs,
  clickComponentCenter,
  getTexts
} from "./helpers/runtime-helpers.js";

describe("settings page fixture", () => {
  it("renders the reference composition and supports page-local navigation", () => {
    const runtime = createRuntime({
      root: createSettingsPageFixture({
        showLabels: true,
        brightness: 45,
        alertsEnabled: true
      }),
      surface: { width: 320, height: 180 }
    });

    let texts = getTexts(runtime.render().commands);
    expect(texts).toContain("Settings");
    expect(texts.some((text) => text.includes("Brightness"))).toBe(true);
    expect(texts).not.toContain("Enabled");

    const openAudioResult = clickComponentCenter(runtime, "settings-open-audio");
    expect(openAudioResult.outputs).toContainEqual({
      type: "action",
      actionId: "nav.open-audio",
      componentId: "settings-open-audio"
    });
    expect(openAudioResult.outputs).toContainEqual({
      type: "navigation-request",
      componentId: "settings-shell",
      containerId: "settings-pages",
      intent: "push",
      pageId: "audio-page"
    });

    texts = getTexts(runtime.render().commands);
    expect(texts).toContain("Settings");
    expect(texts.some((text) => text.includes("Brightness"))).toBe(true);
    expect(texts).not.toContain("Enabled");

    applyNavigationOutputs(runtime, openAudioResult.outputs);
    texts = getTexts(runtime.render().commands);
    expect(texts).toContain("Audio");
    expect(texts).toContain("Enabled");

    const backResult = clickComponentCenter(runtime, "audio-page-back", 10);
    expect(backResult.outputs).toContainEqual({
      type: "action",
      actionId: "nav.back",
      componentId: "audio-page-back"
    });
    expect(backResult.outputs).toContainEqual({
      type: "navigation-request",
      componentId: "settings-shell",
      containerId: "settings-pages",
      intent: "back"
    });

    applyNavigationOutputs(runtime, backResult.outputs);
    texts = getTexts(runtime.render().commands);
    expect(texts).toContain("Settings");
    expect(texts).not.toContain("Enabled");
  });

  it("tracks scroll state inside the runtime", () => {
    const runtime = createRuntime({
      root: createSettingsPageFixture({
        showLabels: true,
        brightness: 45,
        alertsEnabled: true
      }),
      surface: { width: 320, height: 120 }
    });

    runtime.render();
    const scrollState = runtime.getServices().scroll.getState("settings-scroll");
    expect(scrollState.maxOffsetY).toBeGreaterThan(0);

    const scrollBounds = runtime.getBounds("settings-scroll");
    expect(scrollBounds).toBeDefined();

    runtime.dispatchInput({
      type: "scroll",
      surfaceX: (scrollBounds?.x ?? 0) + 12,
      surfaceY: (scrollBounds?.y ?? 0) + 12,
      deltaX: 0,
      deltaY: 40,
      timestamp: 1
    });

    const nextScrollState = runtime.getServices().scroll.getState("settings-scroll");
    expect(nextScrollState.offsetY).toBeGreaterThan(0);
    expect(runtime.render().revision).toBeGreaterThan(0);
  });

  it("supports drag-to-scroll inside the runtime", () => {
    const runtime = createRuntime({
      root: createSettingsPageFixture({
        showLabels: true,
        brightness: 45,
        alertsEnabled: true
      }),
      surface: { width: 320, height: 120 }
    });

    runtime.render();
    const scrollBounds = runtime.getBounds("settings-scroll");
    expect(scrollBounds).toBeDefined();

    const startX = (scrollBounds?.x ?? 0) + 24;
    const startY = (scrollBounds?.y ?? 0) + 60;

    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: startX,
      surfaceY: startY,
      timestamp: 1
    });
    runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: startX,
      surfaceY: startY - 50,
      timestamp: 2
    });
    runtime.dispatchInput({
      type: "pointer-up",
      surfaceX: startX,
      surfaceY: startY - 50,
      timestamp: 3
    });

    expect(runtime.getServices().scroll.getState("settings-scroll").offsetY).toBeGreaterThan(0);
  });

  it("clears focus when navigation hides the focused control", () => {
    const runtime = createRuntime({
      root: createSettingsPageFixture({
        showLabels: true,
        brightness: 45,
        alertsEnabled: true
      }),
      surface: { width: 320, height: 180 }
    });

    runtime.render();
    clickComponentCenter(runtime, "brightness-slider");
    expect(runtime.getInteraction().focusedComponentId).toBe("brightness-slider");

    const result = clickComponentCenter(runtime, "settings-open-audio", 10);
    applyNavigationOutputs(runtime, result.outputs);
    runtime.render();

    expect(runtime.getInteraction().focusedComponentId).toBeUndefined();
  });
});
