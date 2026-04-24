import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createDockLayout,
  createHoldButton,
  createRuntime
} from "../src/index.js";
import { createButtonFixture } from "../src/examples/reference-fixtures.js";
import {
  createDirectTouchPointerSource,
  createHudHost,
  createPanelInteractor,
  createScenePanelDriver,
  createScenePanelHost,
  createScreenPointerSource
} from "../src/hosts/three.js";
import { createFakeCanvas } from "./helpers/fake-canvas.js";

describe("three interactor", () => {
  it("reports blocking claims for external screen pointers", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    const host = createScenePanelHost({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      createCanvas: createFakeCanvas
    });
    host.attach();
    host.update({ scene, camera });

    const interactor = createPanelInteractor({
      runtime,
      mesh: host.mesh,
      getSurfaceMetrics: () => host.getSurfaceMetrics(),
      pointerClaimPolicy: "block-on-hit"
    });

    const moveResult = interactor.process(
      {
        pointerId: "pointer-1",
        pointerType: "mouse",
        transport: "screen",
        phase: "move",
        timestamp: 1,
        ndcX: 0,
        ndcY: 0
      },
      { scene, camera }
    );

    expect(moveResult.claimed).toBe(true);
    expect(moveResult.blocked).toBe(true);
    expect(moveResult.hit).toMatchObject({
      source: "screen"
    });

    const downResult = interactor.process(
      {
        pointerId: "pointer-1",
        pointerType: "mouse",
        transport: "screen",
        phase: "down",
        timestamp: 2,
        ndcX: 0,
        ndcY: 0
      },
      { scene, camera }
    );
    interactor.process(
      {
        pointerId: "pointer-1",
        pointerType: "mouse",
        transport: "screen",
        phase: "up",
        timestamp: 3,
        ndcX: 0,
        ndcY: 0
      },
      { scene, camera }
    );

    expect(downResult.dispatched).toBe(true);
    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "fixture.confirm",
      componentId: "fixture-button"
    });

    host.detach();
  });

  it("supports passthrough policy and direct touch contact", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    const scene = new THREE.Scene();
    const host = createScenePanelHost({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      createCanvas: createFakeCanvas
    });
    host.attach();
    host.update({ scene });

    const interactor = createPanelInteractor({
      runtime,
      mesh: host.mesh,
      getSurfaceMetrics: () => host.getSurfaceMetrics(),
      pointerClaimPolicy: "passthrough"
    });

    const worldCenter = host.mesh.getWorldPosition(new THREE.Vector3());
    const downResult = interactor.process(
      {
        pointerId: "contact-1",
        pointerType: "touch",
        transport: "contact",
        phase: "down",
        timestamp: 1,
        contactPoint: { x: worldCenter.x, y: worldCenter.y, z: worldCenter.z }
      },
      { scene }
    );
    interactor.process(
      {
        pointerId: "contact-1",
        pointerType: "touch",
        transport: "contact",
        phase: "up",
        timestamp: 2,
        contactPoint: { x: worldCenter.x, y: worldCenter.y, z: worldCenter.z }
      },
      { scene }
    );

    expect(downResult.blocked).toBe(false);
    expect(downResult.claimed).toBe(true);
    expect(downResult.hit).toMatchObject({
      source: "contact"
    });
    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "fixture.confirm",
      componentId: "fixture-button"
    });

    host.detach();
  });

  it("rejects direct touch points that are off the panel plane or tangential to it", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    const scene = new THREE.Scene();
    const host = createScenePanelHost({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      createCanvas: createFakeCanvas
    });
    host.attach();
    host.update({ scene });

    const interactor = createPanelInteractor({
      runtime,
      mesh: host.mesh,
      getSurfaceMetrics: () => host.getSurfaceMetrics()
    });

    const worldCenter = host.mesh.getWorldPosition(new THREE.Vector3());
    const offPlaneResult = interactor.process(
      {
        pointerId: "contact-off-plane",
        pointerType: "touch",
        transport: "contact",
        phase: "down",
        timestamp: 1,
        contactPoint: { x: worldCenter.x, y: worldCenter.y, z: worldCenter.z + 0.05 }
      },
      { scene }
    );
    const tangentialNormalResult = interactor.process(
      {
        pointerId: "contact-tangent",
        pointerType: "touch",
        transport: "contact",
        phase: "down",
        timestamp: 2,
        contactPoint: { x: worldCenter.x, y: worldCenter.y, z: worldCenter.z },
        contactNormal: { x: 1, y: 0, z: 0 }
      },
      { scene }
    );

    expect(offPlaneResult.hit).toBeNull();
    expect(offPlaneResult.dispatched).toBe(false);
    expect(tangentialNormalResult.hit).toBeNull();
    expect(tangentialNormalResult.dispatched).toBe(false);

    host.detach();
  });

  it("lets empty viewport-sized HUD space pass through", () => {
    const runtime = createRuntime({
      root: createDockLayout("hud-root", {
        topLeft: {
          maxWidth: 180,
          child: createButtonFixture()
        }
      }),
      surface: { width: 800, height: 600 }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    scene.add(camera);

    const host = createHudHost({
      runtime,
      surface: { width: 800, height: 600 },
      distance: 0.75,
      sizing: "viewport",
      createCanvas: createFakeCanvas
    });
    host.attach();
    host.update({
      scene,
      camera,
      surfaceMetrics: { width: 800, height: 600, pixelDensity: 1 }
    });

    const interactor = createPanelInteractor({
      runtime,
      mesh: host.mesh,
      getSurfaceMetrics: () => host.getSurfaceMetrics(),
      pointerClaimPolicy: "block-on-hit"
    });

    const result = interactor.process(
      {
        pointerId: "pointer-empty",
        pointerType: "mouse",
        transport: "screen",
        phase: "move",
        timestamp: 1,
        ndcX: 0,
        ndcY: 0
      },
      { scene, camera, surfaceMetrics: { width: 800, height: 600, pixelDensity: 1 } }
    );

    expect(result.claimed).toBe(false);
    expect(result.blocked).toBe(false);
    expect(result.hit).toBeNull();

    host.detach();
  });

  it("can make empty viewport-sized HUD space pointer opaque", () => {
    const runtime = createRuntime({
      root: createDockLayout("hud-root", {
        pointerOpaque: true,
        topLeft: {
          maxWidth: 180,
          child: createButtonFixture()
        }
      }),
      surface: { width: 800, height: 600 }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    scene.add(camera);

    const host = createHudHost({
      runtime,
      surface: { width: 800, height: 600 },
      distance: 0.75,
      sizing: "viewport",
      createCanvas: createFakeCanvas
    });
    host.attach();
    host.update({
      scene,
      camera,
      surfaceMetrics: { width: 800, height: 600, pixelDensity: 1 }
    });

    const interactor = createPanelInteractor({
      runtime,
      mesh: host.mesh,
      getSurfaceMetrics: () => host.getSurfaceMetrics(),
      pointerClaimPolicy: "block-on-hit"
    });

    const result = interactor.process(
      {
        pointerId: "pointer-opaque",
        pointerType: "mouse",
        transport: "screen",
        phase: "move",
        timestamp: 1,
        ndcX: 0,
        ndcY: 0
      },
      { scene, camera, surfaceMetrics: { width: 800, height: 600, pixelDensity: 1 } }
    );

    expect(result.claimed).toBe(true);
    expect(result.blocked).toBe(true);
    expect(result.hit).toMatchObject({
      componentId: "hud-root",
      targetId: "hud-root:surface",
      source: "screen"
    });

    host.detach();
  });

  it("keeps a successful HUD press captured until release or clear", () => {
    const runtime = createRuntime({
      root: createDockLayout("hud-root", {
        topLeft: {
          maxWidth: 180,
          child: createHoldButton("hold-test", {
            label: "Forward",
            actionId: "movement.set",
            startPayload: { intent: "forward", active: true },
            stopPayload: { intent: "forward", active: false }
          })
        }
      }),
      surface: { width: 800, height: 600 }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    scene.add(camera);

    const host = createHudHost({
      runtime,
      surface: { width: 800, height: 600 },
      distance: 0.75,
      sizing: "viewport",
      createCanvas: createFakeCanvas
    });
    host.attach();
    host.update({
      scene,
      camera,
      surfaceMetrics: { width: 800, height: 600, pixelDensity: 1 }
    });

    const interactor = createPanelInteractor({
      runtime,
      mesh: host.mesh,
      getSurfaceMetrics: () => host.getSurfaceMetrics(),
      pointerClaimPolicy: "block-on-hit"
    });

    runtime.render();
    const holdBounds = runtime.getBounds("hold-test");
    if (!holdBounds) {
      throw new Error("Expected hold button bounds.");
    }

    const downResult = interactor.process(
      {
        pointerId: "pointer-captured",
        pointerType: "mouse",
        transport: "screen",
        phase: "down",
        timestamp: 1,
        ...toNdcSample(holdBounds.x + holdBounds.width / 2, holdBounds.y + holdBounds.height / 2, 800, 600)
      },
      { scene, camera, surfaceMetrics: { width: 800, height: 600, pixelDensity: 1 } }
    );
    expect(downResult.claimed).toBe(true);
    expect(downResult.blocked).toBe(true);
    expect(downResult.hit).toMatchObject({
      componentId: "hold-test",
      targetId: "hold-test:face"
    });
    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "movement.set",
      componentId: "hold-test",
      payload: { intent: "forward", active: true }
    });

    const moveResult = interactor.process(
      {
        pointerId: "pointer-captured",
        pointerType: "mouse",
        transport: "screen",
        phase: "move",
        timestamp: 2,
        ndcX: 0,
        ndcY: 0
      },
      { scene, camera, surfaceMetrics: { width: 800, height: 600, pixelDensity: 1 } }
    );
    expect(moveResult.claimed).toBe(true);
    expect(moveResult.blocked).toBe(true);

    interactor.clear("pointer-captured");
    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "movement.set",
      componentId: "hold-test",
      payload: { intent: "forward", active: false }
    });

    host.detach();
  });

  it("drives panel interaction from pointer sources and exposes state", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    let emitted = false;
    const screenSource = createScreenPointerSource(() =>
      emitted
        ? []
        : [
            {
              pointerId: "screen-pointer",
              pointerType: "mouse",
              phase: "down",
              timestamp: 1,
              ndcX: 0,
              ndcY: 0
            },
            {
              pointerId: "screen-pointer",
              pointerType: "mouse",
              phase: "up",
              timestamp: 2,
              ndcX: 0,
              ndcY: 0
            }
          ]
    );
    const contactSource = createDirectTouchPointerSource(() => []);

    const driver = createScenePanelDriver({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      createCanvas: createFakeCanvas,
      pointerSources: [screenSource, contactSource]
    });

    driver.attach();
    driver.update({ scene, camera });
    emitted = true;

    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "fixture.confirm",
      componentId: "fixture-button"
    });
    expect(driver.getPointerState("screen-pointer")).toBeUndefined();

    driver.detach();
  });

  it("cancels runtime state when clearing or detaching an external pointer", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    let stage = 0;
    const screenSource = createScreenPointerSource(() => {
      if (stage === 0) {
        return [
          {
            pointerId: "screen-pointer",
            pointerType: "mouse",
            phase: "down",
            timestamp: 1,
            ndcX: 0,
            ndcY: 0
          }
        ];
      }

      if (stage === 1) {
        return [
          {
            pointerId: "screen-pointer",
            pointerType: "mouse",
            phase: "down",
            timestamp: 2,
            ndcX: 0,
            ndcY: 0
          }
        ];
      }

      return [];
    });

    const driver = createScenePanelDriver({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      createCanvas: createFakeCanvas,
      pointerSources: [screenSource]
    });

    driver.attach();
    driver.update({ scene, camera });
    stage = 1;

    expect(runtime.getInteraction().pressedTargetId).toBe("fixture-button:face");

    driver.clearPointer("screen-pointer");
    expect(runtime.getInteraction().pressedTargetId).toBeUndefined();

    driver.update({ scene, camera });
    expect(runtime.getInteraction().pressedTargetId).toBe("fixture-button:face");

    stage = 2;
    driver.detach();
    expect(runtime.getInteraction().pressedTargetId).toBeUndefined();
  });

  it("rejects frames that mix host events and pointer sources", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    const screenSource = createScreenPointerSource(() => []);
    const driver = createScenePanelDriver({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      createCanvas: createFakeCanvas,
      pointerSources: [screenSource]
    });

    driver.attach();

    expect(() =>
      driver.update({
        scene,
        camera,
        events: [
          {
            source: "screen",
            type: "pointer-down",
            ndcX: 0,
            ndcY: 0,
            timestamp: 1
          }
        ]
      })
    ).toThrow(/either frame\.events or pointerSources/i);

    driver.detach();
  });
});

function toNdcSample(
  surfaceX: number,
  surfaceY: number,
  width: number,
  height: number
): { ndcX: number; ndcY: number } {
  return {
    ndcX: (surfaceX / width) * 2 - 1,
    ndcY: -((surfaceY / height) * 2 - 1)
  };
}
