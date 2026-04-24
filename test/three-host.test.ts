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
  createPoseAnchoredPanelHost,
  createScenePanelHost,
  resolveCompositeSurfacePlacements
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

  it("applies explicit pose placement while reusing the shared ray-input host path", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    const scene = new THREE.Scene();
    const pose = {
      position: { x: 0.25, y: 1.2, z: -0.5 },
      orientation: { x: 0, y: 0, z: 0, w: 1 }
    };

    const host = createPoseAnchoredPanelHost({
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
      anchorPose: pose,
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

  it("sizes viewport HUD overlays from the active XR eye projection", () => {
    const runtime = createRuntime({
      root: createButtonFixture(),
      surface: { width: 160, height: 100 }
    });

    const scene = new THREE.Scene();
    const leftCamera = new THREE.PerspectiveCamera(58, 0.9, 0.1, 10);
    leftCamera.updateProjectionMatrix();
    (leftCamera as THREE.PerspectiveCamera & { viewport?: THREE.Vector4 }).viewport =
      new THREE.Vector4(0, 0, 900, 1000);
    const rightCamera = new THREE.PerspectiveCamera(58, 0.9, 0.1, 10);
    rightCamera.updateProjectionMatrix();
    (rightCamera as THREE.PerspectiveCamera & { viewport?: THREE.Vector4 }).viewport =
      new THREE.Vector4(900, 0, 900, 1000);
    const xrCamera = new THREE.ArrayCamera([leftCamera, rightCamera]);
    xrCamera.position.set(0.2, 0.35, 1.4);
    xrCamera.updateMatrixWorld(true);
    scene.add(xrCamera);

    const host = createHudHost({
      runtime,
      surface: { width: 160, height: 100 },
      distance: 0.5,
      sizing: "viewport",
      createCanvas: createFakeCanvas
    });

    host.attach();
    host.update({
      scene,
      camera: xrCamera,
      surfaceMetrics: {
        width: 900,
        height: 1000,
        pixelDensity: 1
      }
    });

    const expectedHeight = 2 * Math.tan((THREE.MathUtils.degToRad(58) / 2)) * 0.5;
    const expectedWidth = expectedHeight * 0.9;

    expect(host.mesh.visible).toBe(true);
    expect(host.mesh.scale.x).toBeCloseTo(expectedWidth, 5);
    expect(host.mesh.scale.y).toBeCloseTo(expectedHeight, 5);

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

    const handle = { kind: "mock-surface" };
    surfaces.publish("camera.rear", {
      available: true,
      handle,
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
      sourceId: "camera.rear",
      handle,
      compositionMode: "composite",
      surfaceRevision: 1
    });

    host.detach();
  });

  it("supports deferring host rendering until render is called explicitly", () => {
    const surfaces = createEmbeddedSurfaceService();
    const runtime = createRuntime({
      root: createEmbeddedSurface("monitor", {
        sourceId: "plot.main",
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

    surfaces.publish("plot.main", {
      available: true,
      handle: { kind: "plot-texture" },
      sourceWidth: 640,
      sourceHeight: 480
    });

    const host = createScenePanelHost({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      renderOnUpdate: false,
      createCanvas: createFakeCanvas
    });

    host.attach();
    host.update({ scene, camera });
    expect(host.getCompositeSurfaces()).toHaveLength(0);

    host.render();
    expect(host.getCompositeSurfaces()).toHaveLength(1);

    host.detach();
  });

  it("resolves composite placements in panel-local mesh units", () => {
    const surfaces = createEmbeddedSurfaceService();
    const runtime = createRuntime({
      root: createEmbeddedSurface("monitor", {
        sourceId: "plot.main",
        compositionMode: "composite",
        preserveAspectRatio: false
      }),
      surface: { width: 160, height: 100 },
      theme: { padding: 0 },
      services: { surfaces }
    });

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    surfaces.publish("plot.main", {
      available: true,
      handle: { kind: "plot-texture" },
      sourceWidth: 160,
      sourceHeight: 100
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

    const placements = resolveCompositeSurfacePlacements(host);
    expect(placements).toHaveLength(1);
    expect(placements[0]).toMatchObject({
      componentId: "monitor",
      sourceId: "plot.main",
      panelRect: {
        x: 0,
        y: 0,
        width: 1,
        height: 0.625
      },
      localCenter: {
        x: 0,
        y: 0,
        z: 0
      },
      size: {
        width: 1,
        height: 0.625
      }
    });

    host.detach();
  });

  it("updates composite surfaces without redrawing the shared canvas", () => {
    const surfaces = createEmbeddedSurfaceService();
    const runtime = createRuntime({
      root: createEmbeddedSurface("monitor", {
        sourceId: "plot.main",
        compositionMode: "composite"
      }),
      surface: { width: 160, height: 100 },
      services: { surfaces }
    });
    const recordingCanvas = createRecordingCanvas({ width: 160, height: 100, pixelDensity: 1 });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    surfaces.publish("plot.main", {
      available: true,
      handle: { kind: "plot-texture", revision: 1 },
      sourceWidth: 640,
      sourceHeight: 480
    });

    const host = createScenePanelHost({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      createCanvas: () => recordingCanvas.canvas
    });

    host.attach();
    host.update({ scene, camera });
    const initialClearCount = countOperations(recordingCanvas.operations, "clearRect");

    surfaces.publish("plot.main", {
      lastFrameTimestamp: 24
    });

    const snapshot = host.render();
    expect(countOperations(recordingCanvas.operations, "clearRect")).toBe(initialClearCount);
    expect(snapshot.revision).toBeGreaterThan(0);
    expect(host.getCompositeSurfaces()[0]?.surfaceRevision).toBe(2);

    host.detach();
  });

  it("mirrors embedded rear-view surfaces horizontally when requested", () => {
    const surfaces = createEmbeddedSurfaceService();
    const runtime = createRuntime({
      root: createEmbeddedSurface("mirror", {
        sourceId: "camera.rear",
        mirrorX: true,
        preserveAspectRatio: false
      }),
      surface: { width: 160, height: 100 },
      theme: { padding: 0 },
      services: { surfaces }
    });
    const image = { width: 64, height: 32 };
    surfaces.publish("camera.rear", {
      available: true,
      handle: { image },
      sourceWidth: 64,
      sourceHeight: 32
    });

    const recordingCanvas = createRecordingCanvas({ width: 160, height: 100, pixelDensity: 1 });
    const host = createScenePanelHost({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      createCanvas: () => recordingCanvas.canvas
    });

    host.attach();
    host.render();

    expect(recordingCanvas.operations).toContainEqual(["translate", 160, 0]);
    expect(recordingCanvas.operations).toContainEqual(["scale", -1, 1]);
    expect(recordingCanvas.operations).toContainEqual(["drawImage", image, 0, 0, 160, 100]);

    host.detach();
  });

  it("redraws copy-mode surfaces when the published frame advances without changing handle identity", () => {
    const surfaces = createEmbeddedSurfaceService();
    const runtime = createRuntime({
      root: createEmbeddedSurface("mirror", {
        sourceId: "camera.rear",
        preserveAspectRatio: false
      }),
      surface: { width: 160, height: 100 },
      theme: { padding: 0 },
      services: { surfaces }
    });
    const image = { width: 64, height: 32 };
    const recordingCanvas = createRecordingCanvas({ width: 160, height: 100, pixelDensity: 1 });
    const host = createScenePanelHost({
      runtime,
      surface: { width: 160, height: 100 },
      panelWidth: 1,
      panelHeight: 0.625,
      createCanvas: () => recordingCanvas.canvas
    });

    surfaces.publish("camera.rear", {
      available: true,
      handle: { image },
      sourceWidth: 64,
      sourceHeight: 32
    });

    host.attach();
    host.render();
    const initialClearCount = countOperations(recordingCanvas.operations, "clearRect");
    const initialDrawCount = countOperations(recordingCanvas.operations, "drawImage");

    surfaces.publish("camera.rear", {
      lastFrameTimestamp: 42
    });

    host.render();
    expect(countOperations(recordingCanvas.operations, "clearRect")).toBeGreaterThan(initialClearCount);
    expect(countOperations(recordingCanvas.operations, "drawImage")).toBeGreaterThan(initialDrawCount);

    host.detach();
  });
});

function createRecordingCanvas(metrics: { width: number; height: number; pixelDensity: number }): {
  canvas: ReturnType<typeof createFakeCanvas>;
  operations: Array<readonly unknown[]>;
} {
  const operations: Array<readonly unknown[]> = [];
  const context = {
    fillStyle: "#000000" as string | CanvasGradient | CanvasPattern,
    strokeStyle: "#000000" as string | CanvasGradient | CanvasPattern,
    lineWidth: 1,
    font: "14px sans-serif",
    globalAlpha: 1,
    textAlign: "left" as const,
    textBaseline: "top" as const,
    imageSmoothingEnabled: true,
    save() {
      operations.push(["save"]);
    },
    restore() {
      operations.push(["restore"]);
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      operations.push(["setTransform", a, b, c, d, e, f]);
    },
    translate(x: number, y: number) {
      operations.push(["translate", x, y]);
    },
    scale(x: number, y: number) {
      operations.push(["scale", x, y]);
    },
    clearRect(x: number, y: number, width: number, height: number) {
      operations.push(["clearRect", x, y, width, height]);
    },
    beginPath() {
      operations.push(["beginPath"]);
    },
    rect(x: number, y: number, width: number, height: number) {
      operations.push(["rect", x, y, width, height]);
    },
    clip() {
      operations.push(["clip"]);
    },
    fillRect(x: number, y: number, width: number, height: number) {
      operations.push(["fillRect", x, y, width, height]);
    },
    strokeRect(x: number, y: number, width: number, height: number) {
      operations.push(["strokeRect", x, y, width, height]);
    },
    moveTo(x: number, y: number) {
      operations.push(["moveTo", x, y]);
    },
    lineTo(x: number, y: number) {
      operations.push(["lineTo", x, y]);
    },
    stroke() {
      operations.push(["stroke"]);
    },
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
      operations.push(["arc", x, y, radius, startAngle, endAngle]);
    },
    fill() {
      operations.push(["fill"]);
    },
    fillText(text: string, x: number, y: number) {
      operations.push(["fillText", text, x, y]);
    },
    measureText(text: string) {
      return { width: text.length * 8 };
    },
    drawImage(image: unknown, x: number, y: number, width: number, height: number) {
      operations.push(["drawImage", image, x, y, width, height]);
    }
  };

  return {
    canvas: {
      width: metrics.width * metrics.pixelDensity,
      height: metrics.height * metrics.pixelDensity,
      getContext(type: "2d") {
        return type === "2d" ? context : null;
      }
    },
    operations
  };
}

function countOperations(
  operations: ReadonlyArray<readonly unknown[]>,
  name: string
): number {
  return operations.filter((operation) => operation[0] === name).length;
}
