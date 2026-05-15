import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import { createChoiceGroup } from "../src/components/index.js";
import {
  findCommandByRole,
  findRectCommandsByRole,
  pressAt
} from "./helpers/runtime-helpers.js";

describe("choice group", () => {
  it("rejects invalid configuration", () => {
    expect(() =>
      createChoiceGroup("missing-field", {
        selectionMode: "single",
        options: [{ value: "a", label: "A" }]
      } as never)
    ).toThrow(/field is required/i);

    expect(() =>
      createChoiceGroup("empty-group", {
        field: "empty",
        selectionMode: "single",
        options: []
      })
    ).toThrow(/at least one option/i);

    expect(() =>
      createChoiceGroup("duplicate-group", {
        field: "duplicate",
        selectionMode: "single",
        options: [
          { value: "a", label: "A" },
          { value: "a", label: "Again" }
        ]
      })
    ).toThrow(/must be unique/i);

    expect(() =>
      createChoiceGroup("mixed-single", {
        field: "mixedSingle",
        selectionMode: "single",
        value: "a",
        values: ["a"],
        options: [{ value: "a", label: "A" }]
      })
    ).toThrow(/must not receive values/i);

    expect(() =>
      createChoiceGroup("mixed-multiple", {
        field: "mixedMultiple",
        selectionMode: "multiple",
        value: "a",
        options: [{ value: "a", label: "A" }]
      })
    ).toThrow(/must not receive value/i);

    expect(() =>
      createChoiceGroup("bad-columns", {
        field: "badColumns",
        selectionMode: "single",
        orientation: "vertical",
        columns: 2,
        options: [{ value: "a", label: "A" }]
      })
    ).toThrow(/only supported for horizontal/i);
  });

  it("emits single-select change requests and keeps the current option selected on repeat press", () => {
    const runtime = createRuntime({
      root: createChoiceGroup("quality-group", {
        label: "Quality",
        field: "quality",
        selectionMode: "single",
        value: "medium",
        orientation: "horizontal",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" }
        ]
      }),
      surface: { width: 320, height: 160 }
    });

    const snapshot = runtime.render();
    const optionRows = findRectCommandsByRole(snapshot.commands, "choice-option-row");

    const sameSelection = pressAt(
      runtime,
      optionRows[1]!.rect.x + optionRows[1]!.rect.width / 2,
      optionRows[1]!.rect.y + optionRows[1]!.rect.height / 2
    );
    expect(
      sameSelection.outputs.some((output) => output.type === "change-request")
    ).toBe(false);

    const nextSelection = pressAt(
      runtime,
      optionRows[2]!.rect.x + optionRows[2]!.rect.width / 2,
      optionRows[2]!.rect.y + optionRows[2]!.rect.height / 2,
      10
    );
    expect(nextSelection.outputs).toContainEqual({
      type: "change-request",
      componentId: "quality-group",
      field: "quality",
      value: "high"
    });
    expect(runtime.getInteraction().focusedComponentId).toBe("quality-group");
  });

  it("emits multi-select updates in declared option order", () => {
    const values = ["alpha"] as const;
    const makeGroup = (nextValues: readonly string[]) =>
      createChoiceGroup("channel-group", {
        label: "Channels",
        selectionMode: "multiple",
        field: "channels",
        values: nextValues,
        orientation: "horizontal",
        columns: 2,
        options: [
          { value: "alpha", label: "Alpha" },
          { value: "beta", label: "Beta" },
          { value: "gamma", label: "Gamma" },
          { value: "delta", label: "Delta" }
        ]
      });

    const runtime = createRuntime({
      root: makeGroup(values),
      surface: { width: 320, height: 200 }
    });

    let optionRows = findRectCommandsByRole(runtime.render().commands, "choice-option-row");

    const addResult = pressAt(
      runtime,
      optionRows[1]!.rect.x + optionRows[1]!.rect.width / 2,
      optionRows[1]!.rect.y + optionRows[1]!.rect.height / 2
    );
    expect(addResult.outputs).toContainEqual({
      type: "change-request",
      componentId: "channel-group",
      field: "channels",
      value: ["alpha", "beta"]
    });

    runtime.setRoot(makeGroup(["alpha", "beta"]));
    optionRows = findRectCommandsByRole(runtime.render().commands, "choice-option-row");

    const removeResult = pressAt(
      runtime,
      optionRows[0]!.rect.x + optionRows[0]!.rect.width / 2,
      optionRows[0]!.rect.y + optionRows[0]!.rect.height / 2,
      10
    );
    expect(removeResult.outputs).toContainEqual({
      type: "change-request",
      componentId: "channel-group",
      field: "channels",
      value: ["beta"]
    });
  });

  it("ignores disabled options and disabled groups", () => {
    const runtime = createRuntime({
      root: createChoiceGroup("disabled-option-group", {
        field: "disabledOption",
        selectionMode: "single",
        value: "b",
        options: [
          { value: "a", label: "A", disabled: true },
          { value: "b", label: "B" }
        ]
      }),
      surface: { width: 240, height: 160 }
    });

    let optionRows = findRectCommandsByRole(runtime.render().commands, "choice-option-row");

    const disabledOptionResult = pressAt(
      runtime,
      optionRows[0]!.rect.x + optionRows[0]!.rect.width / 2,
      optionRows[0]!.rect.y + optionRows[0]!.rect.height / 2
    );
    expect(disabledOptionResult.outputs).toHaveLength(0);

    runtime.setRoot(
      createChoiceGroup("disabled-option-group", {
        field: "disabledOption",
        selectionMode: "single",
        value: "b",
        disabled: true,
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" }
        ]
      })
    );

    optionRows = findRectCommandsByRole(runtime.render().commands, "choice-option-row");
    const disabledGroupResult = pressAt(
      runtime,
      optionRows[1]!.rect.x + optionRows[1]!.rect.width / 2,
      optionRows[1]!.rect.y + optionRows[1]!.rect.height / 2,
      10
    );
    expect(disabledGroupResult.outputs).toHaveLength(0);
    expect(runtime.getInteraction().focusedComponentId).toBeUndefined();
  });

  it("renders vertical, horizontal, and wrapped layouts predictably", () => {
    const verticalRuntime = createRuntime({
      root: createChoiceGroup("vertical-group", {
        field: "vertical",
        selectionMode: "single",
        options: [
          { value: "one", label: "One" },
          { value: "two", label: "Two" },
          { value: "three", label: "Three" }
        ]
      }),
      surface: { width: 320, height: 220 }
    });
    const verticalRows = findRectCommandsByRole(
      verticalRuntime.render().commands,
      "choice-option-row"
    );
    expect(verticalRows[0]!.rect.x).toBe(verticalRows[1]!.rect.x);
    expect(verticalRows[0]!.rect.width).toBe(verticalRows[1]!.rect.width);
    expect(verticalRows[1]!.rect.y).toBeGreaterThan(verticalRows[0]!.rect.y);

    const horizontalRuntime = createRuntime({
      root: createChoiceGroup("horizontal-group", {
        field: "horizontal",
        selectionMode: "single",
        orientation: "horizontal",
        options: [
          { value: "one", label: "One" },
          { value: "two", label: "Two" },
          { value: "three", label: "Three" }
        ]
      }),
      surface: { width: 320, height: 160 }
    });
    const horizontalRows = findRectCommandsByRole(
      horizontalRuntime.render().commands,
      "choice-option-row"
    );
    expect(horizontalRows[0]!.rect.y).toBe(horizontalRows[1]!.rect.y);
    expect(horizontalRows[0]!.rect.width).toBe(horizontalRows[1]!.rect.width);

    const wrappedRuntime = createRuntime({
      root: createChoiceGroup("wrapped-group", {
        field: "wrapped",
        selectionMode: "multiple",
        orientation: "horizontal",
        columns: 2,
        options: [
          { value: "one", label: "One" },
          { value: "two", label: "Two" },
          { value: "three", label: "Three" },
          { value: "four", label: "Four" }
        ]
      }),
      surface: { width: 320, height: 220 }
    });
    const wrappedRows = findRectCommandsByRole(
      wrappedRuntime.render().commands,
      "choice-option-row"
    );
    expect(wrappedRows[0]!.rect.y).toBe(wrappedRows[1]!.rect.y);
    expect(wrappedRows[2]!.rect.y).toBeGreaterThan(wrappedRows[0]!.rect.y);
    expect(wrappedRows[2]!.rect.x).toBe(wrappedRows[0]!.rect.x);
  });

  it("renders focused state at the group frame", () => {
    const runtime = createRuntime({
      root: createChoiceGroup("focus-group", {
        label: "Mode",
        field: "mode",
        selectionMode: "single",
        value: "a",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" }
        ]
      }),
      surface: { width: 240, height: 160 }
    });

    const snapshot = runtime.render();
    const optionRows = findRectCommandsByRole(snapshot.commands, "choice-option-row");
    pressAt(
      runtime,
      optionRows[1]!.rect.x + optionRows[1]!.rect.width / 2,
      optionRows[1]!.rect.y + optionRows[1]!.rect.height / 2
    );

    const focusedFrame = findCommandByRole(runtime.render().commands, "choice-group-frame");
    if (focusedFrame.type !== "rect") {
      throw new Error("Expected choice-group frame rect.");
    }

    expect(focusedFrame.stroke).toBe(runtime.getServices().theme.getTokens().focusColor);
  });
});
