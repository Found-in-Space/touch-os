import { describe, expect, it } from "vitest";
import {
  createDockLayout,
  createNode,
  createRuntime,
  type DisplayComponent
} from "../src/index.js";

describe("dock layout", () => {
  it("anchors measured children to safe-area-adjusted edges without stretching them", () => {
    const runtime = createRuntime({
      root: createDockLayout("dock-root", {
        padding: 8,
        topLeft: {
          child: createProbeNode("probe-top-left", 50, 20)
        },
        topCenter: {
          child: createProbeNode("probe-top-center", 60, 24)
        },
        bottomRight: {
          child: createProbeNode("probe-bottom-right", 40, 16)
        }
      }),
      surface: {
        width: 300,
        height: 200,
        safeArea: { top: 10, right: 20, bottom: 30, left: 40 }
      }
    });

    runtime.render();

    expect(runtime.getBounds("probe-top-left")).toEqual({
      x: 48,
      y: 18,
      width: 50,
      height: 20
    });
    expect(runtime.getBounds("probe-top-center")).toEqual({
      x: 130,
      y: 18,
      width: 60,
      height: 24
    });
    expect(runtime.getBounds("probe-bottom-right")).toEqual({
      x: 232,
      y: 146,
      width: 40,
      height: 16
    });
  });

  it("does not try to resolve collisions between docked regions", () => {
    const runtime = createRuntime({
      root: createDockLayout("dock-root", {
        topLeft: {
          child: createProbeNode("probe-left", 140, 20)
        },
        topRight: {
          child: createProbeNode("probe-right", 140, 20)
        }
      }),
      surface: {
        width: 220,
        height: 120
      }
    });

    runtime.render();
    const left = runtime.getBounds("probe-left");
    const right = runtime.getBounds("probe-right");
    if (!left || !right) {
      throw new Error("Expected docked children to produce bounds.");
    }

    expect(left.x + left.width).toBeGreaterThan(right.x);
  });
});

function createProbeNode(id: string, width: number, height: number) {
  const component: DisplayComponent<Record<string, never>> = {
    kind: "dock-probe",
    measure() {
      return { width, height };
    },
    render() {
      return [];
    },
    hitTest() {
      return null;
    }
  };

  return createNode(id, component, {});
}
