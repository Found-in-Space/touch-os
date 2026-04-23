import { describe, expect, it } from "vitest";
import type { DisplayRuntime, HostAdapter, HostFrame } from "../src/index.js";
import { createEmbeddedSurfaceService, createRuntime } from "../src/index.js";
import { createButtonFixture } from "../src/examples/reference-fixtures.js";

describe("host contracts", () => {
  it("accepts normalized host frames without DOM or XR dependencies", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    runtime.render();
    const bounds = runtime.getBounds("fixture-button");
    expect(bounds).toBeDefined();

    const host = createFakeHost(runtime);
    const frame: HostFrame = {
      viewport: {
        x: 0,
        y: 0,
        width: 160,
        height: 100
      },
      events: [
        {
          type: "pointer-down",
          surfaceX: (bounds?.x ?? 0) + 20,
          surfaceY: (bounds?.y ?? 0) + 20,
          timestamp: 1
        },
        {
          type: "pointer-up",
          surfaceX: (bounds?.x ?? 0) + 20,
          surfaceY: (bounds?.y ?? 0) + 20,
          timestamp: 2
        }
      ]
    };

    host.attach();
    host.update(frame);
    host.detach();

    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "fixture.confirm",
      componentId: "fixture-button"
    });
  });

  it("provides a no-op embedded surface service for contract testing", () => {
    const surfaces = createEmbeddedSurfaceService();
    surfaces.attach("surface", {
      sourceId: "camera.main",
      interactive: true,
      acceptsForwardedInput: true
    });
    expect(surfaces.isAvailable("surface")).toBe(false);

    surfaces.forwardEvent("surface", {
      type: "press",
      timestamp: 5,
      pointerId: "pointer-1",
      pointerType: "mouse",
      surfaceX: 12,
      surfaceY: 14,
      localX: 4,
      localY: 6,
      componentId: "surface",
      targetId: "surface:viewport"
    });

    const attachment = surfaces.getAttachment("surface");
    expect(attachment?.forwardedEvents).toHaveLength(1);

    surfaces.release("surface");
    expect(surfaces.getAttachment("surface")).toBeUndefined();
  });
});

function createFakeHost(runtime: DisplayRuntime): HostAdapter {
  return {
    attach() {},
    update(frame) {
      runtime.resize({
        width: frame.viewport.width,
        height: frame.viewport.height
      });
      for (const event of frame.events ?? []) {
        runtime.dispatchInput(event);
      }
    },
    detach() {}
  };
}
