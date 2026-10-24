import { describe, it, expect } from "vitest";
import {
  createInteractionContext, createValueBinding,
  type InteractionSource, type InteractionInput, type InteractionTarget, type InteractionDelivery
} from "../src/interaction/index.js";
import { createButton, createDial, createSlider } from "../src/index.js";
import { createThreeUIEnvironment } from "../src/hosts/three.js";
import { createFakeCanvas } from "./helpers/fake-canvas.js";
import * as THREE from "three";

const source = (id = "ray", x = 0): InteractionSource => ({ id, tracked: true, pointerType: "controller", space: "world-metres",
  ray: { origin: { x, y: 0, z: 2 }, direction: { x: 0, y: 0, z: -1 } } });
function target(id: string, events: InteractionDelivery[], distance = 1): InteractionTarget {
  return { id, query: s => ({ targetId: id, subtargetId: s.ray!.origin.x < 0 ? "a" : "b", distance,
    local: { x: 0, y: 0 }, point: { x: 0, y: 0, z: 0 } }), deliver: e => events.push(e) };
}
const edge = (phase: InteractionInput["phase"], timestamp: number, input = source()): InteractionInput => ({ phase, timestamp, source: input });

describe("shared interaction authority", () => {
  it("arbitrates before dispatch and does not complete across semantic subtargets", () => {
    const context = createInteractionContext(); const front: InteractionDelivery[] = [], back: InteractionDelivery[] = [];
    context.register(target("back", back, 2)); context.register(target("front", front, 1));
    context.process(edge("begin", 1, source("ray", -1)));
    context.process(edge("complete", 2, source("ray", 1)));
    expect(front.map(e => e.type)).toContain("complete");
    expect(front.map(e => e.type)).not.toContain("activate");
    expect(back).toHaveLength(0);
    context.process(edge("begin", 3)); context.process(edge("complete", 4));
    expect(front.filter(e => e.type === "activate")).toHaveLength(1); context.dispose();
  });
  it("retains capture against higher priority targets, cancels removal once, and needs a fresh begin", () => {
    const context = createInteractionContext(); const events: InteractionDelivery[] = [];
    const remove = context.register(target("panel", events));
    context.process(edge("begin", 1));
    const back: InteractionDelivery[] = []; context.register({ ...target("modal", back), priority: 10 });
    context.process(edge("move", 2)); remove(); remove();
    context.process(edge("complete", 3));
    expect(events.filter(e => e.type === "cancel")).toHaveLength(1);
    expect(back.some(e => e.type === "activate")).toBe(false);
    context.process(edge("begin", 4)); context.process(edge("complete", 5));
    expect(back.filter(e => e.type === "activate")).toHaveLength(1); context.dispose();
  });
  it("preserves short ordered interactions and cancels omitted sources", () => {
    const context = createInteractionContext(); const events: InteractionDelivery[] = []; context.register(target("panel", events));
    context.frame(10, [source()], [edge("begin", 1), edge("complete", 2), edge("begin", 3)]);
    expect(events.filter(e => e.type === "activate")).toHaveLength(1);
    context.frame(11, []); context.frame(12, []);
    expect(events.filter(e => e.type === "cancel")).toHaveLength(1); context.dispose();
  });
  it("allows different editors, rejects contention, and resolves near/far in a hand", () => {
    const context = createInteractionContext(); const events: InteractionDelivery[] = []; context.register(target("panel", events));
    const a = source("a", -1), b = source("b", 1), c = source("c", 1);
    context.frame(1, [a, b, c], [edge("begin", 1, a), edge("begin", 1, b), edge("begin", 1, c)]);
    expect(context.getSnapshot("a")?.capture).toBeDefined(); expect(context.getSnapshot("b")?.capture).toBeDefined();
    expect(context.getSnapshot("c")?.capture).toBeUndefined(); context.dispose();
    const next = createInteractionContext(); next.register(target("panel", events));
    const near = { ...source("near"), group: "hand", precedence: 1 }, far = { ...source("far"), group: "hand" };
    next.frame(1, [near, far], [edge("begin", 1, far), edge("begin", 1, near)]);
    expect(next.getSnapshot("near")?.capture).toBeDefined(); expect(next.getSnapshot("far")?.capture).toBeUndefined(); next.dispose();
  });
});

