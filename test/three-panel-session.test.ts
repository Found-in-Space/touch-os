import { describe, expect, it, vi } from "vitest";
import type { RuntimeOutput } from "../src/core/actions.js";
import type { RenderSnapshot } from "../src/core/draw.js";
import type { DisplayRuntime } from "../src/core/runtime.js";
import { createPanelCoordinator } from "../src/coordination/index.js";
import {
  createThreePanelSession,
  type PanelInteractionResult,
  type PointerPresentationState,
  type ThreePanelDriver,
  type ThreePanelHostFrame,
  type ThreePointerSample
} from "../src/hosts/three.js";

describe("Three panel session lifecycle", () => {
  it("coordinates disabled, enabled, hidden, and disposed driver states", () => {
    const harness = createSessionHarness(false);
    const { driverCalls, mesh, outputs, pointerState, runtimeCalls, session, snapshot } = harness;

    expect(session.key).toBe("panel");
    expect(session.enabled).toBe(false);
    expect(session.runtime).toBe(harness.runtime);
    expect(session.driver).toBe(harness.driver);

    session.enabled = false;
    expect(driverCalls.clearPointer).not.toHaveBeenCalled();

    session.attach();
    session.attach();
    expect(driverCalls.attach).toHaveBeenCalledTimes(1);

    outputs.push(actionOutput("disabled-update"));
    session.update(frame(5));
    expect(driverCalls.update).not.toHaveBeenCalled();
    expect(driverCalls.clearPointer).toHaveBeenLastCalledWith(undefined, 5);
    expect(runtimeCalls.tick).toHaveBeenCalledWith(5);
    expect(mesh.visible).toBe(false);
    expect(harness.handledOutputs).toEqual([actionOutput("disabled-update")]);

    outputs.push(actionOutput("disabled-process"));
    expect(session.process(sample(7), frame(6))).toEqual({ claimed: false, blocked: false });
    expect(driverCalls.processPointer).not.toHaveBeenCalled();
    expect(driverCalls.clearPointer).toHaveBeenLastCalledWith("pointer", 6);

    session.clearPointer("pointer");
    expect(driverCalls.clearPointer).toHaveBeenLastCalledWith("pointer", 7);
    expect(session.getPointerState("pointer")).toBe(pointerState);

    session.enabled = true;
    mesh.visible = true;
    outputs.push(actionOutput("enabled-process"));
    expect(session.process(sample(8), frame(8))).toEqual({ claimed: true, blocked: false });
    expect(driverCalls.processPointer).toHaveBeenCalledTimes(1);
    expect(session.render()).toBe(snapshot);

    session.hide();
    expect(driverCalls.clearPointer).toHaveBeenLastCalledWith(undefined, 8);
    expect(mesh.visible).toBe(false);
    expect(session.enabled).toBe(false);

    const clearsBeforeDispose = driverCalls.clearPointer.mock.calls.length;
    session.dispose();
    session.dispose();
    session.hide();
    session.enabled = true;
    expect(driverCalls.dispose).toHaveBeenCalledTimes(1);
    expect(session.enabled).toBe(false);
    expect(driverCalls.clearPointer).toHaveBeenCalledTimes(clearsBeforeDispose);

    expect(() => session.attach()).toThrow(/attach a disposed/i);
    expect(() => session.update(frame(9))).toThrow(/update a disposed/i);
    expect(() => session.render()).toThrow(/render a disposed/i);
    expect(() => session.process(sample(9), frame(9))).toThrow(/process input through a disposed/i);
  });

  it("rejects detached, non-finite, and decreasing frame timestamps", () => {
    const detached = createSessionHarness();
    expect(() => detached.session.update(frame(1))).toThrow(/detached/i);

    const timed = createSessionHarness();
    timed.session.attach();
    expect(() => timed.session.update(frame(Number.POSITIVE_INFINITY))).toThrow(/finite monotonic/i);
    expect(() => timed.session.update(frame(-1))).toThrow(/monotonic/i);
    timed.session.update(frame(0));
    timed.session.update(frame(0));
    expect(timed.driverCalls.update).toHaveBeenCalledTimes(2);
  });

  it("becomes unavailable to its coordinator before disposal outputs are delivered", () => {
    let ownerDuringOutput: string | undefined = "not-observed";
    let coordinator: ReturnType<typeof createPanelCoordinator<
      ThreePointerSample,
      ThreePanelHostFrame
    >>;
    const harness = createSessionHarness(true, () => {
      ownerDuringOutput = coordinator.getOwner("pointer");
    });
    coordinator = createPanelCoordinator({ panels: [harness.session] });
    harness.session.attach();
    coordinator.route({ ...sample(1), phase: "down" }, frame(1));
    expect(coordinator.getOwner("pointer")).toBe("panel");
    harness.outputs.push(actionOutput("stop"));

    harness.session.dispose();

    expect(ownerDuringOutput).toBeUndefined();
    expect(coordinator.getOwner("pointer")).toBeUndefined();
    expect(harness.session.enabled).toBe(false);
  });
});

function createSessionHarness(
  initialEnabled?: boolean,
  onOutput?: () => void
) {
  const outputs: RuntimeOutput[] = [];
  const handledOutputs: RuntimeOutput[] = [];
  const mesh = { visible: true };
  const snapshot: RenderSnapshot = {
    revision: 1,
    sharedSurfaceRevision: 0,
    commands: []
  };
  const pointerState: PointerPresentationState = {
    pointerId: "pointer",
    claimed: true,
    blocked: false,
    hit: null,
    active: true
  };
  const runtimeCalls = {
    tick: vi.fn((_timestamp: number): void => {}),
    takeOutputs: vi.fn((): readonly RuntimeOutput[] => outputs.splice(0))
  };
  const runtime = runtimeCalls as unknown as DisplayRuntime;
  const driverCalls = {
    host: { mesh },
    attach: vi.fn((): void => {}),
    update: vi.fn((_frame: ThreePanelHostFrame): void => {}),
    detach: vi.fn((): void => {}),
    dispose: vi.fn((): void => {}),
    render: vi.fn((): RenderSnapshot => snapshot),
    processPointer: vi.fn(
      (_sample: ThreePointerSample, _frame: ThreePanelHostFrame): PanelInteractionResult => ({
        hit: null,
        claimed: true,
        blocked: false,
        dispatched: true
      })
    ),
    getHit: vi.fn(() => null),
    getCompositeSurfaces: vi.fn(() => []),
    getPointerState: vi.fn((_pointerId: string): PointerPresentationState => pointerState),
    clearPointer: vi.fn((_pointerId?: string, _timestamp?: number): void => {})
  };
  const driver = driverCalls as unknown as ThreePanelDriver;
  const session = createThreePanelSession({
    key: "panel",
    runtime,
    driver,
    ...(initialEnabled === undefined ? {} : { enabled: initialEnabled }),
    outputHandler(output) {
      handledOutputs.push(output);
      onOutput?.();
    }
  });

  return {
    driver,
    driverCalls,
    handledOutputs,
    mesh,
    outputs,
    pointerState,
    runtime,
    runtimeCalls,
    session,
    snapshot
  };
}

function actionOutput(actionId: string): RuntimeOutput {
  return { type: "action", actionId, componentId: "probe" };
}

function frame(timestamp: number): ThreePanelHostFrame {
  return { timestamp };
}

function sample(timestamp: number): ThreePointerSample {
  return {
    pointerId: "pointer",
    pointerType: "touch",
    transport: "surface",
    phase: "move",
    timestamp,
    surfaceX: 10,
    surfaceY: 10
  };
}
