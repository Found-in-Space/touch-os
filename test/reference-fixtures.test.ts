import { describe, expect, it } from "vitest";
import { createRuntime, type DisplayNode } from "../src/index.js";
import {
  createActionCardFixture,
  createBitmapPlotFixture,
  createButtonFixture,
  createCustomGraphFixture,
  createEmbeddedSurfaceFixture,
  createFormattedSliderFixture,
  createMultiChoiceGroupFixture,
  createSettingsPageFixture,
  createSingleChoiceGroupFixture,
  createSliderFixture
} from "../src/examples/reference-fixtures.js";

const referenceFixtures: Readonly<Record<string, () => DisplayNode>> = {
  button: createButtonFixture,
  slider: createSliderFixture,
  formattedSlider: createFormattedSliderFixture,
  singleChoiceGroup: createSingleChoiceGroupFixture,
  multiChoiceGroup: createMultiChoiceGroupFixture,
  settingsPage: () => createSettingsPageFixture({
    showLabels: true,
    brightness: 55,
    alertsEnabled: false
  }),
  actionCard: createActionCardFixture,
  customGraph: createCustomGraphFixture,
  bitmapPlot: createBitmapPlotFixture,
  embeddedSurface: createEmbeddedSurfaceFixture
};

describe("reference fixture conformance", () => {
  for (const [name, createFixture] of Object.entries(referenceFixtures)) {
    it(`mounts, lays out, and renders the ${name} fixture`, () => {
      const runtime = createRuntime({
        root: createFixture(),
        surface: { width: 480, height: 320 }
      });

      const snapshot = runtime.render();
      expect(snapshot.commands.length).toBeGreaterThan(0);
      expect(new Set(snapshot.commands.map((command) => command.componentId)).size)
        .toBeGreaterThan(0);

      runtime.dispose();
    });
  }
});
