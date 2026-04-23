import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import { createSettingsPageFixture } from "../src/examples/reference-fixtures.js";

function getTexts(commands: readonly { type: string; text?: string }[]): string[] {
  return commands
    .filter((command) => command.type === "text")
    .map((command) => command.text)
    .filter((text): text is string => typeof text === "string");
}

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

    runtime.getServices().navigation.push("settings-pages", "audio-page");
    texts = getTexts(runtime.render().commands);
    expect(texts).toContain("Audio");
    expect(texts).toContain("Enabled");
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
});
