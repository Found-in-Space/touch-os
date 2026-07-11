import { describe, expect, it } from "vitest";
import {
  createPanelCoordinator,
  routePointerSample,
  type CoordinatedPanel,
  type CoordinatedPanelResult,
  type PointerRoutingPhase,
  type PointerSampleLike
} from "../src/coordination/index.js";

interface TestSample extends PointerSampleLike {
  phase?: PointerRoutingPhase;
}

describe("panel coordinator", () => {
  it("gives priority to the higher-ranked panel and clears lower pointers", () => {
    const calls: string[] = [];
    const panels = [
      createTestPanel("hud", calls, () => ({ claimed: true, blocked: true })),
      createTestPanel("tv", calls, () => ({ claimed: false, blocked: false }))
    ];

    const result = routePointerSample(panels, { pointerId: "pointer-1" }, undefined);

    expect(result).toEqual({
      panelKey: "hud",
      ownerKey: undefined,
      claimed: true,
      blocked: true
    });
    expect(calls).toEqual(["hud:process:pointer-1:none", "tv:clear:pointer-1"]);
  });

  it("falls through to the next panel when the higher panel misses", () => {
    const calls: string[] = [];
    const panels = [
      createTestPanel("hud", calls, () => ({ claimed: false, blocked: false })),
      createTestPanel("tv", calls, () => ({ claimed: true, blocked: true }))
    ];

    const result = routePointerSample(panels, { pointerId: "pointer-2" }, undefined);

    expect(result).toEqual({
      panelKey: "tv",
      ownerKey: undefined,
      claimed: true,
      blocked: true
    });
    expect(calls).toEqual(["hud:process:pointer-2:none", "tv:process:pointer-2:none"]);
  });

  it("lets an empty overlay HUD miss fall through to the wall panel in the same frame", () => {
    const calls: string[] = [];
    const panels = [
      createTestPanel("hud", calls, () => ({ claimed: false, blocked: false })),
      createTestPanel("tv", calls, () => ({ claimed: true, blocked: true }))
    ];

    const result = routePointerSample(panels, { pointerId: "overlay-miss" }, undefined);

    expect(result).toEqual({
      panelKey: "tv",
      ownerKey: undefined,
      claimed: true,
      blocked: true
    });
    expect(calls).toEqual(["hud:process:overlay-miss:none", "tv:process:overlay-miss:none"]);
  });

  it("retains pointer ownership until release even if a higher panel would claim a later sample", () => {
    const calls: string[] = [];
    const panels = [
      createTestPanel("hud", calls, (sample) =>
        sample.phase === "move" ? { claimed: true, blocked: true } : { claimed: false, blocked: false }
      ),
      createTestPanel("tv", calls, (sample) =>
        sample.phase === "down" ? { claimed: true, blocked: true } : { claimed: false, blocked: false }
      )
    ];
    const coordinator = createPanelCoordinator({ panels });

    coordinator.route({ pointerId: "pointer-3", phase: "down" }, undefined);
    expect(coordinator.getOwner("pointer-3")).toBe("tv");

    const moveResult = coordinator.route({ pointerId: "pointer-3", phase: "move" }, undefined);

    expect(moveResult).toEqual({
      panelKey: "tv",
      ownerKey: "tv",
      claimed: false,
      blocked: false
    });
    expect(coordinator.getOwner("pointer-3")).toBe("tv");
    expect(calls).toEqual([
      "hud:process:pointer-3:down",
      "tv:process:pointer-3:down",
      "hud:clear:pointer-3",
      "tv:process:pointer-3:move"
    ]);
  });

  it("clears ownership on pointer-up and routes later samples normally", () => {
    const calls: string[] = [];
    const panels = [
      createTestPanel("hud", calls, (sample) =>
        sample.phase === "down" ? { claimed: true, blocked: true } : { claimed: false, blocked: false }
      ),
      createTestPanel("tv", calls, () => ({ claimed: true, blocked: true }))
    ];
    const coordinator = createPanelCoordinator({ panels });

    coordinator.route({ pointerId: "pointer-4", phase: "down" }, undefined);
    const upResult = coordinator.route({ pointerId: "pointer-4", type: "pointer-up" }, undefined);

    expect(upResult).toEqual({
      panelKey: "hud",
      ownerKey: undefined,
      claimed: false,
      blocked: false
    });
    expect(coordinator.getOwner("pointer-4")).toBeUndefined();

    const nextResult = coordinator.route({ pointerId: "pointer-4", phase: "move" }, undefined);
    expect(nextResult).toMatchObject({ panelKey: "tv", ownerKey: undefined });
    expect(coordinator.getOwner("pointer-4")).toBeUndefined();
  });

  it("clears a disabled owner and lets an enabled lower-priority panel claim the sample", () => {
    const calls: string[] = [];
    const hud = createTestPanel("hud", calls, () => ({ claimed: true, blocked: true }));
    const panels = [
      hud,
      createTestPanel("tv", calls, () => ({ claimed: true, blocked: true }))
    ];
    const coordinator = createPanelCoordinator({ panels });

    coordinator.route({ pointerId: "pointer-5", phase: "down" }, undefined);
    hud.enabled = false;
    const result = coordinator.route({ pointerId: "pointer-5", phase: "move" }, undefined);

    expect(result).toEqual({
      panelKey: "tv",
      ownerKey: undefined,
      claimed: true,
      blocked: true
    });
    expect(coordinator.getOwner("pointer-5")).toBeUndefined();
    expect(calls).toEqual([
      "hud:process:pointer-5:down",
      "tv:clear:pointer-5",
      "hud:clear:pointer-5",
      "tv:process:pointer-5:move"
    ]);
  });

  it("tracks ownership per pointer id", () => {
    const calls: string[] = [];
    const panels = [
      createTestPanel("hud", calls, (sample) =>
        sample.pointerId === "left" ? { claimed: true, blocked: true } : { claimed: false, blocked: false }
      ),
      createTestPanel("tv", calls, () => ({ claimed: true, blocked: true }))
    ];
    const coordinator = createPanelCoordinator({ panels });

    coordinator.route({ pointerId: "left", phase: "down" }, undefined);
    coordinator.route({ pointerId: "right", phase: "down" }, undefined);

    expect(coordinator.getOwner("left")).toBe("hud");
    expect(coordinator.getOwner("right")).toBe("tv");

    coordinator.route({ pointerId: "left", phase: "cancel" }, undefined);
    expect(coordinator.getOwner("left")).toBeUndefined();
    expect(coordinator.getOwner("right")).toBe("tv");
  });

  it("routes hover and scroll without retaining ownership", () => {
    const calls: string[] = [];
    const panels = [
      createTestPanel("overlay", calls, (sample) =>
        sample.phase === "move"
          ? { claimed: false, blocked: false }
          : { claimed: false, blocked: true }
      ),
      createTestPanel("surface", calls, () => ({ claimed: true, blocked: true }))
    ];
    const coordinator = createPanelCoordinator({ panels });

    expect(coordinator.route({ pointerId: "hover", phase: "move" }, undefined)).toEqual({
      panelKey: "surface",
      ownerKey: undefined,
      claimed: true,
      blocked: true
    });
    expect(coordinator.route({ pointerId: "scroll", phase: "scroll" }, undefined)).toEqual({
      panelKey: "overlay",
      ownerKey: undefined,
      claimed: false,
      blocked: true
    });
    expect(coordinator.getOwner("hover")).toBeUndefined();
    expect(coordinator.getOwner("scroll")).toBeUndefined();
  });

  it("does not retain ownership when a down sample is blocked but not claimed", () => {
    const calls: string[] = [];
    const coordinator = createPanelCoordinator({
      panels: [createTestPanel("modal", calls, () => ({ claimed: false, blocked: true }))]
    });

    expect(coordinator.route({ pointerId: "blocked", phase: "down" }, undefined)).toEqual({
      panelKey: "modal",
      ownerKey: undefined,
      claimed: false,
      blocked: true
    });
    expect(coordinator.getOwner("blocked")).toBeUndefined();
  });

  it("releases press ownership on cancel", () => {
    const calls: string[] = [];
    const coordinator = createPanelCoordinator({
      panels: [createTestPanel("panel", calls, () => ({ claimed: true, blocked: true }))]
    });

    coordinator.route({ pointerId: "cancelled", phase: "down" }, undefined);
    const result = coordinator.route({ pointerId: "cancelled", phase: "cancel" }, undefined);

    expect(result).toEqual({
      panelKey: "panel",
      ownerKey: undefined,
      claimed: true,
      blocked: true
    });
    expect(coordinator.getOwner("cancelled")).toBeUndefined();
  });

  it("clears ownership when an owner is disabled or removed", () => {
    const calls: string[] = [];
    const owner = createTestPanel("owner", calls, () => ({ claimed: true, blocked: true }));
    const fallback = createTestPanel("fallback", calls, () => ({ claimed: true, blocked: true }));
    const panels = [owner, fallback];
    const coordinator = createPanelCoordinator({ panels });

    coordinator.route({ pointerId: "disabled", phase: "down" }, undefined);
    owner.enabled = false;
    expect(coordinator.getOwner("disabled")).toBeUndefined();

    owner.enabled = true;
    coordinator.route({ pointerId: "removed", phase: "down" }, undefined);
    panels.shift();
    const result = coordinator.route({ pointerId: "removed", phase: "move" }, undefined);

    expect(result).toEqual({
      panelKey: "fallback",
      ownerKey: undefined,
      claimed: true,
      blocked: true
    });
    expect(calls.filter((call) => call === "owner:clear:removed")).toHaveLength(1);
  });

  it("supports explicit pointer and all-pointer clears", () => {
    const calls: string[] = [];
    const panel = createTestPanel("panel", calls, () => ({ claimed: true, blocked: true }));
    const coordinator = createPanelCoordinator({ panels: [panel] });

    coordinator.route({ pointerId: "first", phase: "down" }, undefined);
    coordinator.route({ pointerId: "second", phase: "down" }, undefined);
    coordinator.clearPointer("first");

    expect(coordinator.getOwner("first")).toBeUndefined();
    expect(coordinator.getOwner("second")).toBe("panel");

    coordinator.clearAllPointers();
    expect(coordinator.getOwner("second")).toBeUndefined();
    expect(calls).toContain("panel:clear:first");
    expect(calls).toContain("panel:clear:second");
  });

  it.each([
    ["pointer-move", undefined],
    ["pointer-down", "panel"],
    ["pointer-up", undefined],
    ["cancel", undefined],
    ["scroll", undefined]
  ] as const)("maps normalized %s event types to routing phases", (type, ownerKey) => {
    const calls: string[] = [];
    const panel = createTestPanel("panel", calls, () => ({ claimed: true, blocked: true }));

    expect(routePointerSample([panel], { pointerId: type, type }, undefined)).toMatchObject({
      panelKey: "panel",
      ownerKey
    });
  });

  it("returns an empty result when release has no eligible panel", () => {
    expect(routePointerSample([], {
      pointerId: "orphan-release",
      type: "pointer-up"
    }, undefined)).toEqual({
      panelKey: undefined,
      ownerKey: undefined,
      claimed: false,
      blocked: false
    });
  });
});

function createTestPanel(
  key: string,
  calls: string[],
  process: (sample: TestSample) => CoordinatedPanelResult
): CoordinatedPanel<TestSample, undefined> {
  return {
    key,
    enabled: true,
    process(sample) {
      calls.push(`${key}:process:${sample.pointerId}:${sample.phase ?? "none"}`);
      return process(sample);
    },
    clearPointer(pointerId) {
      calls.push(`${key}:clear:${pointerId}`);
    }
  };
}
