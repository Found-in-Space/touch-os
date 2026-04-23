import { describe, expect, it } from "vitest";
import { createActionCard, createRuntime } from "../src/index.js";
import { createActionCardFixture } from "../src/examples/reference-fixtures.js";
import { findCommandByRole, getTexts, pressAt } from "./helpers/runtime-helpers.js";

describe("action card", () => {
  it("emits the primary action when its card button is pressed", () => {
    const runtime = createRuntime({
      root: createActionCardFixture(),
      surface: { width: 320, height: 180 }
    });

    const snapshot = runtime.render();
    const command = findCommandByRole(snapshot.commands, "action-card-primary");
    if (command.type !== "rect") {
      throw new Error("Expected the primary action command to be a rect.");
    }

    const result = pressAt(
      runtime,
      command.rect.x + command.rect.width / 2,
      command.rect.y + command.rect.height / 2
    );

    expect(result.outputs).toContainEqual({
      type: "action",
      actionId: "selection.go",
      componentId: "fixture-action-card"
    });
  });

  it("emits the dismiss action from the shell chrome without forwarding it elsewhere", () => {
    const runtime = createRuntime({
      root: createActionCardFixture(),
      surface: { width: 320, height: 180 }
    });

    const snapshot = runtime.render();
    const command = findCommandByRole(snapshot.commands, "action-card-dismiss");
    if (command.type !== "circle") {
      throw new Error("Expected the dismiss command to be a circle.");
    }

    const result = pressAt(runtime, command.cx, command.cy);

    expect(result.outputs).toContainEqual({
      type: "action",
      actionId: "selection.dismiss",
      componentId: "fixture-action-card"
    });
  });

  it("renders empty-state copy when no content lines are available", () => {
    const runtime = createRuntime({
      root: createActionCard("empty-action-card", {
        title: "Selected Target",
        emptyStateText: "No target selected"
      }),
      surface: { width: 320, height: 160 }
    });

    const texts = getTexts(runtime.render().commands);
    expect(texts).toContain("Selected Target");
    expect(texts).toContain("No target selected");
  });
});
