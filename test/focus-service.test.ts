import { describe, expect, it } from "vitest";
import {
  createButton,
  createColumn,
  createPageContainer,
  createRuntime
} from "../src/index.js";

describe("focus service", () => {
  it("tracks focusable order and default targets for built-in controls", () => {
    const runtime = createRuntime({
      root: createColumn("focus-root", {
        children: [
          createButton("first-button", {
            label: "First",
            actionId: "first.run"
          }),
          createButton("second-button", {
            label: "Second",
            actionId: "second.run"
          })
        ]
      }),
      surface: { width: 240, height: 140 }
    });

    runtime.render();
    const focus = runtime.getServices().focus;

    expect(focus.getFocusableComponentIds()).toEqual([
      "first-button",
      "second-button"
    ]);
    expect(focus.getDefaultTargetId("first-button")).toBe("first-button:face");

    expect(focus.focusNext()).toBe("first-button");
    expect(runtime.getInteraction().focusedComponentId).toBe("first-button");
    expect(focus.getDefaultTargetId()).toBe("first-button:face");

    expect(focus.focusNext()).toBe("second-button");
    expect(runtime.getInteraction().focusedComponentId).toBe("second-button");

    expect(focus.focusPrevious()).toBe("first-button");
    expect(runtime.getInteraction().focusedComponentId).toBe("first-button");
  });

  it("moves focus to the next visible page-local control when navigation hides the current one", () => {
    const runtime = createRuntime({
      root: createPageContainer("focus-pages", {
        initialPageId: "page-a",
        children: [
          createColumn("page-a", {
            children: [
              createButton("page-a-button", {
                label: "A",
                actionId: "page.a"
              })
            ]
          }),
          createColumn("page-b", {
            children: [
              createButton("page-b-button", {
                label: "B",
                actionId: "page.b"
              })
            ]
          })
        ]
      }),
      surface: { width: 240, height: 140 }
    });

    runtime.render();
    runtime.getServices().focus.requestFocus("page-a-button");
    expect(runtime.getInteraction().focusedComponentId).toBe("page-a-button");

    runtime.getServices().navigation.push("focus-pages", "page-b");
    runtime.render();

    expect(runtime.getInteraction().focusedComponentId).toBe("page-b-button");
    expect(runtime.getServices().focus.getDefaultTargetId()).toBe("page-b-button:face");
  });
});
