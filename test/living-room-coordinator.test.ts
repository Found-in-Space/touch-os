import { describe, expect, it } from "vitest";
import {
  routePointerSample,
  type CoordinatedPanel
} from "../examples/three-living-room/src/coordinator.js";

describe("living room panel coordinator", () => {
  it("gives priority to the higher-ranked panel and clears lower pointers", () => {
    const calls: string[] = [];
    const panels: CoordinatedPanel<{ pointerId: string }, undefined>[] = [
      {
        key: "hud",
        enabled: true,
        process() {
          calls.push("hud:process");
          return { claimed: true, blocked: true };
        },
        clearPointer(pointerId) {
          calls.push(`hud:clear:${pointerId}`);
        }
      },
      {
        key: "tv",
        enabled: true,
        process() {
          calls.push("tv:process");
          return { claimed: false, blocked: false };
        },
        clearPointer(pointerId) {
          calls.push(`tv:clear:${pointerId}`);
        }
      }
    ];

    const result = routePointerSample(panels, { pointerId: "pointer-1" }, undefined);

    expect(result).toEqual({
      ownerKey: "hud",
      blocked: true
    });
    expect(calls).toEqual(["hud:process", "tv:clear:pointer-1"]);
  });

  it("falls through to the next panel when the higher panel misses", () => {
    const calls: string[] = [];
    const panels: CoordinatedPanel<{ pointerId: string }, undefined>[] = [
      {
        key: "hud",
        enabled: true,
        process() {
          calls.push("hud:process");
          return { claimed: false, blocked: false };
        },
        clearPointer(pointerId) {
          calls.push(`hud:clear:${pointerId}`);
        }
      },
      {
        key: "tv",
        enabled: true,
        process() {
          calls.push("tv:process");
          return { claimed: true, blocked: true };
        },
        clearPointer(pointerId) {
          calls.push(`tv:clear:${pointerId}`);
        }
      }
    ];

    const result = routePointerSample(panels, { pointerId: "pointer-2" }, undefined);

    expect(result).toEqual({
      ownerKey: "tv",
      blocked: true
    });
    expect(calls).toEqual(["hud:process", "tv:process"]);
  });

  it("lets an empty overlay HUD miss fall through to the wall panel in the same frame", () => {
    const calls: string[] = [];
    const panels: CoordinatedPanel<{ pointerId: string }, undefined>[] = [
      {
        key: "hud",
        enabled: true,
        process() {
          calls.push("hud:empty");
          return { claimed: false, blocked: false };
        },
        clearPointer(pointerId) {
          calls.push(`hud:clear:${pointerId}`);
        }
      },
      {
        key: "tv",
        enabled: true,
        process() {
          calls.push("tv:hit");
          return { claimed: true, blocked: true };
        },
        clearPointer(pointerId) {
          calls.push(`tv:clear:${pointerId}`);
        }
      }
    ];

    const result = routePointerSample(panels, { pointerId: "overlay-miss" }, undefined);

    expect(result).toEqual({
      ownerKey: "tv",
      blocked: true
    });
    expect(calls).toEqual(["hud:empty", "tv:hit"]);
  });
});
