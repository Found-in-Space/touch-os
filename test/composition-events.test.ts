import { describe, expect, it } from "vitest";
import {
  createButton,
  createNode,
  createRuntime,
  createToggle,
  type DisplayComponent
} from "../src/index.js";
import { clickComponentCenter } from "./helpers/runtime-helpers.js";

interface ShellProps {
  childId: string;
}

const ShellComponent: DisplayComponent<ShellProps, undefined> = {
  kind: "shell",
  measure(ctx) {
    return ctx.measureChild(ctx.props.childId);
  },
  layout(ctx) {
    ctx.setChildBounds(ctx.props.childId, ctx.bounds);
    ctx.setContentBounds(ctx.bounds);
  },
  render() {
    return [];
  },
  hitTest() {
    return null;
  }
};

describe("component event bubbling", () => {
  it("bubbles descendant actions and same-frame navigation requests through ancestors", () => {
    const observed: string[] = [];

    const parent: DisplayComponent<ShellProps, undefined> = {
      ...ShellComponent,
      getChildren() {
        return [
          createButton("leaf-button", {
            label: "Next",
            actionId: "nav.next"
          })
        ];
      },
      handleEvent(ctx) {
        if (ctx.event.type === "action" && ctx.event.actionId === "nav.next") {
          ctx.emit({
            type: "navigation-request",
            componentId: ctx.id,
            containerId: "fixture-pages",
            intent: "push",
            pageId: "details"
          });
        }
      }
    };

    const root: DisplayComponent<{}, undefined> = {
      ...ShellComponent,
      getChildren() {
        return [
          createNode("parent-shell", parent, {
            childId: "leaf-button"
          })
        ];
      },
      measure(ctx) {
        return ctx.measureChild("parent-shell");
      },
      layout(ctx) {
        ctx.setChildBounds("parent-shell", ctx.bounds);
        ctx.setContentBounds(ctx.bounds);
      },
      handleEvent(ctx) {
        if (ctx.event.type === "action") {
          observed.push(`action:${ctx.event.actionId}`);
        }
        if (ctx.event.type === "navigation-request") {
          observed.push(`navigation:${ctx.event.intent}:${ctx.event.pageId ?? ""}`);
        }
      }
    };

    const runtime = createRuntime({
      root: createNode("root-shell", root, {}),
      surface: { width: 180, height: 80 }
    });

    runtime.render();
    const result = clickComponentCenter(runtime, "leaf-button");

    expect(result.outputs).toContainEqual({
      type: "action",
      actionId: "nav.next",
      componentId: "leaf-button"
    });
    expect(result.outputs).toContainEqual({
      type: "navigation-request",
      componentId: "parent-shell",
      containerId: "fixture-pages",
      intent: "push",
      pageId: "details"
    });
    expect(observed).toEqual(["action:nav.next", "navigation:push:details"]);
  });

  it("bubbles change requests from controlled child components", () => {
    const observed: string[] = [];

    const parent: DisplayComponent<ShellProps, undefined> = {
      ...ShellComponent,
      getChildren() {
        return [
          createToggle("leaf-toggle", {
            label: "Show Labels",
            value: false,
            field: "showLabels"
          })
        ];
      }
    };

    const root: DisplayComponent<{}, undefined> = {
      ...ShellComponent,
      getChildren() {
        return [
          createNode("parent-shell", parent, {
            childId: "leaf-toggle"
          })
        ];
      },
      measure(ctx) {
        return ctx.measureChild("parent-shell");
      },
      layout(ctx) {
        ctx.setChildBounds("parent-shell", ctx.bounds);
        ctx.setContentBounds(ctx.bounds);
      },
      handleEvent(ctx) {
        if (ctx.event.type === "change-request") {
          observed.push(`${ctx.event.field}:${String(ctx.event.value)}`);
        }
      }
    };

    const runtime = createRuntime({
      root: createNode("root-shell", root, {}),
      surface: { width: 200, height: 80 }
    });

    runtime.render();
    const result = clickComponentCenter(runtime, "leaf-toggle");

    expect(result.outputs).toContainEqual({
      type: "change-request",
      componentId: "leaf-toggle",
      field: "showLabels",
      value: true
    });
    expect(observed).toEqual(["showLabels:true"]);
  });
});