describe("Three panel environment", () => {
  function fixture() {
    const scene = new THREE.Scene(); let applied = 50;
    const environment = createThreeUIEnvironment({ parent: scene });
    const phases: string[] = [];
    const panel = environment.mountPanel({ id: "panel", surface: { width: 200, height: 100 },
      content: () => createSlider("slider", { label: "Value", value: applied, min: 0, max: 100, field: "value" }),
      placement: { panelWidth: 1, panelHeight: 0.5, createCanvas: createFakeCanvas },
      bind(output) { if (output.type === "change-request") { phases.push(output.phase!); if (output.phase === "update") applied = Number(output.value); } } });
    const ray = (x: number, id = "ray") => ({ ...source(id), ray: { origin: { x: x / 200 - 0.5, y: 0.25 - 57 / 100 * 0.5, z: 2 }, direction: { x: 0, y: 0, z: -1 } } });
    const update = (time: number, x: number, phase?: InteractionInput["phase"]) => {
      const input = ray(x); environment.update({ timestamp: time, sources: [input], edges: phase ? [edge(phase, time, input)] : [] });
    };
    environment.update({ timestamp: 0 });
    return { scene, environment, panel, ray, update, phases, get applied() { return applied; } };
  }
  it("keeps applied thumb, fill and readout synchronized and blocks scene activation on release outside", () => {
    const f = fixture(); const events: InteractionDelivery[] = [];
    f.environment.registerTarget(target("scene", events, 4));
    expect(target("eligible", [], 4).query(f.ray(100))).not.toBeNull();
    f.update(1, 100, "begin"); f.update(2, 260); f.update(3, 260, "complete");
    expect(f.applied).toBe(100); expect(f.phases).toEqual(["begin", "update", "commit"]);
    expect(events.some(e => e.type === "begin" || e.type === "activate")).toBe(false);
    const commands = f.panel.runtime.render().commands;
    expect(commands.find(c => c.role === "slider-value")).toMatchObject({ text: "100" });
    const track = commands.find(c => c.role === "slider-track"), fill = commands.find(c => c.role === "slider-fill");
    expect(track?.type === "rect" && fill?.type === "rect" && track.rect.width === fill.rect.width).toBe(true);
    f.environment.dispose();
  });
  it("projects the current moving plane beyond bounds and cancels invalid projection once", () => {
    const f = fixture(); f.update(1, 100, "begin");
    f.panel.host.mesh.position.x = 0.2;
    f.update(2, 260);
    const state = f.environment.interaction.getSnapshot("ray")!;
    expect(state.projection?.local.x).toBeCloseTo(220); expect(state.projection?.distance).toBeCloseTo(2);
    const parallel = { ...f.ray(260), ray: { origin: { x: 0, y: 0, z: 2 }, direction: { x: 1, y: 0, z: 0 } } };
    f.environment.update({ timestamp: 3, sources: [parallel] });
    expect(f.phases.filter(p => p === "cancel")).toHaveLength(1);
    expect(f.environment.interaction.getSnapshot("ray")?.capture).toBeUndefined();
    f.environment.dispose();
  });
  it("mounts independent panels and a dial without per-panel input and releases pointer registrations", () => {
    const baseline = globalThis.pointerEventspointerMap?.size ?? 0;
    const f = fixture();
    const second = f.environment.mountPanel({ id: "second", content: createDial("dial", { label: "Dial", value: 5, min: 0, max: 10, field: "dial" }),
      placement: { position: { x: 2, y: 0, z: 0 }, createCanvas: createFakeCanvas } });
    f.update(1, 100, "begin"); f.panel.detach();
    expect(f.phases.at(-1)).toBe("cancel"); f.panel.attach();
    f.update(2, 100); expect(f.environment.interaction.getSnapshot("ray")?.capture).toBeUndefined();
    second.dispose(); f.environment.dispose(); f.environment.dispose();
    expect(globalThis.pointerEventspointerMap?.size ?? 0).toBe(baseline);
  });
  it("does not repaint unchanged panels for pointer feedback alone", () => {
    const scene = new THREE.Scene(); const env = createThreeUIEnvironment({ parent: scene });
    const view = env.mountPanel({ id: "p", content: createButton("button", { label: "Go", actionId: "go" }), placement: { createCanvas: createFakeCanvas } });
    env.update({ timestamp: 0 }); const version = view.host.texture.version;
    env.update({ timestamp: 1 }); env.update({ timestamp: 2 }); expect(view.host.texture.version).toBe(version); env.dispose();
  });
});

