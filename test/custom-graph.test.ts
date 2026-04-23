import { describe, expect, it } from "vitest";
import { createCustomGraph, createRuntime } from "../src/index.js";
import { createCustomGraphFixture } from "../src/examples/reference-fixtures.js";
import { findCommandByRole, pressAt } from "./helpers/runtime-helpers.js";

describe("custom graph", () => {
  it("renders rich graph commands on the shared surface", () => {
    const runtime = createRuntime({
      root: createCustomGraph("graph", {
        points: [12, 18, 16, 24, 28, 21, 30],
        highlightedIndex: 2
      }),
      surface: { width: 320, height: 180 }
    });

    const snapshot = runtime.render();
    expect(snapshot.commands.some((command) => command.role === "graph-axis-x")).toBe(true);
    expect(snapshot.commands.some((command) => command.role === "graph-axis-y")).toBe(true);
    expect(snapshot.commands.some((command) => command.role === "graph-line")).toBe(true);

    const highlight = findCommandByRole(snapshot.commands, "graph-highlight-label");
    if (highlight.type !== "text") {
      throw new Error("Expected the highlighted graph label to be text.");
    }

    expect(highlight.text).toBe("16");
  });

  it("supports custom hit testing and emits actions for hovered points", () => {
    const runtime = createRuntime({
      root: createCustomGraphFixture(),
      surface: { width: 320, height: 180 }
    });

    runtime.render();
    const bounds = runtime.getBounds("fixture-custom-graph");
    expect(bounds).toBeDefined();

    const pointX = (bounds?.x ?? 0) + (bounds?.width ?? 0) * 0.95;
    const pointY = (bounds?.y ?? 0) + (bounds?.height ?? 0) * 0.5;

    runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: pointX,
      surfaceY: pointY,
      timestamp: 1
    });

    const hoverSnapshot = runtime.render();
    const label = findCommandByRole(hoverSnapshot.commands, "graph-highlight-label");
    if (label.type !== "text") {
      throw new Error("Expected the hovered graph label to be text.");
    }

    expect(label.text).toBe("30");

    const result = pressAt(runtime, pointX, pointY, 10);
    expect(result.outputs).toContainEqual({
      type: "action",
      actionId: "graph.select-point",
      componentId: "fixture-custom-graph",
      payload: {
        index: 6
      }
    });
  });
});
