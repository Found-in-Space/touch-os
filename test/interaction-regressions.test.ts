import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createButton, createSlider, createWindowManager, createTouchAppRegistry, defineTouchApp,
  type InteractionSource, type RuntimeOutput } from "../src/index.js";
import { createThreeUIEnvironment, createThreePointerFeedback, createWebXRInteractionInput,
  type ThreePanelViewOptions, type ThreeUIEnvironment } from "../src/hosts/three.js";
import { createFakeCanvas } from "./helpers/fake-canvas.js";

const ray = (x = 0): InteractionSource => ({ id: "right", tracked: true, pointerType: "controller", space: "world-metres",
  ray: { origin: { x, y: 0, z: 2 }, direction: { x: 0, y: 0, z: -1 } } });
function mount(ui: ThreeUIEnvironment, id: string, config: Partial<ThreePanelViewOptions> = {}) {
  return ui.mountPanel({ id, content: createButton(`${id}:button`, { label: id, actionId: id }),
    surface: { width: 200, height: 100 }, placement: { panelWidth: 1, panelHeight: 0.5, createCanvas: createFakeCanvas }, ...config });
}
function send(ui: ThreeUIEnvironment, timestamp: number, phase?: "begin" | "complete", source = ray()) {
  ui.update({ timestamp, sources: [source], edges: phase ? [{ timestamp, phase, source }] : [] });
}

describe("shared release authority", () => {
  it("preserves the activation veto through an embedded child runtime", () => {
    const actions: RuntimeOutput[] = [];
    const registry = createTouchAppRegistry([defineTouchApp({ manifest: { id: "child", name: "Child", version: "1" },
      createApp: () => ({ render: () => createButton("run", { label: "Run", actionId: "run" }),
        handleOutput: output => { if (output.type === "action") actions.push(output); } }) })]);
    const ui = createThreeUIEnvironment({ parent: new THREE.Scene() });
    const view = mount(ui, "base", { surface: { width: 420, height: 280 }, content: createWindowManager("windows", {
      registry, appHostMode: "child-runtime", initialWindows: [{ id: "window", appId: "child", instanceId: "one", title: "Child",
        rect: { x: 20, y: 20, width: 180, height: 130 }, zIndex: 1, mode: "normal", focused: true, movable: false, resizable: false }]
    }) });
    ui.update({ timestamp: 0 });
    const viewport = view.runtime.render().commands.find(command => command.role === "embedded-surface-viewport");
    if (viewport?.type !== "surface") throw new Error("Missing child surface");
    const source = ray();
    source.ray!.origin.x = (viewport.rect.x + viewport.rect.width / 2) / 420 - 0.5;
    source.ray!.origin.y = 0.25 - (viewport.rect.y + viewport.rect.height / 2) / 280 * 0.5;
    send(ui, 1, "begin", source);
    const overlay = mount(ui, "modal", { mode: "overlay" });
    send(ui, 2, "complete", source); expect(actions).toEqual([]);
    overlay.hide(); send(ui, 3, "begin", source); send(ui, 4, "complete", source);
    expect(actions).toEqual([expect.objectContaining({ actionId: "run" })]);
    ui.dispose();
  });
  it("releases a covered button without activating it, then accepts a fresh unobstructed click", () => {
    const ui = createThreeUIEnvironment({ parent: new THREE.Scene() });
    const actions: RuntimeOutput[] = [];
    mount(ui, "base", { bind: output => actions.push(output) });
    send(ui, 1, "begin");
    const overlay = mount(ui, "modal", { mode: "overlay", bind: output => actions.push(output) });
    send(ui, 2, "complete");
    expect(ui.interaction.getSnapshot("right")?.hit?.targetId).toBe("modal");
    expect(ui.interaction.getSnapshot("right")?.capture).toBeUndefined();
    expect(actions.filter(output => output.type === "action")).toEqual([]);
    overlay.hide(); send(ui, 3, "begin"); send(ui, 4, "complete");
    expect(actions.filter(output => output.type === "action")).toEqual([
      expect.objectContaining({ actionId: "base" })
    ]);
    ui.dispose();
  });

  it("still commits an established slider edit outside its panel when an overlay appears", () => {
    const ui = createThreeUIEnvironment({ parent: new THREE.Scene() });
    const outputs: RuntimeOutput[] = []; let value = 50;
    const view = mount(ui, "base", {
      content: () => createSlider("slider", { label: "Value", field: "value", min: 0, max: 100, value }),
      bind(output) { outputs.push(output); if (output.type === "change-request" && output.phase === "update") value = Number(output.value); }
    });
    ui.update({ timestamp: 0 });
    const thumb = view.runtime.render().commands.find(command => command.role === "slider-thumb");
    if (thumb?.type !== "circle") throw new Error("Missing slider thumb");
    const source = ray(); source.ray!.origin.y = 0.25 - thumb.cy / 200;
    send(ui, 1, "begin", source);
    mount(ui, "overlay", { mode: "overlay", bind: output => outputs.push(output) });
    source.ray!.origin.x = 1;
    send(ui, 2, undefined, source); send(ui, 3, "complete", source);
    expect(value).toBe(100);
    expect(outputs.filter(output => output.type === "change-request").map(output => output.phase)).toEqual(["begin", "update", "commit"]);
    expect(outputs.some(output => output.type === "action")).toBe(false);
    ui.dispose();
  });
});

