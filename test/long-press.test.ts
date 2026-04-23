import { describe, expect, it } from "vitest";
import { createNode, createRuntime, type DisplayComponent } from "../src/index.js";

describe("long press", () => {
  it("dispatches long-press events through the normal component contract", () => {
    const component: DisplayComponent<Record<string, never>> = {
      kind: "long-press-probe",
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
        if (ctx.event.type !== "long-press") {
          return;
        }

        ctx.emit({
          type: "action",
          actionId: "probe.long-press",
          componentId: ctx.id
        });
      }
    };

    const runtime = createRuntime({
      root: createNode("probe", component, {}),
      surface: { width: 160, height: 120 }
    });

    runtime.render();
    const bounds = runtime.getBounds("probe");
    expect(bounds).toBeDefined();

    runtime.dispatchInput({
      type: "pointer-down",
      surfaceX: (bounds?.x ?? 0) + 20,
      surfaceY: (bounds?.y ?? 0) + 20,
      timestamp: 1
    });

    runtime.tick(500);
    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "probe.long-press",
      componentId: "probe"
    });
  });
});