it("ignores stale asynchronous value results and makes rollback explicit", async () => {
  const resolve: ((n: number) => void)[] = [];
  const binding = createValueBinding({ value: 1, cancellation: "rollback", apply: () => new Promise<number>(r => resolve.push(r)) });
  binding.begin(); binding.request(2); binding.request(3);
  resolve[1]!(30); await Promise.resolve(); resolve[0]!(20); await Promise.resolve(); expect(binding.get().value).toBe(30);
  binding.cancel(); resolve[2]!(1); await Promise.resolve(); expect(binding.get().value).toBe(1);
  binding.request(4); binding.reconcile(8); resolve[3]!(4); await Promise.resolve(); expect(binding.get()).toEqual({ value: 8, pending: false, rejected: false }); binding.dispose();
});

it("arbitrates parent scrolling against child editing and cancels an editor on disable", async () => {
  const { createColumn, createScrollContainer, createRuntime } = await import("../src/index.js");
  const tree = (disabled = false) => createScrollContainer("scroll", { children: [
    createButton("first", { label: "Button", actionId: "activate" }),
    createSlider("slider", { label: "Value", field: "value", value: 50, min: 0, max: 100, disabled }),
    createColumn("rest", { children: Array.from({ length: 5 }, (_, i) => createButton(`b:${i}`, { label: "Button", actionId: "activate" })) })
  ] });
  const runtime = createRuntime({ root: tree(), surface: { width: 240, height: 160 } });
  let commands = runtime.render().commands;
  const thumb = commands.find(c => c.role === "slider-thumb"); if (thumb?.type !== "circle") throw new Error("Missing thumb");
  runtime.dispatchInput({ type: "pointer-down", timestamp: 1, surfaceX: thumb.cx, surfaceY: thumb.cy });
  runtime.dispatchInput({ type: "pointer-move", timestamp: 2, surfaceX: thumb.cx + 30, surfaceY: thumb.cy - 30 });
  expect(runtime.getServices().scroll.getState("scroll").offsetY).toBe(0);
  runtime.takeOutputs(); runtime.setRoot(tree(true));
  expect(runtime.takeOutputs()).toContainEqual(expect.objectContaining({ phase: "cancel" }));
  runtime.dispatchInput({ type: "cancel", timestamp: 3, surfaceX: thumb.cx, surfaceY: thumb.cy });
  const bounds = runtime.getBounds("first")!;
  const x = bounds.x + 10, y = bounds.y + 10;
  runtime.dispatchInput({ type: "pointer-down", timestamp: 4, surfaceX: x, surfaceY: y });
  runtime.dispatchInput({ type: "pointer-move", timestamp: 5, surfaceX: x, surfaceY: y - 60 });
  runtime.dispatchInput({ type: "pointer-up", timestamp: 6, surfaceX: x, surfaceY: y - 60 });
  expect(runtime.getServices().scroll.getState("scroll").offsetY).toBeGreaterThan(0);
  expect(runtime.takeOutputs().some(output => output.type === "action")).toBe(false);
  commands = runtime.render().commands; expect(commands.length).toBeGreaterThan(0); runtime.dispose();
});
