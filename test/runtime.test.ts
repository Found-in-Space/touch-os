import { describe, expect, it } from "vitest";
import { createNode, createRuntime, type DisplayComponent } from "../src/index.js";

describe("runtime core", () => {
  it("runs an explicit lifecycle and reconciles updates by id", () => {
    const calls: string[] = [];

    const component: DisplayComponent<{ label: string }> = {
      kind: "spy",
      mount() {
        calls.push("mount");
      },
      update() {
        calls.push("update");
      },
      measure() {
        calls.push("measure");
        return { width: 120, height: 32 };
      },
      layout() {
        calls.push("layout");
      },
      render() {
        calls.push("render");
        return [];
      },
      hitTest(ctx) {
        return { targetId: `${ctx.id}:face` };
      },
      dispose() {
        calls.push("dispose");
      }
    };

    const runtime = createRuntime({
      root: createNode("spy", component, { label: "first" }),
      surface: { width: 160, height: 100 }
    });

    runtime.render();
    expect(calls).toEqual(["mount", "measure", "layout", "render"]);

    runtime.setRoot(createNode("spy", component, { label: "second" }));
    runtime.render();
    expect(calls.slice(4, 8)).toEqual(["update", "measure", "layout", "render"]);

    runtime.dispose();
    expect(calls.at(-1)).toBe("dispose");
  });

  it("dispatches normalized pointer events and only rerenders when dirty", () => {
    const events: string[] = [];

    const component: DisplayComponent<Record<string, never>> = {
      kind: "interactive-spy",
      measure() {
        return { width: 80, height: 40 };
      },
      render() {
        return [];
      },
      hitTest(ctx) {
        return { targetId: `${ctx.id}:face` };
      },
      handleEvent(ctx) {
        events.push(`${ctx.id}:${ctx.event.type}`);
      }
    };

    const runtime = createRuntime({
      root: createNode("spy", component, {}),
      surface: { width: 160, height: 120 }
    });

    const firstRender = runtime.render();
    const secondRender = runtime.render();
    expect(secondRender.revision).toBe(firstRender.revision);

    const bounds = runtime.getBounds("spy");
    expect(bounds).toBeDefined();

    runtime.dispatchInput({
      type: "pointer-move",
      surfaceX: (bounds?.x ?? 0) + 10,
      surfaceY: (bounds?.y ?? 0) + 10,
      timestamp: 1
    });
    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (bounds?.x ?? 0) + 10,
      surfaceY: (bounds?.y ?? 0) + 10,
      timestamp: 2
    });
    runtime.dispatchInput({
      type: "pointer-up",
      surfaceX: (bounds?.x ?? 0) + 10,
      surfaceY: (bounds?.y ?? 0) + 10,
      timestamp: 3
    });

    expect(events).toContain("spy:pointer-enter");
    expect(events).toContain("spy:pointer-move");
    expect(events).toContain("spy:pointer-down");
    expect(events).toContain("spy:pointer-up");
    expect(events).toContain("spy:press");

    const thirdRender = runtime.render();
    expect(thirdRender.revision).toBeGreaterThan(firstRender.revision);
    expect(runtime.getInteraction().focusedComponentId).toBe("spy");
  });

  it("ignores pointer-up and cancel events for a different pointer id", () => {
    const events: string[] = [];

    const component: DisplayComponent<Record<string, never>> = {
      kind: "interactive-spy",
      measure() {
        return { width: 80, height: 40 };
      },
      render() {
        return [];
      },
      hitTest(ctx) {
        return { targetId: `${ctx.id}:face` };
      },
      handleEvent(ctx) {
        events.push(`${ctx.id}:${ctx.event.type}`);
      }
    };

    const runtime = createRuntime({
      root: createNode("spy", component, {}),
      surface: { width: 160, height: 120 }
    });

    runtime.render();
    const bounds = runtime.getBounds("spy");
    const surfaceX = (bounds?.x ?? 0) + 10;
    const surfaceY = (bounds?.y ?? 0) + 10;

    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX,
      surfaceY,
      timestamp: 1,
      pointerId: "pointer-a"
    });
    runtime.dispatchInput({
      type: "pointer-up",
      surfaceX,
      surfaceY,
      timestamp: 2,
      pointerId: "pointer-b"
    });
    runtime.dispatchInput({
      type: "cancel",
      surfaceX,
      surfaceY,
      timestamp: 3,
      pointerId: "pointer-b"
    });

    expect(events).toContain("spy:pointer-down");
    expect(events).not.toContain("spy:pointer-up");
    expect(events).not.toContain("spy:cancel");
    expect(runtime.getInteraction().pressedTargetId).toBe("spy:face");

    runtime.dispatchInput({
      type: "cancel",
      surfaceX,
      surfaceY,
      timestamp: 4,
      pointerId: "pointer-a"
    });

    expect(events).toContain("spy:cancel");
    expect(runtime.getInteraction().pressedTargetId).toBeUndefined();
  });
});