describe("spatial occlusion", () => {
  it("supports an explicit blocker policy without blocking an overlay", () => {
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 }));
    wall.position.z = 1; scene.add(wall);
    const ui = createThreeUIEnvironment({ parent: scene, occlusion: { root: scene, blocks: hit => hit.object === wall } });
    const actions: RuntimeOutput[] = [];
    mount(ui, "base", { bind: output => actions.push(output) });
    send(ui, 1, "begin"); send(ui, 2, "complete"); expect(actions.some(output => output.type === "action")).toBe(false);
    mount(ui, "overlay", { mode: "overlay", bind: output => actions.push(output) });
    send(ui, 3, "begin"); send(ui, 4, "complete");
    expect(actions.filter(output => output.type === "action")).toEqual([expect.objectContaining({ actionId: "overlay" })]);
    ui.dispose(); wall.geometry.dispose(); wall.material.dispose();
  });
  it("blocks invisible spatial controls but permits them after the occluder is hidden", () => {
    const scene = new THREE.Scene(), group = new THREE.Group(); scene.add(group);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial());
    wall.position.z = 1; group.add(wall);
    const ui = createThreeUIEnvironment({ parent: scene }), actions: RuntimeOutput[] = [];
    mount(ui, "base", { bind: output => actions.push(output) });
    send(ui, 1, "begin"); send(ui, 2, "complete");
    expect(ui.interaction.getSnapshot("right")?.hit).toBeUndefined();
    expect(actions.some(output => output.type === "action")).toBe(false);
    group.visible = false; send(ui, 3, "begin"); send(ui, 4, "complete");
    expect(actions.filter(output => output.type === "action")).toHaveLength(1);
    ui.dispose(); wall.geometry.dispose(); wall.material.dispose();
  });

  it.each(["overlay", "transparent", "no-depth-write"] as const)("allows interaction with %s presentation", mode => {
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({
      transparent: mode === "transparent", opacity: mode === "transparent" ? 0.2 : 1, depthWrite: mode !== "no-depth-write"
    }));
    wall.position.z = 1; scene.add(wall);
    const ui = createThreeUIEnvironment({ parent: scene }), actions: RuntimeOutput[] = [];
    mount(ui, "base", { mode: mode === "overlay" ? "overlay" : "spatial", bind: output => actions.push(output) });
    send(ui, 1, "begin"); send(ui, 2, "complete");
    expect(actions.filter(output => output.type === "action")).toHaveLength(1);
    ui.dispose(); wall.geometry.dispose(); wall.material.dispose();
  });
});

