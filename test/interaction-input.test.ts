import { it, expect } from "vitest";
import * as THREE from "three";
import { createWebXRInteractionInput, createDesktopInteractionInput } from "../src/hosts/three.js";

it("uses successful XR select events, preserves short interactions and distinguishes interrupted selectend", () => {
  const session = Object.assign(new EventTarget(), { inputSources: [] as unknown[], visibilityState: "visible" });
  const controller = new THREE.Group();
  const xr = Object.assign(new THREE.EventDispatcher(), {
    getSession: () => session, getReferenceSpace: () => ({}), getController: () => controller
  });
  let now = 1;
  const adapter = createWebXRInteractionInput({ xr: xr as unknown as THREE.WebXRManager, now: () => now++ });
  const input = { targetRaySpace: {}, handedness: "right" };
  session.inputSources.push(input);
  const frame = { getPose: () => ({ transform: { matrix: new THREE.Matrix4().makeTranslation(1, 2, 3).elements } }) };
  const emit = (type: string) => session.dispatchEvent(Object.assign(new Event(type), { inputSource: input, frame }));
  emit("selectstart"); emit("selectend"); emit("select");
  const sample = adapter.sample({ timestamp: 5, xrFrame: frame as unknown as XRFrame });
  expect(sample.edges.map(e => e.phase)).toEqual(["begin", "complete"]);
  expect(sample.edges[0]?.source.ray?.origin).toMatchObject({ x: 1, y: 2, z: 3 });
  expect(sample.edges[0]?.source.id).toBe(sample.sources[0]?.id);
  emit("selectstart"); emit("selectend");
  expect(adapter.sample({ timestamp: 10 }).edges.map(e => e.phase)).toEqual(["begin", "cancel"]);
  session.visibilityState = "hidden"; session.dispatchEvent(new Event("visibilitychange"));
  expect(adapter.sample({ timestamp: 11 }).sources).toHaveLength(0);
  adapter.dispose(); emit("selectstart"); expect(adapter.sample({ timestamp: 12 }).edges).toHaveLength(0);
  emit("selectstart"); expect(adapter.sample({ timestamp: 13 }).edges).toHaveLength(0);
});

it("queues desktop edge coordinates and maps each canvas to its own local surface", () => {
  const element = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }),
    clientHeight: 50,
    setPointerCapture() {}, hasPointerCapture: () => false
  });
  let now = 0;
  const adapter = createDesktopInteractionInput({ element: element as unknown as HTMLElement,
    surface: { targetId: "panel", width: 200, height: 100 }, now: () => ++now });
  const emit = (type: string, clientX: number) => element.dispatchEvent(Object.assign(new Event(type), {
    pointerId: 7, pointerType: "mouse", button: 0, clientX, clientY: 45
  }));
  emit("pointerdown", 35); emit("pointerup", 85);
  const sample = adapter.sample({ timestamp: 5 });
  expect(sample.edges.map(e => e.source.surface?.x)).toEqual([50, 150]);
  expect(sample.sources[0]?.surface?.y).toBe(50);
  adapter.reset(); expect(adapter.sample({ timestamp: 6 }).edges[0]?.phase).toBe("cancel");
  adapter.dispose(); emit("pointerdown", 50); expect(adapter.sample({ timestamp: 7 }).edges).toHaveLength(0);
});

it("reprojects stationary desktop input through the current camera while preserving event poses", () => {
  const element = Object.assign(new EventTarget(), { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setPointerCapture() {}, hasPointerCapture: () => false });
  const camera = new THREE.PerspectiveCamera(); camera.position.z = 2;
  const input = createDesktopInteractionInput({ element: element as unknown as HTMLElement, camera, now: () => 1 });
  element.dispatchEvent(Object.assign(new Event("pointerdown"), { pointerId: 1, pointerType: "mouse", clientX: 50, clientY: 50, button: 0 }));
  camera.position.x = 3;
  const frame = input.sample({ timestamp: 2 });
  expect(frame.edges[0]?.source.ray?.origin.x).toBe(0);
  expect(frame.sources[0]?.ray?.origin.x).toBe(3);
  input.dispose();
});
