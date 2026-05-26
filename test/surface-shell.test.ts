import { describe, expect, it } from "vitest";
import {
  createButton,
  createRuntime,
  createSurfaceShell,
  createTextLabel,
  createValueReadout
} from "../src/index.js";
import { findCommandByRole } from "./helpers/runtime-helpers.js";

describe("surface shell", () => {
  it("keeps header and footer fixed while sizing the scroll body to the remainder", () => {
    const runtime = createRuntime({
      root: createSurfaceShell("shell", {
        padding: 8,
        gap: 4,
        bodyPadding: 0,
        bodyGap: 4,
        scrollId: "shell-body",
        header: createTextLabel("shell-title", {
          text: "Settings"
        }),
        footer: createButton("shell-save", {
          label: "Save",
          actionId: "save"
        }),
        children: [
          createValueReadout("shell-row-a", {
            label: "A",
            value: "Ready"
          }),
          createValueReadout("shell-row-b", {
            label: "B",
            value: "Ready"
          })
        ]
      }),
      surface: { width: 200, height: 120 }
    });

    runtime.render();

    expect(runtime.getBounds("shell-title")).toMatchObject({ x: 8, y: 8, width: 184, height: 18 });
    expect(runtime.getBounds("shell-save")).toMatchObject({ x: 8, y: 76, width: 184, height: 36 });
    expect(runtime.getBounds("shell-body")).toMatchObject({ x: 8, y: 30, width: 184, height: 42 });
  });

  it("renders a visual scrollbar only when body content overflows", () => {
    const runtime = createRuntime({
      root: createSurfaceShell("overflow-shell", {
        bodyPadding: 0,
        bodyGap: 4,
        children: createRows("overflow-row", 5)
      }),
      surface: { width: 220, height: 90 }
    });

    const snapshot = runtime.render();
    const thumb = findCommandByRole(snapshot.commands, "scroll-container-scrollbar-thumb");
    if (thumb.type !== "rect") {
      throw new Error("Expected the overflow scrollbar thumb to render as a rect.");
    }
    expect(thumb.componentId).toBe("overflow-shell:scroll");
    const firstRowBounds = runtime.getBounds("overflow-row-0");
    expect(firstRowBounds).toBeDefined();
    expect((firstRowBounds?.x ?? 0) + (firstRowBounds?.width ?? 0)).toBeLessThan(thumb.rect.x);

    const fittedRuntime = createRuntime({
      root: createSurfaceShell("fitted-shell", {
        bodyPadding: 0,
        children: createRows("fitted-row", 1)
      }),
      surface: { width: 220, height: 90 }
    });
    expect(
      fittedRuntime
        .render()
        .commands.some((command) => command.role === "scroll-container-scrollbar-thumb")
    ).toBe(false);
  });

  it("can scroll to the final body item on a short surface", () => {
    const runtime = createRuntime({
      root: createSurfaceShell("short-shell", {
        bodyPadding: 0,
        bodyGap: 4,
        children: createRows("short-row", 5)
      }),
      surface: { width: 220, height: 90 }
    });

    runtime.render();
    const scroll = runtime.getServices().scroll;
    scroll.setOffset("short-shell:scroll", 0, scroll.getState("short-shell:scroll").maxOffsetY);

    const bodyBounds = runtime.getBounds("short-shell:scroll");
    const finalBounds = runtime.getBounds("short-row-4");
    expect(bodyBounds).toBeDefined();
    expect(finalBounds).toBeDefined();
    expect((finalBounds?.y ?? 0) + (finalBounds?.height ?? 0)).toBeLessThanOrEqual(
      (bodyBounds?.y ?? 0) + (bodyBounds?.height ?? 0)
    );
  });
});

function createRows(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    createValueReadout(`${prefix}-${index}`, {
      label: `Row ${index + 1}`,
      value: "Ready"
    })
  );
}