it("keeps feedback endpoints, orientation and physical radius in world space under changing parents", () => {
  const parent = new THREE.Group(), ancestor = new THREE.Group(); ancestor.add(parent);
  ancestor.rotation.z = 0.2; ancestor.scale.set(2, 3, 0.5);
  const presenter = createThreePointerFeedback({ parent });
  const source = ray(), point = new THREE.Vector3(1, 2, -3);
  for (const x of [10, -4]) {
    parent.position.x = x; parent.rotation.y = x / 10;
    presenter.update([{ source, trackingValid: true, timestamp: 1, hit: { targetId: "p", point, distance: 5, local: { x: 0, y: 0 } },
      hover: undefined, pressed: undefined, capture: undefined, projection: undefined }]);
    ancestor.updateMatrixWorld(true);
    const marker = parent.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh;
    const beam = parent.children.find(child => child instanceof THREE.Line) as THREE.Line;
    expect(marker.getWorldPosition(new THREE.Vector3()).distanceTo(point)).toBeLessThan(1e-9);
    const positions = beam.geometry.getAttribute("position");
    expect(new THREE.Vector3().fromBufferAttribute(positions, 0).applyMatrix4(beam.matrixWorld).distanceTo(new THREE.Vector3().copy(source.ray!.origin))).toBeLessThan(1e-6);
    expect(new THREE.Vector3().fromBufferAttribute(positions, 1).applyMatrix4(beam.matrixWorld).distanceTo(point)).toBeLessThan(1e-6);
    const radius = new THREE.Vector3(0.0045, 0, 0).applyMatrix4(marker.matrixWorld).distanceTo(point);
    expect(radius).toBeCloseTo(0.0045, 9);
    expect(new THREE.Vector3(0, 0, 1).transformDirection(marker.matrixWorld).dot(new THREE.Vector3(0, 0, 1))).toBeCloseTo(1);
  }
  presenter.dispose(); expect(parent.children).toHaveLength(0);
});

it.each([false, true])("routes a fresh XR gesture after interruption, complete before sample=%s", completeBeforeSample => {
  const session = Object.assign(new EventTarget(), { inputSources: [{ targetRaySpace: {} }], visibilityState: "visible" });
  const controllers = [new THREE.Group(), new THREE.Group()]; let x = -1, clock = 0;
  const frame = { getPose: () => ({ transform: { matrix: new THREE.Matrix4().makeTranslation(x, 0, 2).elements } }) };
  const xr = Object.assign(new THREE.EventDispatcher(), { getSession: () => session, getReferenceSpace: () => ({}),
    getController: (index: number) => controllers[index]!, getFrame: () => frame });
  const input = createWebXRInteractionInput({ xr: xr as unknown as THREE.WebXRManager, now: () => ++clock });
  const ui = createThreeUIEnvironment({ parent: new THREE.Scene(), inputs: [input], ownsInputs: true });
  const actions: RuntimeOutput[] = [];
  for (const [id, position] of [["first", -1], ["second", 1]] as const) mount(ui, id, {
    placement: { panelWidth: 1, panelHeight: 0.5, position: { x: position, y: 0, z: 0 }, createCanvas: createFakeCanvas },
    bind: output => actions.push(output)
  });
  const emit = (type: string) => session.dispatchEvent(Object.assign(new Event(type), { inputSource: session.inputSources[0], frame }));
  emit("selectstart"); emit("selectend"); x = 1; emit("selectstart");
  if (completeBeforeSample) { emit("selectend"); emit("select"); }
  ui.update({ timestamp: clock + 1 });
  if (!completeBeforeSample) {
    expect(ui.interaction.getSnapshots().find(state => state.capture)?.capture?.targetId).toBe("second");
    clock += 2; emit("selectend"); emit("select"); ui.update({ timestamp: clock + 1 });
  }
  expect(actions.filter(output => output.type === "action")).toEqual([expect.objectContaining({ actionId: "second" })]);
  expect(ui.interaction.getSnapshots().some(state => state.capture)).toBe(false);
  ui.dispose();
});
