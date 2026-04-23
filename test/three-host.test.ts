import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createEmbeddedSurface,
  createEmbeddedSurfaceService,
  createRuntime
} from "../src/index.js";
import { createButtonFixture } from "../src/examples/reference-fixtures.js";
import {
  createHudHost,
  createScenePanelHost,
  createXrTabletHost
} from "../src/hosts/three.js";
import { createFakeCanvas } from "./helpers/fake-canvas.js";

describe("three host adapters", () => {
  it("converts scene-mounted screen interaction into display-space input and reports blocking", () => {
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
    host.update({
      scene,
      camera,
      events: [
        {
          source: "screen",
          type: "pointer-down",
          ndcX: 0,
          ndcY: 0,
          timestamp: 1
        },
        {
          source: "screen",
          type: "pointer-up",
          ndcX: 0,
          ndcY: 0,
          timestamp: 2
        }
      ]
    });

    expect(host.mesh.parent).toBe(scene);
    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "fixture.confirm",
      componentId: "fixture-button"
    });
    expect(host.getHit()).toMatchObject({
      blocked: true,
      componentId: "fixture-button",
      targetId: "fixture-button:face",
      source: "screen"
    });
    expect(host.getHit()?.surfaceX).toBeCloseTo(80, 0);
    expect(host.getHit()?.surfaceY).toBeCloseTo(50, 0);

    host.detach();
  });

  it("applies tracked XR placement while reusing the shared ray-input host path", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    const scene = new THREE.Scene();
    const pose = {
      position: { x: 0.25, y: 1.2, z: -0.5 },
      orientation: { x: 0, y: 0, z: 0, w: 1 }
    };

    const host = createXrTabletHost({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      tiltRadians: 0,
      offset: { x: 0, y: 0, z: 0 },
      createCanvas: createFakeCanvas
    });

    host.attach();
    host.update({
      scene,
      xrPose: pose,
      events: [
        {
          source: "ray",
          type: "pointer-down",
          origin: { x: 0.25, y: 1.2, z: 0.5 },
          direction: { x: 0, y: 0, z: -1 },
          timestamp: 1
        },
        {
          source: "ray",
          type: "pointer-up",
          origin: { x: 0.25, y: 1.2, z: 0.5 },
          direction: { x: 0, y: 0, z: -1 },
          timestamp: 2
        }
      ]
    });

    expect(host.mesh.visible).toBe(true);
    expect(host.mesh.position.x).toBeCloseTo(0.25);
    expect(host.mesh.position.y).toBeCloseTo(1.2);
    expect(host.mesh.position.z).toBeCloseTo(-0.5);
    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "fixture.confirm",
      componentId: "fixture-button"
    });
    expect(host.getHit()).toMatchObject({
      blocked: true,
      source: "ray"
    });

    host.detach();
  });

  it("keeps HUD panels camera-locked while remaining interactive", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 10);
    scene.add(camera);

    const host = createHudHost({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      distance: 0.75,
      offset: { x: 0.1, y: -0.05 },
      createCanvas: createFakeCanvas
    });

    host.attach();
    host.update({
      scene,
      camera,
      events: [
        {
          source: "screen",
          type: "pointer-down",
          ndcX: 0,
          ndcY: 0,
          timestamp: 1
        },
        {
          source: "screen",
          type: "pointer-up",
          ndcX: 0,
          ndcY: 0,
          timestamp: 2
        }
      ]
    });

    expect(host.mesh.parent).toBe(scene);
    expect(host.mesh.position.x).toBeCloseTo(0.1);
    expect(host.mesh.position.y).toBeCloseTo(-0.05);
    expect(host.mesh.position.z).toBeCloseTo(-0.75);
    expect(runtime.takeOutputs()).toContainEqual({
      type: "action",
      actionId: "fixture.confirm",
      componentId: "fixture-button"
    });
    expect(host.getHit()).toMatchObject({
      blocked: true,
      source: "screen"
    });

    host.detach();
  });

  it("supports viewport-sized HUD overlays that track active surface metrics", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 10);
    camera.updateProjectionMatrix();
    scene.add(camera);

    const host = createHudHost({
      runtime,
      surface: { width: 160, height: 100 },
      distance: 0.75,
      sizing: "viewport",
      createCanvas: createFakeCanvas
    });

    host.attach();
    host.update({
      scene,
      camera,
      surfaceMetrics: {
        width: 640,
        height: 360,
        pixelDensity: 2
      }
    });

    const expectedHeight = 2 * Math.tan((THREE.MathUtils.degToRad(50) / 2)) * 0.75;
    const expectedWidth = expectedHeight * (640 / 360);

    expect(host.mesh.parent).toBe(scene);
    expect(host.mesh.scale.x).toBeCloseTo(expectedWidth, 5);
    expect(host.mesh.scale.y).toBeCloseTo(expectedHeight, 5);
    expect(host.getSurfaceMetrics()).toMatchObject({
      width: 640,
      height: 360,
      pixelDensity: 2
    });
    expect(host.canvas.width).toBe(1280);
    expect(host.canvas.height).toBe(720);

    host.detach();
  });

  it("anchors HUD placement from the camera world transform instead of camera parenting", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 10);
    camera.position.set(0.25, 0.4, 1.5);
    camera.updateMatrixWorld(true);
    scene.add(camera);

    const host = createHudHost({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      distance: 0.75,
      offset: { x: 0.1, y: -0.05 },
      createCanvas: createFakeCanvas
    });

    host.attach();
    host.update({
      scene,
      camera
    });

    expect(host.mesh.parent).toBe(scene);
    expect(host.mesh.position.x).toBeCloseTo(0.35);
    expect(host.mesh.position.y).toBeCloseTo(0.35);
    expect(host.mesh.position.z).toBeCloseTo(0.75);

    host.detach();
  });

  it("exposes composite embedded surfaces without drawing them into the canvas", () => {
    const surfaces = createEmbeddedSurfaceService();
    const runtime = createRuntime({
      root: createEmbeddedSurface("monitor", {
        sourceId: "camera.rear",
        compositionMode: "composite"
      }),
      surface: { width: 160, height: 100 },
      services: { surfaces }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    surfaces.setState("monitor", {
      available: true,
      handle: { kind: "mock-surface" },
      sourceWidth: 640,
      sourceHeight: 480
    });

    const host = createScenePanelHost({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      createCanvas: createFakeCanvas
    });

    host.attach();
    host.update({ scene, camera });

    expect(host.getCompositeSurfaces()).toHaveLength(1);
    expect(host.getCompositeSurfaces()[0]).toMatchObject({
      componentId: "monitor",
      compositionMode: "composite"
    });

    host.detach();
  });
});
