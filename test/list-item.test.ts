import { describe, expect, it } from "vitest";
import {
  createColumn,
  createListItem,
  createRuntime,
  createScrollContainer,
  createSection
} from "../src/index.js";
import { findCommandByRole } from "./helpers/runtime-helpers.js";

describe("list-item control", () => {
  it("measures and lays out within columns, sections, and scroll containers", () => {
    const runtime = createRuntime({
      root: createScrollContainer("scroll-shell", {
        children: [
          createSection("settings-section", {
            title: "General",
            children: [
              createColumn("settings-column", {
                children: [
                  createListItem("list-row-a", {
                    label: "Show labels",
                    description: "Render labels in compact mode",
                    trailingText: "On"
                  }),
                  createListItem("list-row-b", {
                    label: "Brightness",
                    trailingText: "80%"
                  })
                ]
              })
            ]
          })
        ]
      }),
      surface: { width: 320, height: 120 }
    });

    runtime.render();

    const rowA = runtime.getBounds("list-row-a");
    const rowB = runtime.getBounds("list-row-b");
    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();
    expect((rowA?.width ?? 0) > 0).toBe(true);
    expect((rowB?.y ?? 0) > (rowA?.y ?? 0)).toBe(true);

    const scrollState = runtime.getServices().scroll.getState("scroll-shell");
    expect(scrollState.content.height).toBeGreaterThan(scrollState.viewport.height);
  });

  it("emits row-body actions on press", () => {
    const runtime = createRuntime({
      root: createListItem("press-row", {
        label: "Open details",
        actionId: "row.open"
      }),
      surface: { width: 240, height: 80 }
    });

    runtime.render();
    const bounds = runtime.getBounds("press-row");
    expect(bounds).toBeDefined();

    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (bounds?.x ?? 0) + 24,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 1
    });
    const result = runtime.dispatchInput({
      type: "pointer-up",
      surfaceX: (bounds?.x ?? 0) + 24,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 2
    });

    expect(result.outputs).toContainEqual({
      type: "action",
      actionId: "row.open",
      componentId: "press-row"
    });
  });

  it("is non-interactive when disabled", () => {
    const runtime = createRuntime({
      root: createListItem("disabled-row", {
        label: "Disabled",
        actionId: "row.disabled",
        disabled: true
      }),
      surface: { width: 240, height: 80 }
    });

    runtime.render();
    const bounds = runtime.getBounds("disabled-row");
    expect(bounds).toBeDefined();

    const down = runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (bounds?.x ?? 0) + 20,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 1
    });
    const up = runtime.dispatchInput({
      type: "pointer-up",
      surfaceX: (bounds?.x ?? 0) + 20,
      surfaceY: (bounds?.y ?? 0) + (bounds?.height ?? 0) / 2,
      timestamp: 2
    });

    expect(down.handled).toBe(false);
    expect(up.outputs).toHaveLength(0);
    expect(runtime.getServices().focus.getFocusableComponentIds()).toEqual([]);
  });

  it("registers focus traversal and a default row-body target", () => {
    const runtime = createRuntime({
      root: createColumn("list-root", {
        children: [
          createListItem("focus-row-a", {
            label: "A",
            actionId: "row.a"
          }),
          createListItem("focus-row-b", {
            label: "B",
            actionId: "row.b"
          })
        ]
      }),
      surface: { width: 240, height: 140 }
    });

    runtime.render();
    const focus = runtime.getServices().focus;

    expect(focus.getFocusableComponentIds()).toEqual(["focus-row-a", "focus-row-b"]);
    expect(focus.getDefaultTargetId("focus-row-a")).toBe("focus-row-a:body");
    expect(focus.focusNext()).toBe("focus-row-a");
    expect(focus.focusNext()).toBe("focus-row-b");
  });

  it("renders optional description and trailing content", () => {
    const runtime = createRuntime({
      root: createListItem("rich-row", {
        label: "Camera",
        description: "Rear hatch feed",
        trailingText: "Active",
        leadingText: "A",
        actionId: "row.open"
      }),
      surface: { width: 280, height: 100 }
    });

    const snapshot = runtime.render();
    const description = findCommandByRole(snapshot.commands, "list-item-description");
    const trailing = findCommandByRole(snapshot.commands, "list-item-trailing");
    const leading = findCommandByRole(snapshot.commands, "list-item-leading");
    if (description.type !== "text" || trailing.type !== "text" || leading.type !== "text") {
      throw new Error("Expected text commands for list item accessory content.");
    }
    expect(description.text).toBe("Rear hatch feed");
    expect(trailing.text).toBe("Active");
    expect(leading.text).toBe("A");
  });
});
