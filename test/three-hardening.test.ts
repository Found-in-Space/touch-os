import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createEmbeddedSurface,
  createEmbeddedSurfaceService,
  createHoldButton,
  createNode,
  createRepeatButton,
  createRuntime,
  type DisplayComponent,
  type RuntimeOutput,
  type SurfaceDrawCommand
} from "../src/index.js";
import {
  createPoseAnchoredPanelDriver,
  createScenePanelDriver,
  createScenePanelHost,
  createThreePanelSession,
  createThreeTextureCompositePresenter,
  resolveCompositeSurfacePlacements,
  type CanvasContextLike,
  type CanvasLike,
  type PointerPresentationState,
  type ThreePanelMesh,
  type ThreePointerSample,
  type ThreePointerSource
} from "../src/hosts/three.js";
import { createFakeCanvas } from "./helpers/fake-canvas.js";

describe("Three host hardening", () => {
  it("advances runtime time exactly once per host or driver update", () => {
    const directRuntime = createRuntime({
      root: createHoldButton("hold", { label: "Hold", actionId: "hold" }),
      surface: { width: 100, height: 50 }
    });
    const directTicks = observeTicks(directRuntime);
    const directHost = createScenePanelHost({
      runtime: directRuntime,
      createCanvas: createFakeCanvas
    });
    directHost.attach();
    directHost.update({ timestamp: 10, scene: new THREE.Scene() });
    directHost.update({ timestamp: 10, scene: new THREE.Scene() });
    expect(directTicks).toEqual([10, 10]);

    const driverRuntime = createRuntime({
      root: createHoldButton("hold", { label: "Hold", actionId: "hold" }),
      surface: { width: 100, height: 50 }
    });
    const driverTicks = observeTicks(driverRuntime);
    const driver = createScenePanelDriver({
      runtime: driverRuntime,
      createCanvas: createFakeCanvas
    });
    driver.attach();
    driver.update({ timestamp: 20, scene: new THREE.Scene() });
    expect(driverTicks).toEqual([20]);

    expect(() => driver.update({ timestamp: 19, scene: new THREE.Scene() })).toThrow(
      /monotonic/i
    );
    directHost.dispose();
    driver.dispose();
  });

  it("drives long press and repeat behavior from monotonic host frames", () => {
    const longPressRuntime = createRuntime({
      root: createLongPressProbe(),
      surface: { width: 100, height: 50 },
      longPressDelay: 300
    });
    const longPressSamples = createContinuousSurfaceSource();
    const longPressDriver = createScenePanelDriver({
      runtime: longPressRuntime,
      createCanvas: createFakeCanvas,
      pointerSources: [longPressSamples.source]
    });
    const scene = new THREE.Scene();
    longPressDriver.attach();
    longPressSamples.set("down", 0);
    longPressDriver.update({ timestamp: 0, scene });
    longPressSamples.set("down", 299);
    longPressDriver.update({ timestamp: 299, scene });
    longPressSamples.set("down", 300);
    longPressDriver.update({ timestamp: 300, scene });
    longPressDriver.update({ timestamp: 300, scene });
    expect(longPressRuntime.takeOutputs()).toEqual([
      { type: "action", actionId: "probe.long-press", componentId: "probe" }
    ]);
    longPressDriver.dispose();

    const repeatRuntime = createRuntime({
      root: createRepeatButton("repeat", {
        label: "Repeat",
        actionId: "repeat.fire",
        repeatDelayMs: 200,
        repeatIntervalMs: 100
      }),
      surface: { width: 100, height: 50 }
    });
    const repeatSamples = createContinuousSurfaceSource();
    const repeatDriver = createScenePanelDriver({
      runtime: repeatRuntime,
      createCanvas: createFakeCanvas,
      pointerSources: [repeatSamples.source]
    });
    repeatDriver.attach();
    repeatSamples.set("down", 0);
    repeatDriver.update({ timestamp: 0, scene });
    repeatSamples.set("down", 550);
    repeatDriver.update({ timestamp: 550, scene });
    repeatDriver.update({ timestamp: 550, scene });
    expect(repeatRuntime.takeOutputs()).toHaveLength(5);
    repeatDriver.dispose();
  });

  it("synthesizes cancellation when a continuous source omits an active id", () => {
    const runtime = createRuntime({
      root: createHoldButton("hold", {
        label: "Hold",
        actionId: "hold.set",
        startPayload: { active: true },
        stopPayload: { active: false }
      }),
      surface: { width: 100, height: 50 }
    });
    const samples = createContinuousSurfaceSource();
    const presented: PointerPresentationState[] = [];
    const driver = createScenePanelDriver({
      runtime,
      createCanvas: createFakeCanvas,
      pointerSources: [samples.source],
      pointerPresenter: {
        update(state) {
          presented.push({ ...state });
        },
        dispose() {}
      }
    });
    const scene = new THREE.Scene();
    driver.attach();
    samples.set("down", 1, {
      pressure: 0.6,
      modifiers: { altKey: true, ctrlKey: false, metaKey: false, shiftKey: true }
    });
    driver.update({ timestamp: 1, scene });
    samples.clear();
    driver.update({ timestamp: 2, scene });

    expect(runtime.takeOutputs()).toEqual([
      {
        type: "action",
        actionId: "hold.set",
        componentId: "hold",
        payload: { active: true }
      },
      {
        type: "action",
        actionId: "hold.set",
        componentId: "hold",
        payload: { active: false }
      }
    ]);
    expect(driver.getPointerState("pointer")).toBeUndefined();
    expect(presented.at(-1)).toMatchObject({ pointerId: "pointer", active: false });
    driver.dispose();
  });

  it("tracks multiple pointer ids independently and preserves cancellation metadata", () => {
    const runtime = createRuntime({
      root: createPointerMetadataProbe(),
      surface: { width: 100, height: 50 }
    });
    let current: ThreePointerSample[] = [
      {
        ...surfaceSample("down", 1, {
          pressure: 0.25,
          modifiers: { altKey: false, ctrlKey: true, metaKey: false, shiftKey: false }
        }),
        pointerId: "left"
      },
      {
        ...surfaceSample("down", 1, {
          pressure: 0.75,
          modifiers: { altKey: false, ctrlKey: false, metaKey: false, shiftKey: true }
        }),
        pointerId: "right"
      }
    ];
    const source: ThreePointerSource = {
      sample() {
        return current;
      }
    };
    const driver = createScenePanelDriver({
      runtime,
      createCanvas: createFakeCanvas,
      pointerSources: [source]
    });
    const scene = new THREE.Scene();
    driver.attach();
    driver.update({ timestamp: 1, scene });
    current = [
      {
        ...surfaceSample("move", 2, {
          pressure: 0.8,
          modifiers: { altKey: true, ctrlKey: false, metaKey: false, shiftKey: true }
        }),
        pointerId: "right"
      }
    ];
    driver.update({ timestamp: 2, scene });

    const cancellations = runtime.takeOutputs().filter(
      (output): output is Extract<RuntimeOutput, { type: "action" }> =>
        output.type === "action" && output.actionId === "probe.cancel"
    );
    expect(cancellations).toEqual([
      {
        type: "action",
        actionId: "probe.cancel",
        componentId: "probe",
        payload: {
          pointerId: "left",
          pointerType: "touch",
          pressure: 0.25,
          ctrlKey: true,
          shiftKey: false
        }
      }
    ]);
    expect(driver.getPointerState("left")).toBeUndefined();
    expect(driver.getPointerState("right")?.active).toBe(true);
    driver.dispose();
  });

  it("cancels before ticking when tracking or an anchor pose is lost", () => {
    const runtime = createRuntime({
      root: createRepeatButton("repeat", {
        label: "Repeat",
        actionId: "repeat.fire",
        repeatDelayMs: 200,
        repeatIntervalMs: 100
      }),
      surface: { width: 100, height: 50 }
    });
    const samples = createContinuousSurfaceSource();
    const driver = createPoseAnchoredPanelDriver({
      runtime,
      offset: { x: 0, y: 0, z: 0 },
      tiltRadians: 0,
      createCanvas: createFakeCanvas,
      pointerSources: [samples.source]
    });
    const scene = new THREE.Scene();
    driver.attach();
    samples.set("down", 0);
    driver.update({
      timestamp: 0,
      scene,
      anchorPose: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      }
    });
    samples.set("move", 300);
    driver.update({ timestamp: 300, scene });

    expect(runtime.takeOutputs()).toHaveLength(1);
    expect(runtime.getInteraction().pressedTargetId).toBeUndefined();
    expect(driver.host.mesh.visible).toBe(false);
    driver.dispose();
  });

  it("does not repeat after release, cancel, clear, hide, or detach", () => {
    for (const lifecycle of ["release", "cancel", "clear", "hide", "detach"] as const) {
      const runtime = createRuntime({
        root: createRepeatButton("repeat", {
          label: "Repeat",
          actionId: "repeat.fire",
          repeatDelayMs: 200,
          repeatIntervalMs: 100
        }),
        surface: { width: 100, height: 50 }
      });
      const samples = createContinuousSurfaceSource();
      const driver = createScenePanelDriver({
        runtime,
        createCanvas: createFakeCanvas,
        pointerSources: [samples.source]
      });
      const scene = new THREE.Scene();
      driver.attach();
      samples.set("down", 0);
      driver.update({ timestamp: 0, scene });

      if (lifecycle === "release" || lifecycle === "cancel") {
        samples.set(lifecycle === "release" ? "up" : "cancel", 100);
        driver.update({ timestamp: 100, scene });
        samples.clear();
        driver.update({ timestamp: 500, scene });
      } else if (lifecycle === "clear") {
        samples.clear();
        driver.clearPointer("pointer", 100);
        runtime.tick(500);
      } else if (lifecycle === "hide") {
        const session = createThreePanelSession({ key: "repeat", runtime, driver });
        session.hide();
        runtime.tick(500);
      } else {
        driver.detach();
        runtime.tick(500);
      }

      expect(runtime.takeOutputs()).toEqual([
        { type: "action", actionId: "repeat.fire", componentId: "repeat" }
      ]);
      driver.dispose();
    }
  });

  it("flushes hold-stop outputs on hide, clear, disable, and disposal", () => {
    const cases = ["hide", "clear", "disable", "dispose"] as const;
    for (const lifecycle of cases) {
      const outputs: RuntimeOutput[] = [];
      const runtime = createRuntime({
        root: createHoldButton("hold", {
          label: "Hold",
          actionId: "hold.set",
          startPayload: { active: true },
          stopPayload: { active: false }
        }),
        surface: { width: 100, height: 50 }
      });
      const driver = createScenePanelDriver({
        runtime,
        createCanvas: createFakeCanvas
      });
      const session = createThreePanelSession({
        key: lifecycle,
        runtime,
        driver,
        outputHandler(output) {
          outputs.push(output);
        }
      });
      const scene = new THREE.Scene();
      session.attach();
      session.update({ timestamp: 1, scene });
      session.process(surfaceSample("down", 1), { timestamp: 1, scene });

      if (lifecycle === "hide") {
        session.hide();
      } else if (lifecycle === "clear") {
        session.clearPointer("pointer");
      } else if (lifecycle === "disable") {
        session.enabled = false;
        session.update({ timestamp: 2, scene });
      } else {
        session.dispose();
      }

      expect(outputs.map((output) => output.type === "action" ? output.payload : undefined)).toEqual([
        { active: true },
        { active: false }
      ]);
      session.dispose();
    }
  });

  it("queues cancellation outputs before raw host or driver detachment", () => {
    for (const kind of ["host", "driver"] as const) {
      const runtime = createRuntime({
        root: createHoldButton("hold", {
          label: "Hold",
          actionId: "hold.set",
          startPayload: { active: true },
          stopPayload: { active: false }
        }),
        surface: { width: 100, height: 50 }
      });
      const scene = new THREE.Scene();
      if (kind === "host") {
        const host = createScenePanelHost({ runtime, createCanvas: createFakeCanvas });
        host.attach();
        host.update({
          timestamp: 1,
          scene,
          events: [
            {
              source: "surface",
              type: "pointer-down",
              pointerId: "pointer",
              pointerType: "touch",
              timestamp: 1,
              surfaceX: 50,
              surfaceY: 25
            }
          ]
        });
        host.detach();
        host.dispose();
      } else {
        const samples = createContinuousSurfaceSource();
        const driver = createScenePanelDriver({
          runtime,
          createCanvas: createFakeCanvas,
          pointerSources: [samples.source]
        });
        driver.attach();
        samples.set("down", 1);
        driver.update({ timestamp: 1, scene });
        driver.detach();
        driver.dispose();
      }

      expect(runtime.takeOutputs().map((output) => output.type === "action" ? output.payload : undefined)).toEqual([
        { active: true },
        { active: false }
      ]);
    }
  });

  it("keeps detach reversible and reserves resource destruction for idempotent disposal", () => {
    const runtime = createRuntime({
      root: createHoldButton("hold", { label: "Hold", actionId: "hold" }),
      surface: { width: 100, height: 50 }
    });
    const scene = new THREE.Scene();
    const host = createScenePanelHost({ runtime, createCanvas: createFakeCanvas });
    let geometryDisposals = 0;
    let materialDisposals = 0;
    let textureDisposals = 0;
    host.mesh.geometry.addEventListener("dispose", () => geometryDisposals += 1);
    host.material.addEventListener("dispose", () => materialDisposals += 1);
    host.texture.addEventListener("dispose", () => textureDisposals += 1);

    host.attach();
    host.update({ timestamp: 1, scene });
    host.detach();
    expect(host.mesh.parent).toBeNull();
    expect([geometryDisposals, materialDisposals, textureDisposals]).toEqual([0, 0, 0]);

    host.attach();
    host.update({ timestamp: 2, scene });
    expect(host.mesh.parent).toBe(scene);
    host.dispose();
    host.dispose();
    expect([geometryDisposals, materialDisposals, textureDisposals]).toEqual([1, 1, 1]);
    expect(() => host.attach()).toThrow(/disposed/i);
    expect(() => host.update({ timestamp: 3, scene })).toThrow(/disposed/i);
  });

  it("borrows supplied pointer presenters unless ownership is explicit", () => {
    let borrowedDisposals = 0;
    const borrowed = createScenePanelDriver({
      runtime: createRuntime({
        root: createHoldButton("hold", { label: "Hold", actionId: "hold" }),
        surface: { width: 100, height: 50 }
      }),
      createCanvas: createFakeCanvas,
      pointerPresenter: {
        update() {},
        dispose() {
          borrowedDisposals += 1;
        }
      }
    });
    borrowed.dispose();
    expect(borrowedDisposals).toBe(0);

    let ownedDisposals = 0;
    const owned = createScenePanelDriver({
      runtime: createRuntime({
        root: createHoldButton("hold", { label: "Hold", actionId: "hold" }),
        surface: { width: 100, height: 50 }
      }),
      createCanvas: createFakeCanvas,
      ownsPointerPresenter: true,
      pointerPresenter: {
        update() {},
        dispose() {
          ownedDisposals += 1;
        }
      }
    });
    owned.dispose();
    owned.dispose();
    expect(ownedDisposals).toBe(1);
  });

  it("uses stable metric precedence and redraws logical changes without replacing equal backing", () => {
    const runtime = createRuntime({
      root: createHoldButton("hold", { label: "Hold", actionId: "hold" }),
      surface: { width: 640, height: 360, pixelDensity: 1 }
    });
    let canvasCreations = 0;
    let clearCount = 0;
    const host = createScenePanelHost({
      runtime,
      surface: { width: 100, height: 50, pixelDensity: 2 },
      createCanvas(metrics) {
        canvasCreations += 1;
        return createCountingCanvas(metrics.width * metrics.pixelDensity, metrics.height * metrics.pixelDensity, () => {
          clearCount += 1;
        });
      }
    });
    const scene = new THREE.Scene();
    host.attach();
    const originalCanvas = host.canvas;
    const originalTexture = host.texture;
    host.update({
      timestamp: 1,
      scene,
      surfaceMetrics: { width: 200, height: 100, pixelDensity: 1 }
    });
    expect(host.canvas).toBe(originalCanvas);
    expect(host.texture).toBe(originalTexture);
    expect(host.getSurfaceMetrics()).toMatchObject({ width: 200, height: 100, pixelDensity: 1 });
    expect(canvasCreations).toBe(1);
    const clearsAfterChange = clearCount;
    const textureVersion = host.texture.version;

    host.update({
      timestamp: 1,
      scene,
      surfaceMetrics: { width: 200, height: 100, pixelDensity: 1 }
    });
    expect(clearCount).toBe(clearsAfterChange);
    expect(host.texture.version).toBe(textureVersion);

    host.update({ timestamp: 2, scene });
    expect(host.getSurfaceMetrics()).toMatchObject({ width: 100, height: 50, pixelDensity: 2 });
    host.dispose();

    const inheritedRuntime = createRuntime({
      root: createHoldButton("hold", { label: "Hold", actionId: "hold" }),
      surface: { width: 640, height: 360, pixelDensity: 1 }
    });
    const inheritedHost = createScenePanelHost({
      runtime: inheritedRuntime,
      createCanvas: createFakeCanvas
    });
    expect(inheritedHost.getSurfaceMetrics()).toMatchObject({ width: 640, height: 360 });
    inheritedHost.dispose();
  });

  it("reapplies UI material and texture-quality defaults after texture replacement", () => {
    const runtime = createRuntime({
      root: createHoldButton("hold", { label: "Hold", actionId: "hold" }),
      surface: { width: 100, height: 50 }
    });
    const host = createScenePanelHost({
      runtime,
      textureQuality: { anisotropy: 8 },
      createCanvas: createFakeCanvas
    });
    expect(host.material.transparent).toBe(true);
    expect(host.material.depthWrite).toBe(false);
    expect(host.material.toneMapped).toBe(false);
    expect(host.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(host.texture.anisotropy).toBe(8);

    const originalTexture = host.texture;
    host.attach();
    host.update({
      timestamp: 1,
      scene: new THREE.Scene(),
      surfaceMetrics: { width: 120, height: 60 }
    });
    expect(host.texture).not.toBe(originalTexture);
    expect(host.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(host.texture.anisotropy).toBe(8);
    host.dispose();

    const overridden = createScenePanelHost({
      runtime: createRuntime({
        root: createHoldButton("override", { label: "Override", actionId: "override" }),
        surface: { width: 10, height: 10 }
      }),
      transparent: true,
      depthWrite: true,
      toneMapped: true,
      textureQuality: { colorSpace: THREE.NoColorSpace },
      createCanvas: createFakeCanvas
    });
    expect(overridden.material.depthWrite).toBe(true);
    expect(overridden.material.toneMapped).toBe(true);
    expect(overridden.texture.colorSpace).toBe(THREE.NoColorSpace);
    overridden.dispose();
  });

  it("crops composite geometry and UVs to clips while preserving mirroring", () => {
    const texture = new THREE.Texture();
    const panel = createPanelMesh(1, 1);
    panel.visible = true;
    const command = {
      type: "surface" as const,
      componentId: "surface",
      sourceId: "source",
      rect: { x: 10, y: 10, width: 80, height: 60 },
      clipRect: { x: 30, y: 20, width: 40, height: 20 },
      handle: { kind: "three-texture", texture },
      compositionMode: "composite" as const,
      mirrorX: true
    };
    const fakeHost = {
      mesh: panel,
      getSurfaceMetrics: () => ({
        width: 100,
        height: 100,
        pixelDensity: 1,
        orientation: "square" as const,
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
      }),
      getCompositeSurfaces: () => [command]
    };
    const placement = resolveCompositeSurfacePlacements(fakeHost)[0];
    expect(placement).toMatchObject({
      visibleRect: { x: 30, y: 20, width: 40, height: 20 },
      panelRect: { x: 0.3, y: 0.2, width: 0.4, height: 0.2 },
      uv: { left: 0.75, right: 0.25, top: 5 / 6, bottom: 0.5 }
    });

    const presenter = createThreeTextureCompositePresenter(fakeHost, { componentId: "surface" });
    presenter.update();
    expect(presenter.mesh.material.depthWrite).toBe(false);
    expect(presenter.mesh.material.toneMapped).toBe(false);
    const uv = presenter.mesh.geometry.getAttribute("uv");
    expect(uv.getX(0)).toBeCloseTo(0.75);
    expect(uv.getY(0)).toBeCloseTo(5 / 6);
    expect(uv.getX(1)).toBeCloseTo(0.25);
    expect(uv.getY(1)).toBeCloseTo(5 / 6);
    expect(presenter.mesh.scale.x).toBeCloseTo(0.4);
    expect(presenter.mesh.scale.y).toBeCloseTo(0.2);

    command.clipRect = { x: 95, y: 95, width: 5, height: 5 };
    presenter.update();
    expect(resolveCompositeSurfacePlacements(fakeHost)).toEqual([]);
    expect(presenter.mesh.visible).toBe(false);
    presenter.dispose();
    panel.geometry.dispose();
    panel.material.dispose();
  });

  it("transforms and intersects nested-runtime clips before resolving composite UVs", () => {
    const texture = new THREE.Texture();
    const nestedSnapshot = {
      revision: 1,
      sharedSurfaceRevision: 1,
      commands: [
        {
          type: "surface" as const,
          componentId: "nested",
          rect: { x: 0, y: 0, width: 100, height: 100 },
          clipRect: { x: 20, y: 10, width: 60, height: 80 },
          handle: { kind: "three-texture", texture },
          compositionMode: "composite" as const
        }
      ]
    };
    const runtime = createRuntime({
      root: createNestedSurfaceProbe({
        type: "surface",
        componentId: "outer",
        rect: { x: 20, y: 10, width: 160, height: 80 },
        clipRect: { x: 60, y: 10, width: 80, height: 80 },
        handle: {
          kind: "touch-os-render-snapshot",
          width: 100,
          height: 100,
          snapshot: nestedSnapshot
        },
        compositionMode: "copy",
        mirrorX: true
      }),
      surface: { width: 200, height: 100 }
    });
    const host = createScenePanelHost({ runtime, createCanvas: createFakeCanvas });
    host.attach();
    host.update({ timestamp: 1, scene: new THREE.Scene() });

    const command = host.getCompositeSurfaces()[0];
    expect(command).toMatchObject({
      componentId: "outer:nested",
      rect: { x: 20, y: 10, width: 160, height: 80 },
      clipRect: { x: 60, y: 18, width: 80, height: 64 },
      mirrorX: true
    });
    const placement = resolveCompositeSurfacePlacements(host)[0];
    expect(placement).toMatchObject({
      visibleRect: { x: 60, y: 18, width: 80, height: 64 }
    });
    expect(placement?.uv.left).toBeCloseTo(0.75);
    expect(placement?.uv.right).toBeCloseTo(0.25);
    expect(placement?.uv.top).toBeCloseTo(0.9);
    expect(placement?.uv.bottom).toBeCloseTo(0.1);
    host.dispose();
  });

  it("disposes automatic composite presenters when commands stop being presentable", () => {
    const surfaces = createEmbeddedSurfaceService();
    const runtime = createRuntime({
      root: createEmbeddedSurface("surface", {
        sourceId: "source",
        compositionMode: "composite",
        preserveAspectRatio: false,
        viewportPadding: 0
      }),
      surface: { width: 100, height: 50 },
      theme: { padding: 0 },
      services: { surfaces }
    });
    const texture = new THREE.Texture();
    surfaces.publish("source", {
      available: true,
      handle: { kind: "three-texture", texture },
      sourceWidth: 100,
      sourceHeight: 50
    });
    const driver = createScenePanelDriver({ runtime, createCanvas: createFakeCanvas });
    driver.attach();
    driver.update({ timestamp: 1, scene: new THREE.Scene() });
    const composite = driver.host.mesh.children[0] as THREE.Mesh<THREE.PlaneGeometry>;
    let disposals = 0;
    composite.geometry.addEventListener("dispose", () => disposals += 1);

    surfaces.publish("source", { handle: { kind: "not-a-texture" } });
    driver.update({ timestamp: 2, scene: new THREE.Scene() });
    expect(composite.parent).toBeNull();
    expect(disposals).toBe(1);
    driver.dispose();
  });
});

function observeTicks(runtime: ReturnType<typeof createRuntime>): number[] {
  const timestamps: number[] = [];
  const originalTick = runtime.tick.bind(runtime);
  runtime.tick = (timestamp) => {
    timestamps.push(timestamp);
    originalTick(timestamp);
  };
  return timestamps;
}

function createLongPressProbe() {
  const component: DisplayComponent<Record<string, never>> = {
    kind: "long-press-probe",
    measure(ctx) {
      return { width: ctx.constraints.maxWidth, height: ctx.constraints.maxHeight };
    },
    render(ctx) {
      return [{ type: "rect", componentId: ctx.id, rect: ctx.bounds, fill: "#fff" }];
    },
    hitTest(ctx) {
      return { targetId: `${ctx.id}:face` };
    },
    handleEvent(ctx) {
      if (ctx.event.type === "long-press") {
        ctx.emit({ type: "action", actionId: "probe.long-press", componentId: ctx.id });
      }
    }
  };
  return createNode("probe", component, {});
}

function createPointerMetadataProbe() {
  const component: DisplayComponent<Record<string, never>> = {
    kind: "pointer-metadata-probe",
    measure(ctx) {
      return { width: ctx.constraints.maxWidth, height: ctx.constraints.maxHeight };
    },
    render(ctx) {
      return [{ type: "rect", componentId: ctx.id, rect: ctx.bounds, fill: "#fff" }];
    },
    hitTest(ctx) {
      return { targetId: `${ctx.id}:face` };
    },
    handleEvent(ctx) {
      if (ctx.event.type !== "cancel") {
        return;
      }
      ctx.emit({
        type: "action",
        actionId: "probe.cancel",
        componentId: ctx.id,
        payload: {
          pointerId: ctx.event.pointerId,
          pointerType: ctx.event.pointerType,
          pressure: ctx.event.pressure,
          ctrlKey: ctx.event.modifiers?.ctrlKey ?? false,
          shiftKey: ctx.event.modifiers?.shiftKey ?? false
        }
      });
    }
  };
  return createNode("probe", component, {});
}

function createNestedSurfaceProbe(command: SurfaceDrawCommand) {
  const component: DisplayComponent<Record<string, never>> = {
    kind: "nested-surface-probe",
    measure(ctx) {
      return { width: ctx.constraints.maxWidth, height: ctx.constraints.maxHeight };
    },
    render() {
      return [command];
    }
  };
  return createNode("outer-root", component, {});
}

function createContinuousSurfaceSource(): {
  source: ThreePointerSource;
  set(
    phase: ThreePointerSample["phase"],
    timestamp: number,
    metadata?: Pick<ThreePointerSample, "pressure" | "modifiers">
  ): void;
  clear(): void;
} {
  let current: ThreePointerSample[] = [];
  return {
    source: {
      sample() {
        return current;
      }
    },
    set(phase, timestamp, metadata = {}) {
      current = [surfaceSample(phase, timestamp, metadata)];
    },
    clear() {
      current = [];
    }
  };
}

function surfaceSample(
  phase: ThreePointerSample["phase"],
  timestamp: number,
  metadata: Pick<ThreePointerSample, "pressure" | "modifiers"> = {}
): ThreePointerSample {
  return {
    pointerId: "pointer",
    pointerType: "touch",
    transport: "surface",
    phase,
    timestamp,
    surfaceX: 50,
    surfaceY: 25,
    ...metadata
  };
}

function createPanelMesh(width: number, height: number): ThreePanelMesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ toneMapped: false, depthWrite: false })
  );
}

function createCountingCanvas(width: number, height: number, onClear: () => void): CanvasLike {
  const context: CanvasContextLike = {
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    font: "14px sans-serif",
    globalAlpha: 1,
    textAlign: "left",
    textBaseline: "top",
    save() {},
    restore() {},
    setTransform() {},
    translate() {},
    scale() {},
    clearRect() {
      onClear();
    },
    beginPath() {},
    rect() {},
    clip() {},
    fillRect() {},
    strokeRect() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc() {},
    fill() {},
    fillText() {},
    measureText(text) {
      return { width: text.length * 8 };
    }
  };
  return {
    width,
    height,
    getContext() {
      return context;
    }
  };
}
