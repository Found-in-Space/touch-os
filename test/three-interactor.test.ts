import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/index.js";
import { createButtonFixture } from "../src/examples/reference-fixtures.js";
import {
  createDirectTouchPointerSource,
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
});
